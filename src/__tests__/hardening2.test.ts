import request from 'supertest';
import jwt from 'jsonwebtoken';

// Regressões da rodada 3 do pentest (2026-09-18, contra MySQL real) + verificação de
// email. Sem banco: cobre a parte pura (schemas, códigos, conferência de pagamento) e o
// que responde antes de qualquer acesso ao banco (validação de id de rota, Zod).
// O fluxo completo com banco (corridas, IDOR, webhook simulado) está em pentest/harness2.js.

const TEST_JWT_SECRET = 'test-secret-only-for-hardening2-tests';
let app: import('express').Express;

beforeAll(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  app = require('../app').default;
});

const token = () => jwt.sign({ sub: 1, plano: 'gratuito', isAdmin: false }, TEST_JWT_SECRET, { algorithm: 'HS256', expiresIn: '15m' });
const adminToken = () => jwt.sign({ sub: 1, plano: 'gratuito', isAdmin: true }, TEST_JWT_SECRET, { algorithm: 'HS256', expiresIn: '15m' });

describe('ids de rota que não são inteiros dão 404, não 500 (NaN chegava no MySQL)', () => {
  it.each(['abc', 'NaN', 'Infinity', '-1', '1e0', '0x1', '99999999999', '1.5'])('/vehicles/%s', async (id) => {
    const res = await request(app).get(`/api/v1/vehicles/${id}`).set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(404);
  });

  it('cobre os outros routers: expenses, maintenance, reminders, reports, notifications e admin', async () => {
    const auth = { Authorization: `Bearer ${token()}` };
    const paths = [
      '/api/v1/vehicles/abc/expenses', '/api/v1/vehicles/1/expenses/abc', '/api/v1/vehicles/1/maintenance/abc',
      '/api/v1/vehicles/1/reminders/abc', '/api/v1/vehicles/abc/reports/monthly', '/api/v1/vehicles/abc/fines',
    ];
    for (const p of paths) expect((await request(app).get(p).set(auth)).status).toBe(404);
    expect((await request(app).patch('/api/v1/notifications/abc/read').set(auth)).status).toBe(404);
    expect((await request(app).get('/api/v1/admin/users/abc').set('Authorization', `Bearer ${adminToken()}`)).status).toBe(404);
  });

  it('id numérico válido segue passando pelo router (chega na autenticação → 401 sem token)', async () => {
    expect((await request(app).get('/api/v1/vehicles/1')).status).toBe(401);
  });
});

describe('verificação de email: validação antes do banco', () => {
  it.each([['12345'], ['abcdef'], ['1234567'], ['12 456'], [''], ['１２３４５６']])('código %j → 400', async (code) => {
    const res = await request(app).post('/api/v1/auth/verify-email').set('X-Forwarded-For', `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`).send({ email: 'a@b.co', code });
    expect(res.status).toBe(400);
  });

  it('code como array/objeto → 400', async () => {
    for (const code of [['123456'], { $ne: 1 }, 123456]) {
      const res = await request(app).post('/api/v1/auth/verify-email').set('X-Forwarded-For', `10.2.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`).send({ email: 'a@b.co', code });
      expect(res.status).toBe(400);
    }
  });

  it('resend-verification exige email válido', async () => {
    const res = await request(app).post('/api/v1/auth/resend-verification').set('X-Forwarded-For', '10.3.0.1').send({ email: 'nao-e-email' });
    expect(res.status).toBe(400);
  });
});

describe('código de verificação', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const v = require('../utils/verificationCode');

  it('tem sempre 6 dígitos, inclusive com zeros à esquerda', () => {
    const codes = Array.from({ length: 5000 }, () => v.generateVerificationCode());
    expect(codes.every((c: string) => /^\d{6}$/.test(c))).toBe(true);
    expect(codes.some((c: string) => c.startsWith('0'))).toBe(true);
  });

  it('não repete em sequência (CSPRNG, não contador)', () => {
    const codes = new Set(Array.from({ length: 200 }, () => v.generateVerificationCode()));
    expect(codes.size).toBeGreaterThan(150);
  });

  it('hash é amarrado ao usuário: mesmo código, usuários diferentes, hashes diferentes', () => {
    expect(v.hashVerificationCode(1, '123456')).not.toBe(v.hashVerificationCode(2, '123456'));
    expect(v.hashVerificationCode(1, '123456')).toBe(v.hashVerificationCode(1, '123456'));
    expect(v.hashVerificationCode(1, '123456')).toHaveLength(64);
  });
});

