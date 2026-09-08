import request from 'supertest';
import jwt from 'jsonwebtoken';

// Regressão do bug crítico encontrado em revisão (2026-09-04): routers montados
// no mesmo prefixo com `router.use(middleware)` SEM path (`categoryRouter` em
// `/api/v1` puro, `consultaRouter`/`subscriptionRouter` com `requirePremium`/
// `authMiddleware` em bloco) faziam esse middleware rodar em QUALQUER request que
// entrasse no router, mesmo sem nenhuma rota dele bater — derrubando o webhook do
// Mercado Pago (nunca alcançável) e bloqueando usuários gratuitos de gerenciar
// veículos. A correção move auth/rate-limit/premium para middleware por rota.
// Estes testes não precisam de banco — os pontos verificados falham antes de
// qualquer acesso ao banco (checagem de secret, validação Zod, ou authMiddleware,
// que só verifica o JWT).

const TEST_JWT_SECRET = 'test-secret-only-for-routing-regression-tests';

let app: import('express').Express;

beforeAll(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  app = require('../app').default;
});

function forgeAccessToken(overrides: Partial<{ sub: number; plano: string; isAdmin: boolean }> = {}) {
  return jwt.sign(
    { sub: 1, plano: 'gratuito', isAdmin: false, ...overrides },
    TEST_JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '15m' },
  );
}

describe('roteamento — /api/v1/webhooks e /api/v1/subscriptions (públicos)', () => {
  it('webhook do Mercado Pago é alcançável mesmo sem Authorization — não pode ser interceptado por categoryRouter', async () => {
    const res = await request(app).post('/api/v1/webhooks/mercadopago').send({ type: 'payment', data: { id: '123' } });
    // 503 = chegou no handler de verdade e recusou por falta de MERCADO_PAGO_WEBHOOK_SECRET.
    // 401 indicaria que foi barrado por auth de outro router antes de chegar aqui — o bug original.
    expect(res.status).toBe(503);
  });

  it('checkout-result é alcançável sem Authorization — não pode ser interceptado por categoryRouter/subscriptionRouter', async () => {
    const res = await request(app).get('/api/v1/subscriptions/checkout-result?status=success');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Pagamento recebido');
  });
});

describe('roteamento — /api/v1/vehicles (consultaRouter não pode capturar rotas de outros routers)', () => {
  it('POST /vehicles com corpo inválido dá 400 de validação — prova que chegou no vehicleRoutes, não foi bloqueado 403/500 antes por requirePremium', async () => {
    const token = forgeAccessToken({ plano: 'gratuito' });
    const res = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .send({}); // corpo vazio — tipo/marca/modelo obrigatórios ausentes
    expect(res.status).toBe(400);
  });

  it('GET /vehicles sem Authorization dá 401 (não 403) — prova que não passou pelo requirePremium do consultaRouter antes de chegar no authMiddleware do vehicleRoutes', async () => {
    const res = await request(app).get('/api/v1/vehicles');
    expect(res.status).toBe(401);
  });

  it('rotas de consulta (Premium) continuam exigindo Authorization', async () => {
    const res = await request(app).get('/api/v1/vehicles/1/fines');
    expect(res.status).toBe(401);
  });

  it('rota inexistente sob /vehicles não é silenciosamente aceita por nenhum router', async () => {
    const token = forgeAccessToken();
    const res = await request(app)
      .get('/api/v1/vehicles/1/rota-que-nao-existe')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('roteamento — /api/v1/expense-categories (categoryRouter remontado em prefixo específico)', () => {
  it('exige Authorization normalmente (não ficou público por engano ao mudar o mount)', async () => {
    const res = await request(app).get('/api/v1/expense-categories');
    expect(res.status).toBe(401);
  });
});

describe('roteamento — /api/v1/admin (Etapa 9, prefixo próprio, exige admin)', () => {
  it('sem Authorization dá 401', async () => {
    const res = await request(app).get('/api/v1/admin/stats');
    expect(res.status).toBe(401);
  });

  it('usuário autenticado mas não-admin dá 403, não passa despercebido', async () => {
    const token = forgeAccessToken({ isAdmin: false });
    const res = await request(app).get('/api/v1/admin/stats').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('admin autenticado passa da checagem de auth/admin (falha depois, sem banco — prova que chegou no handler certo)', async () => {
    const token = forgeAccessToken({ isAdmin: true });
    const res = await request(app).get('/api/v1/admin/stats').set('Authorization', `Bearer ${token}`);
    // 500 aqui é esperado (sem banco nos testes) — o que importa é NÃO ser 401/403.
    expect(res.status).toBe(500);
  });

  it('POST /admin/invite-codes com corpo inválido dá 400 antes de tocar no banco', async () => {
    const token = forgeAccessToken({ isAdmin: true });
    const res = await request(app)
      .post('/api/v1/admin/invite-codes')
      .set('Authorization', `Bearer ${token}`)
      .send({ quantidade: 999 }); // acima do máximo de 50
    expect(res.status).toBe(400);
  });
});
