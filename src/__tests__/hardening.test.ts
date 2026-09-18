import request from 'supertest';
import crypto from 'crypto';

// Regressões da auditoria de pentest de 2026-09-18 (rodada 2). Cada teste reproduz um
// ataque que funcionou antes da correção. Sem banco — todos falham/respondem antes de
// qualquer acesso a ele (CORS, parser, validação, assinatura).

const TEST_WEBHOOK_SECRET = 'test-webhook-secret-only-for-hardening-tests';

let app: import('express').Express;
let previousWebhookSecret: string | undefined;

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-only-for-hardening-tests';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  previousWebhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  process.env.MERCADO_PAGO_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
  process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  app = require('../app').default;
});

afterAll(() => {
  if (previousWebhookSecret === undefined) delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  else process.env.MERCADO_PAGO_WEBHOOK_SECRET = previousWebhookSecret;
});

describe('CORS: origem fora da allowlist', () => {
  it('recebe 403 limpo (antes: 500 + evento no Sentry por requisição)', async () => {
    const res = await request(app).get('/api/v1/health').set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('preflight de origem não permitida também dá 403', async () => {
    const res = await request(app)
      .options('/api/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(403);
  });

  it('Origin: null (iframe sandbox / file://) não é aceito', async () => {
    const res = await request(app).get('/api/v1/health').set('Origin', 'null');
    expect(res.status).toBe(403);
  });

  it('origem da allowlist continua funcionando, com credenciais', async () => {
    const res = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:5173');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('sem Origin (app mobile, curl, healthcheck do Railway) passa direto', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
  });

  it('POST cross-site em rota de cookie (CSRF em /auth/logout) é barrado antes da rota', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Origin', 'https://evil.example')
      .set('Cookie', 'refreshToken=qualquer')
      .send({});
    expect(res.status).toBe(403);
  });
});

describe('erros de parsing devolvem o status certo', () => {
  it('JSON malformado dá 400, não 500', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{bad json');
    expect(res.status).toBe(400);
  });

  it('corpo acima de 100kb dá 413, não 500', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(300_000) }));
    expect(res.status).toBe(413);
  });
});

describe('cookie de refresh com tipo inesperado', () => {
  // cookie-parser transforma `j:<json>` em objeto; isso estourava em hashToken (500).
  // Usa o refreshLimiter (20/min) — poucos requests aqui, sem risco de estourar.
  it.each([
    ['j:{"a":1}', 'objeto JSON'],
    ['j:[1,2]', 'array JSON'],
  ])('%s (%s) é tratado como "não fornecido": 400, sem tocar no banco', async (cookie) => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refreshToken=${cookie}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('webhook: valor assinado = valor processado', () => {
  const sign = (id: string, requestId: string, ts: number) =>
    `ts=${ts},v1=${crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(`id:${id};request-id:${requestId};ts:${ts};`).digest('hex')}`;

  it('data.id como array (assinatura válida só pro 1º elemento) dá 401', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const res = await request(app)
      .post('/api/v1/webhooks/mercadopago?data.id[]=123&data.id[]=999&type=payment')
      .set('x-signature', sign('123', 'req-poluido', ts))
      .set('x-request-id', 'req-poluido')
      .send({});
    expect(res.status).toBe(401);
  });

  it('assinatura válida com data.id string comum segue passando da validação', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const res = await request(app)
      .post('/api/v1/webhooks/mercadopago?data.id=123&type=merchant_order')
      .set('x-signature', sign('123', 'req-ok', ts))
      .set('x-request-id', 'req-ok')
      .send({});
    // type != payment → confirma recebimento sem processar (nunca chega no Mercado Pago)
    expect(res.status).toBe(200);
  });
});

describe('recordSecurityEvent: alerta com throttle', () => {
  const captureMessage = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    captureMessage.mockClear();
    jest.doMock('@sentry/node', () => ({ captureMessage }));
    jest.doMock('../utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.dontMock('@sentry/node');
    jest.dontMock('../utils/logger');
  });

  it('1 alerta por janela; o resto é abafado e contado no próximo', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { recordSecurityEvent } = require('../utils/securityEvent');

    for (let i = 0; i < 50; i++) recordSecurityEvent('webhook_signature_invalid', { requestId: `r${i}` }, { alert: true });
    expect(captureMessage).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(5 * 60_000 + 1);
    recordSecurityEvent('webhook_signature_invalid', { requestId: 'depois' }, { alert: true });
    expect(captureMessage).toHaveBeenCalledTimes(2);
    expect(captureMessage.mock.calls[1][1].extra.suppressedSinceLastAlert).toBe(49);
  });

  it('throttleKey separa a janela: flood de um limiter não abafa o alerta de outro', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { recordSecurityEvent } = require('../utils/securityEvent');

    for (let i = 0; i < 20; i++) recordSecurityEvent('rate_limit_exceeded', { limiter: 'login' }, { alert: true, throttleKey: 'login' });
    recordSecurityEvent('rate_limit_exceeded', { limiter: 'register' }, { alert: true, throttleKey: 'register' });
    expect(captureMessage).toHaveBeenCalledTimes(2);
  });

  it('sem alert:true nunca chama o Sentry (só trilha de auditoria)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { recordSecurityEvent } = require('../utils/securityEvent');
    for (let i = 0; i < 10; i++) recordSecurityEvent('admin_block_user', { adminId: 1 });
    expect(captureMessage).not.toHaveBeenCalled();
  });
});
