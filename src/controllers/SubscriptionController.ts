import { Request, Response } from 'express';
import { WebhookSignatureValidator, InvalidWebhookSignatureError } from 'mercadopago';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';
import { PaymentLog } from '../entities/PaymentLog';
import { AuthRequest } from '../middleware/auth';
import { isMercadoPagoConfigured, getPlanPrice, createCheckoutPreference, fetchPayment } from '../services/mercadoPago';

const userRepo = () => AppDataSource.getRepository(User);
const paymentLogRepo = () => AppDataSource.getRepository(PaymentLog);

function firstHeaderValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export class SubscriptionController {
  // POST /subscriptions/checkout — inicia o checkout, nunca seta o plano direto.
  // O plano só muda quando o webhook confirmar o pagamento (ver `webhook` abaixo).
  async checkout(req: AuthRequest, res: Response): Promise<void> {
    if (!isMercadoPagoConfigured()) {
      res.status(503).json({ error: 'Pagamentos indisponíveis no momento. Tente novamente mais tarde.' });
      return;
    }

    const user = await userRepo().findOneBy({ id: req.userId! });
    if (!user) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }

    if (user.plano !== 'gratuito') {
      res.status(400).json({ error: 'Você já é assinante Premium' });
      return;
    }

    const { plano } = req.body as { plano: 'premium_mensal' | 'premium_anual' };

    const paymentLog = paymentLogRepo().create({
      userId: user.id,
      plano,
      valor: getPlanPrice(plano),
      status: 'pending',
    });
    await paymentLogRepo().save(paymentLog);

    try {
      const preference = await createCheckoutPreference(paymentLog.id, plano, user.email);
      await paymentLogRepo().update(paymentLog.id, { mercadoPagoPreferenceId: preference.id ?? null });

      const checkoutUrl = process.env.NODE_ENV === 'production'
        ? preference.init_point
        : (preference.sandbox_init_point ?? preference.init_point);

      res.json({ checkoutUrl });
    } catch (err) {
      // Preferência falhou ao ser criada — não deixa um PaymentLog "pending" órfão
      // que nunca vai receber webhook nenhum.
      await paymentLogRepo().update(paymentLog.id, { status: 'rejected' });
      throw err;
    }
  }

  // GET /subscriptions/status — o mobile faz polling nisso depois de abrir o
  // checkout no navegador, já que não há deep link pra voltar automaticamente pro app.
  async status(req: AuthRequest, res: Response): Promise<void> {
    const user = await userRepo().findOneBy({ id: req.userId! });
    if (!user) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }

    const pending = await paymentLogRepo().findOne({
      where: { userId: user.id, status: 'pending' },
      order: { createdAt: 'DESC' },
    });

    res.json({ plano: user.plano, pendingCheckout: !!pending });
  }

  // POST /webhooks/mercadopago — sem authMiddleware (o Mercado Pago não manda JWT
  // nosso) e sem rate limit por IP (limitar arriscaria descartar retries legítimos
  // deles; a proteção real aqui é a assinatura HMAC abaixo).
  async webhook(req: Request, res: Response): Promise<void> {
    const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    if (!secret) {
      console.error('[webhook mercadopago] MERCADO_PAGO_WEBHOOK_SECRET não configurada — recusando notificação');
      res.status(503).send();
      return;
    }

    try {
      WebhookSignatureValidator.validate({
        xSignature: firstHeaderValue(req.headers['x-signature'] as string | string[] | undefined),
        xRequestId: firstHeaderValue(req.headers['x-request-id'] as string | string[] | undefined),
        dataId: req.query['data.id'] as string | undefined,
        secret,
        toleranceSeconds: 300,
      });
    } catch (err) {
      if (err instanceof InvalidWebhookSignatureError) {
        console.error(`[webhook mercadopago] assinatura inválida (${err.reason}), request-id ${err.requestId}`);
        res.status(401).send();
        return;
      }
      throw err;
    }

    const type = (req.body?.type ?? req.query.type) as string | undefined;
    const dataId = (req.body?.data?.id ?? req.query['data.id']) as string | undefined;

    // Outros tipos de notificação (merchant_order etc.) — confirma recebimento sem
    // processar. QR Code também não é assinado e nunca chegaria a passar na validação acima.
    if (type !== 'payment' || !dataId) {
      res.status(200).send();
      return;
    }

    const mpPayment = await fetchPayment(String(dataId));
    const paymentLogId = Number(mpPayment.external_reference);
    const paymentLog = await paymentLogRepo().findOneBy({ id: paymentLogId });

    if (!paymentLog) {
      // Referência que não existe (nunca vai existir) — 200 pra não fazer o MP
      // re-tentar pra sempre; não é um erro transitório que vá se resolver sozinho.
      console.error(`[webhook mercadopago] PaymentLog ${paymentLogId} não encontrado para pagamento MP ${dataId}`);
      res.status(200).send();
      return;
    }

    // Idempotência: uma vez fora de "pending", nunca reprocessa — o MP entrega a
    // mesma notificação mais de uma vez (at-least-once) por garantia.
    if (paymentLog.status !== 'pending') {
      res.status(200).send();
      return;
    }

    const status = mpPayment.status;
    const newStatus: 'approved' | 'pending' | 'rejected' =
      status === 'approved' ? 'approved'
      : (status === 'pending' || status === 'in_process') ? 'pending'
      : 'rejected';

    if (newStatus !== 'pending') {
      await AppDataSource.transaction(async (manager) => {
        // Atômico (igual ao UPDATE...WHERE revoked=false do refresh token): o MP
        // entrega a mesma notificação mais de uma vez (at-least-once), então duas
        // entregas concorrentes podem passar pelo check `paymentLog.status !==
        // 'pending'` acima ao mesmo tempo. Só quem realmente move o status de
        // 'pending' pra outro valor é que grava o plano — a segunda chamada vê
        // affected === 0 e não repete a escrita em User.
        const result = await manager.createQueryBuilder()
          .update(PaymentLog)
          .set({ mercadoPagoPaymentId: String(dataId), status: newStatus })
          .where('id = :id AND status = :pending', { id: paymentLog.id, pending: 'pending' })
          .execute();

        if ((result.affected ?? 0) > 0 && newStatus === 'approved') {
          await manager.update(User, paymentLog.userId, { plano: paymentLog.plano });
        }
      });
    }

    res.status(200).send();
  }

  // GET /subscriptions/checkout-result — pra onde o navegador redireciona depois do
  // checkout (back_urls). Sem deep link no app, só avisa o usuário pra voltar
  // manualmente — quem realmente libera o Premium é o webhook, não este redirect.
  async checkoutResult(req: Request, res: Response): Promise<void> {
    const status = req.query.status === 'success' ? 'success'
      : req.query.status === 'pending' ? 'pending'
      : 'failure';

    const copy = {
      success: { icon: '✅', title: 'Pagamento recebido!', text: 'Seu Premium será ativado em instantes. Volte para o app AutoGestor.' },
      pending: { icon: '⏳', title: 'Pagamento em análise', text: 'Assim que for aprovado, seu Premium é ativado automaticamente. Você pode fechar esta página.' },
      failure: { icon: '❌', title: 'Pagamento não concluído', text: 'Não foi possível concluir o pagamento. Volte para o app para tentar novamente.' },
    }[status];

    res.status(200).send(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AutoGestor</title>
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; background: #F5F5F5; margin: 0;
         display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
  .card { background: #FFF; border-radius: 12px; padding: 32px; max-width: 360px; text-align: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  .icon { font-size: 48px; margin-bottom: 16px; }
  h1 { color: #1B5E20; font-size: 20px; margin: 0 0 8px; }
  p { color: #616161; font-size: 14px; line-height: 1.5; margin: 0; }
</style></head>
<body><div class="card">
  <div class="icon">${copy.icon}</div>
  <h1>${copy.title}</h1>
  <p>${copy.text}</p>
</div></body></html>`);
  }
}
