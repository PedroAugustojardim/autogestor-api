import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import * as dotenv from 'dotenv';

// Este módulo lê process.env.MERCADO_PAGO_ACCESS_TOKEN já na importação (abaixo),
// então não pode depender de outro módulo ter carregado o .env antes.
dotenv.config();

type PlanoPago = 'premium_mensal' | 'premium_anual';

// Preço/nome do plano vivem só aqui, no servidor — nunca confiar em valor vindo do
// client. O mobile mostra o mesmo preço só como cópia de tela, não como fonte de verdade.
const PLAN_PRICES: Record<PlanoPago, number> = {
  premium_mensal: 14.90,
  premium_anual: 119.90,
};

const PLAN_LABELS: Record<PlanoPago, string> = {
  premium_mensal: 'AutoGestor Premium Mensal',
  premium_anual: 'AutoGestor Premium Anual',
};

const client = process.env.MERCADO_PAGO_ACCESS_TOKEN
  ? new MercadoPagoConfig({ accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN })
  : null;

export function isMercadoPagoConfigured(): boolean {
  return client !== null;
}

export function getPlanPrice(plano: PlanoPago): number {
  return PLAN_PRICES[plano];
}

export async function createCheckoutPreference(
  paymentLogId: number,
  plano: PlanoPago,
  payerEmail: string,
) {
  if (!client) throw new Error('Mercado Pago não configurado (MERCADO_PAGO_ACCESS_TOKEN ausente)');

  const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const preference = new Preference(client);

  return preference.create({
    body: {
      items: [{
        id: plano,
        title: PLAN_LABELS[plano],
        quantity: 1,
        currency_id: 'BRL',
        unit_price: PLAN_PRICES[plano],
      }],
      payer: { email: payerEmail },
      // Correlaciona a notificação do webhook de volta pra esta linha — o id do
      // nosso PaymentLog, não um valor que o client controla.
      external_reference: String(paymentLogId),
      back_urls: {
        success: `${appUrl}/api/v1/subscriptions/checkout-result?status=success`,
        pending: `${appUrl}/api/v1/subscriptions/checkout-result?status=pending`,
        failure: `${appUrl}/api/v1/subscriptions/checkout-result?status=failure`,
      },
      auto_return: 'approved',
      notification_url: `${appUrl}/api/v1/webhooks/mercadopago`,
    },
  });
}

// Nunca confiar no corpo do webhook pro status do pagamento — sempre buscar de novo
// na API do Mercado Pago usando nosso access token (recomendação oficial deles).
export async function fetchPayment(paymentId: string) {
  if (!client) throw new Error('Mercado Pago não configurado (MERCADO_PAGO_ACCESS_TOKEN ausente)');
  const payment = new Payment(client);
  return payment.get({ id: paymentId });
}