describe('schemas: tetos da coluna e datas de calendário', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createExpenseSchema, updateExpenseSchema } = require('../schemas/expense.schema');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createMaintenanceSchema } = require('../schemas/maintenance.schema');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { generateInviteCodesSchema } = require('../schemas/admin.schema');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { updateMeSchema, deleteAccountSchema } = require('../schemas/user.schema');
  const ok = { categoryId: 1, valor: 10, data: '2026-09-10' };

  it('gasto válido continua passando, inclusive nos extremos da coluna', () => {
    expect(createExpenseSchema.safeParse(ok).success).toBe(true);
    expect(createExpenseSchema.safeParse({ ...ok, valor: 99_999_999.99, kmAtual: 10_000_000, litros: 999.999, precoLitro: 999.999 }).success).toBe(true);
    expect(createExpenseSchema.safeParse({ ...ok, data: '2024-02-29' }).success).toBe(true);
  });

  it.each([
    ['data "abc"', { data: 'abc' }], ['data 2026-13-45', { data: '2026-13-45' }], ['data 0000-00-00', { data: '0000-00-00' }],
    ['data ISO com hora', { data: '2026-09-10T10:00:00Z' }], ['data 2026-9-1', { data: '2026-9-1' }], ['data 29/02 em ano comum', { data: '2026-02-29' }],
    ['valor 1e308', { valor: 1e308 }], ['valor "Infinity"', { valor: 'Infinity' }], ['valor acima do DECIMAL(10,2)', { valor: 100_000_000 }],
    ['kmAtual 1e12', { kmAtual: 1e12 }], ['litros acima do DECIMAL(6,3)', { litros: 1000 }], ['precoLitro acima do DECIMAL(6,3)', { precoLitro: 1e6 }],
  ])('gasto: %s → rejeitado (antes: 500 do MySQL)', (_n, patch) => {
    expect(createExpenseSchema.safeParse({ ...ok, ...(patch as object) }).success).toBe(false);
  });

  it('update de gasto tem os mesmos tetos', () => {
    expect(updateExpenseSchema.safeParse({ valor: 1e308 }).success).toBe(false);
    expect(updateExpenseSchema.safeParse({ data: 'abc' }).success).toBe(false);
  });

  it('manutenção: km e custo têm teto', () => {
    const m = { tipo: 'Troca de óleo', data: '2026-09-01' };
    expect(createMaintenanceSchema.safeParse(m).success).toBe(true);
    expect(createMaintenanceSchema.safeParse({ ...m, km: 1e12 }).success).toBe(false);
    expect(createMaintenanceSchema.safeParse({ ...m, custo: 1e12 }).success).toBe(false);
  });

  it('convite: diasValidade tem teto de 1 ano (antes virava Invalid Date sem expiração)', () => {
    expect(generateInviteCodesSchema.safeParse({ diasValidade: 365 }).success).toBe(true);
    expect(generateInviteCodesSchema.safeParse({ diasValidade: 99_999_999_999 }).success).toBe(false);
  });

  it('PUT /users/me não aceita mais trocar email: a chave é descartada', () => {
    const parsed = updateMeSchema.parse({ name: 'Novo Nome', email: 'roubado@evil.example', isAdmin: true });
    expect(parsed).toEqual({ name: 'Novo Nome' });
  });

  it('excluir conta exige a senha atual', () => {
    expect(deleteAccountSchema.safeParse({}).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ currentPassword: '' }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ currentPassword: 'x' }).success).toBe(true);
  });
});

describe('DELETE /users/me', () => {
  it('sem senha no corpo → 400 antes de qualquer acesso ao banco', async () => {
    const res = await request(app).delete('/api/v1/users/me').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(400);
  });
});

