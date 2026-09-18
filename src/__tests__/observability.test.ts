import request from 'supertest';
import jwt from 'jsonwebtoken';

// Cobre a camada de detecção (plano de 2026-09-18): eventos de segurança e o
// endpoint que recebe erro de cliente. Sem banco — todos os pontos falham/respondem
// antes de qualquer acesso ao banco (limiter, validação Zod, JWT, assinatura).

const TEST_JWT_SECRET = 'test-secret-only-for-observability-tests';
const TEST_WEBHOOK_SECRET = 'test-webhook-secret-only-for-observability-tests';

const recordSecurityEvent = jest.fn();
let app: import('express').Express;
let previousWebhookSecret: string | undefined;

beforeAll(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  previousWebhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  process.env.MERCADO_PAGO_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
  jest.resetModules();
  jest.doMock('../utils/securityEvent', () => ({ recordSecurityEvent }));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  app = require('../app').default;
});

afterAll(() => {
  if (previousWebhookSecret === undefined) delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  else process.env.MERCADO_PAGO_WEBHOOK_SECRET = previousWebhookSecret;
  jest.dontMock('../utils/securityEvent');
});

function forgeAccessToken() {
  return jwt.sign({ sub: 1, plano: 'gratuito', isAdmin: false }, TEST_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '15m',
  });
}

describe('POST /api/v1/client-errors', () => {
  it('sem Authorization dá 401 — endpoint não pode ser aberto a qualquer um', async () => {
    const res = await request(app)
      .post('/api/v1/client-errors')
      .send({ message: 'x', platform: 'mobile' });
    expect(res.status).toBe(401);
  });

  it('corpo inválido dá 400 antes de chegar no controller', async () => {
    const res = await request(app)
      .post('/api/v1/client-errors')
      .set('Authorization', `Bearer ${forgeAccessToken()}`)
      .send({ message: '', platform: 'desktop' });
    expect(res.status).toBe(400);
  });

  it('corpo válido dá 204', async () => {
    const res = await request(app)
      .post('/api/v1/client-errors')
      .set('Authorization', `Bearer ${forgeAccessToken()}`)
      .send({ message: 'TypeError: undefined is not a function', stack: 'at foo', platform: 'mobile', context: 'HomeScreen' });
    expect(res.status).toBe(204);
  });
});

describe('rate limit registra evento de segurança', () => {
  it('estourar o loginLimiter (6ª tentativa) dá 429 e registra rate_limit_exceeded com alert:true', async () => {
    recordSecurityEvent.mockClear();

    let last = 0;
    for (let i = 0; i < 6; i++) {
      // corpo vazio: o limiter roda antes da validação, então nenhuma tentativa toca o banco
      const res = await request(app).post('/api/v1/auth/login').send({});
      last = res.status;
    }

    expect(last).toBe(429);
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      'rate_limit_exceeded',
      expect.objectContaining({ limiter: 'login', path: '/login' }),
      { alert: true },
    );
  });

  it('a resposta 429 mantém a mesma mensagem de antes (o handler só acrescentou o registro)', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({});
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'Muitas tentativas de login. Tente novamente em 1 minuto.' });
  });
});

describe('webhook do Mercado Pago', () => {
  it('assinatura forjada dá 401 e registra webhook_signature_invalid com alert:true', async () => {
    recordSecurityEvent.mockClear();

    const res = await request(app)
      .post('/api/v1/webhooks/mercadopago?data.id=123')
      .set('x-signature', `ts=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}`)
      .set('x-request-id', 'req-forjado')
      .send({ type: 'payment', data: { id: '123' } });

    expect(res.status).toBe(401);
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      'webhook_signature_invalid',
      expect.objectContaining({ requestId: 'req-forjado' }),
      { alert: true },
    );
  });
});
