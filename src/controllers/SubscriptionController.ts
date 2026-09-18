import { Request, Response } from 'express';
import { MoreThan } from 'typeorm';
import { WebhookSignatureValidator, InvalidWebhookSignatureError } from 'mercadopago';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';
import { PaymentLog } from '../entities/PaymentLog';
import { AuthRequest } from '../middleware/auth';
import { isMercadoPagoConfigured, getPlanPrice, createCheckoutPreference, fetchPayment } from '../services/mercadoPago';
import { recordSecurityEvent } from '../utils/securityEvent';
import { logger } from '../utils/logger';

const userRepo = () => AppDataSource.getRepository(User);
const paymentLogRepo = () => AppDataSource.getRepository(PaymentLog);

function firstHeaderValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

// O valor do pagamento (BRL, 2 casas) tem que ser o que gravamos no PaymentLog ao criar a
// preferência. Tolerância de meio centavo só pra float; moeda ausente ou diferente de BRL
// não passa (a preferência é sempre criada em BRL — ver createCheckoutPreference).
export function paymentMatchesLog(
  mpPayment: { transaction_amount?: number | string | null; currency_id?: string | null },
  paymentLog: PaymentLog,
): boolean {
  const paid = Number(mpPayment.transaction_amount);
  return Number.isFinite(paid)
    && Math.abs(paid - Number(paymentLog.valor)) < 0.005
    && mpPayment.currency_id === 'BRL';
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

    // Cada clique cria uma linha de PaymentLog E uma preferência na API do Mercado Pago
    // (recurso pago de terceiro, com limite de taxa na nossa conta). Sem teto, qualquer
    // usuário gratuito no limite genérico de 100 req/min fabricava ~100 preferências/min
    // (reproduzido: 8 cliques = 8 logs pendentes). Uma pessoa de verdade não inicia mais de
    // 3 checkouts em 10 minutos; quem já tem pendentes recentes conclui um deles.
    const recentPending = await paymentLogRepo().count({
      where: { userId: user.id, status: 'pending', createdAt: MoreThan(new Date(Date.now() - 10 * 60_000)) },
    });
    if (recentPending >= 3) {
      res.status(429).json({ error: 'Você já iniciou pagamentos recentes. Conclua um deles ou tente novamente em alguns minutos.' });
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
      logger.error('[webhook mercadopago] MERCADO_PAGO_WEBHOOK_SECRET não configurada — recusando notificação');
      res.status(503).send();
      return;
    }

    // Mesmo valor usado na validação da assinatura abaixo — o corpo do POST não é
    // assinado pelo Mercado Pago, só a query string é. Usar um dataId diferente
    // pra processar (ex.: preferindo o body) abriria brecha pra um corpo alterado
    // depois da assinatura ainda ser aceito, mesmo a assinatura sendo válida.
    //
    // Só aceita string. `?data.id[]=123&data.id[]=999` chega como array, e a lib do MP
    // valida a assinatura contra o PRIMEIRO elemento ("123") enquanto o `String(dataId)`
    // lá embaixo virava "123,999" — o valor autenticado e o valor usado divergiam de
    // novo, pela porta dos fundos. Não-string vira `undefined`, o que muda o manifesto
    // assinado (o par `id:` some) e a assinatura deixa de bater → 401.
    const rawDataId = req.query['data.id'];
    const dataId = typeof rawDataId === 'string' ? rawDataId : undefined;

    try {
      WebhookSignatureValidator.validate({
        xSignature: firstHeaderValue(req.headers['x-signature'] as string | string[] | undefined),
        xRequestId: firstHeaderValue(req.headers['x-request-id'] as string | string[] | undefined),
        dataId,
        secret,
        toleranceSeconds: 300,
      });
    } catch (err) {
      if (err instanceof InvalidWebhookSignatureError) {
        recordSecurityEvent(
          'webhook_signature_invalid',
          { reason: err.reason, requestId: err.requestId },
          { alert: true },
        );
        res.status(401).send();
        return;
      }
      throw err;
    }

    const type = (req.body?.type ?? req.query.type) as string | undefined;

    // Outros tipos de notificação (merchant_order etc.) — confirma recebimento sem
    // processar. QR Code também não é assinado e nunca chegaria a passar na validação acima.
    if (type !== 'payment' || !dataId) {
      res.status(200).send();
      return;
    }

    const mpPayment = await fetchPayment(String(dataId));
    // external_reference é o id do nosso PaymentLog, mas vem como texto livre do MP —
    // ausente/"abc" virava NaN e o driver do MySQL respondia com erro de SQL (500), e um
    // 500 faz o MP re-tentar essa notificação por horas, sem nunca poder dar certo.
    const paymentLogId = Number(mpPayment.external_reference);
    if (!Number.isInteger(paymentLogId) || paymentLogId <= 0) {
      logger.error({ externalReference: mpPayment.external_reference, dataId }, '[webhook mercadopago] external_reference inválido');
      res.status(200).send();
      return;
    }
    const paymentLog = await paymentLogRepo().findOneBy({ id: paymentLogId });

    if (!paymentLog) {
      // Referência que não existe (nunca vai existir) — 200 pra não fazer o MP
      // re-tentar pra sempre; não é um erro transitório que vá se resolver sozinho.
      logger.error({ paymentLogId, dataId }, '[webhook mercadopago] PaymentLog não encontrado para pagamento MP');
      res.status(200).send();
      return;
    }

    // Idempotência: 'approved' é o único estado final — o MP entrega a mesma notificação
    // mais de uma vez (at-least-once) e uma segunda entrega nunca reprocessa. 'rejected'
    // NÃO é final: no checkout do MP o cliente pode tentar de novo na MESMA preferência
    // (outro cartão depois de uma recusa), e cada tentativa é um pagamento novo com o mesmo
    // external_reference. Tratar 'rejected' como terminal fazia quem pagou na 2ª tentativa
    // ser cobrado e nunca receber o Premium (reproduzido em teste).
    if (paymentLog.status === 'approved') {
      res.status(200).send();
      return;
    }

    const status = mpPayment.status;
    const newStatus: 'approved' | 'pending' | 'rejected' =
      status === 'approved' ? 'approved'
      : (status === 'pending' || status === 'in_process') ? 'pending'
      : 'rejected';

    // Um 'rejected' repetido (ou tardio, chegando depois de um 'approved' de outra
    // tentativa) não muda nada.
    if (newStatus === 'rejected' && paymentLog.status === 'rejected') {
      res.status(200).send();
      return;
    }

    // Nunca liberar o plano por um pagamento que não bate com o que foi cobrado. O preço vive
    // só no servidor, então em condições normais isto sempre bate — é defesa em profundidade
    // contra um pagamento de outro valor/moeda amarrado a este external_reference. Não vira
    // 'rejected' (não sabemos o que houve): fica pendente + alerta pra conferência manual, e
    // responde 200 pra o MP não re-tentar algo que não vai mudar.
    if (newStatus === 'approved' && !paymentMatchesLog(mpPayment, paymentLog)) {
      recordSecurityEvent(
        'payment_amount_mismatch',
        {
          paymentLogId, dataId,
          expected: Number(paymentLog.valor), receivedAmount: mpPayment.transaction_amount, receivedCurrency: mpPayment.currency_id,
        },
        { alert: true },
      );
      res.status(200).send();
      return;
    }

    if (newStatus !== 'pending') {
      await AppDataSource.transaction(async (manager) => {
        // Atômico (igual ao UPDATE...WHERE revoked=false do refresh token): o MP
        // entrega a mesma notificação mais de uma vez (at-least-once), então duas
        // entregas concorrentes podem passar pelo check de status acima ao mesmo
        // tempo. Só quem realmente move o status é que grava o plano — a segunda
        // chamada vê affected === 0 e não repete a escrita em User. 'approved' pode
        // sair de pending OU de rejected (retentativa); 'rejected' só de pending.
        const fromStatuses = newStatus === 'approved' ? ['pending', 'rejected'] : ['pending'];
        const result = await manager.createQueryBuilder()
          .update(PaymentLog)
          .set({ mercadoPagoPaymentId: String(dataId), status: newStatus })
          .where('id = :id AND status IN (:...fromStatuses)', { id: paymentLog.id, fromStatuses })
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