describe('webhook: pagamento só vale se bater com o que foi cobrado', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { paymentMatchesLog } = require('../controllers/SubscriptionController');
  const log = { valor: '119.90' };

  it('valor e moeda iguais → ok (inclusive número vindo como string)', () => {
    expect(paymentMatchesLog({ transaction_amount: 119.9, currency_id: 'BRL' }, log)).toBe(true);
    expect(paymentMatchesLog({ transaction_amount: '119.90', currency_id: 'BRL' }, log)).toBe(true);
  });

  it.each([
    ['valor menor (R$0,01)', { transaction_amount: 0.01, currency_id: 'BRL' }],
    ['valor do plano mensal no anual', { transaction_amount: 14.9, currency_id: 'BRL' }],
    ['moeda errada', { transaction_amount: 119.9, currency_id: 'USD' }],
    ['moeda ausente', { transaction_amount: 119.9 }],
    ['valor ausente', { currency_id: 'BRL' }],
    ['valor não numérico', { transaction_amount: 'abc', currency_id: 'BRL' }],
    ['valor nulo', { transaction_amount: null, currency_id: 'BRL' }],
  ])('%s → recusado', (_n, payment) => {
    expect(paymentMatchesLog(payment as never, log as never)).toBe(false);
  });
});

describe('mensagens de validação em português, com o nome do campo (o app mostra `details`)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('../schemas/errorMap');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createExpenseSchema } = require('../schemas/expense.schema');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createVehicleSchema } = require('../schemas/vehicle.schema');
  const ok = { categoryId: 1, valor: 10, data: '2026-09-10' };
  const firstMessage = (schema: { safeParse: (v: unknown) => { success: boolean; error?: { errors: { message: string }[] } } }, v: unknown) => {
    const r = schema.safeParse(v);
    return r.success ? null : r.error!.errors[0].message;
  };

  it('tetos numéricos dizem o campo e o limite, formatado em pt-BR', () => {
    expect(firstMessage(createExpenseSchema, { ...ok, valor: 1e9 })).toBe('Valor: deve ser no máximo 99.999.999,99');
    expect(firstMessage(createExpenseSchema, { ...ok, kmAtual: 1e12 })).toBe('KM: deve ser no máximo 10.000.000');
    expect(firstMessage(createExpenseSchema, { ...ok, litros: 1000 })).toBe('Litros: deve ser no máximo 999,999');
  });

  it('ano não ganha separador de milhar ("1900", não "1.900")', () => {
    expect(firstMessage(createVehicleSchema, { tipo: 'carro', marca: 'A', modelo: 'B', ano: 1800 })).toBe('Ano: deve ser no mínimo 1900');
  });

  it('mensagem própria do schema continua valendo (o error map não a sobrescreve)', () => {
    expect(firstMessage(createExpenseSchema, { ...ok, valor: 0 })).toBe('O valor deve ser maior que zero');
    expect(firstMessage(createExpenseSchema, { ...ok, data: '2026-02-30' })).toBe('Data: use o formato AAAA-MM-DD e informe uma data válida');
  });

  it('campo ausente e enum inválido saem em português', () => {
    expect(firstMessage(createVehicleSchema, { marca: 'A', modelo: 'B' })).toBe('Tipo: campo obrigatório');
    expect(firstMessage(createVehicleSchema, { tipo: 'aviao', marca: 'A', modelo: 'B' })).toBe('Tipo: valor não permitido');
  });

  it('só o 29/02 de ano COMUM é rejeitado; o de ano bissexto é uma data real e passa', () => {
    expect(createExpenseSchema.safeParse({ ...ok, data: '2028-02-29' }).success).toBe(true);
    expect(createExpenseSchema.safeParse({ ...ok, data: '2024-02-29' }).success).toBe(true);
    expect(createExpenseSchema.safeParse({ ...ok, data: '2026-02-29' }).success).toBe(false);
    expect(createExpenseSchema.safeParse({ ...ok, data: '2100-02-29' }).success).toBe(false); // 2100 não é bissexto
  });

  it('a resposta 400 da API carrega esses detalhes (o que o app passa a mostrar)', async () => {
    const res = await request(app)
      .post('/api/v1/vehicles/1/expenses')
      .set('Authorization', `Bearer ${token()}`)
      .send({ ...ok, valor: 1e9, kmAtual: 1e12 });
    expect(res.status).toBe(400);
    expect(res.body.details.map((d: { message: string }) => d.message)).toEqual(
      expect.arrayContaining(['Valor: deve ser no máximo 99.999.999,99', 'KM: deve ser no máximo 10.000.000']),
    );
  });
});
