import rateLimit from 'express-rate-limit';
import { Request } from 'express';
import { AuthRequest } from './auth';

// HISTÓRICO IMPORTANTE — leia antes de mexer aqui:
// Este projeto já teve rate limiting via express-rate-limit em produção (Railway) e ele foi
// REMOVIDO depois de derrubar o processo repetidamente (commits 1a5a526..0c23dfc). Causa raiz
// documentada no commit 0c23dfc: o Nixpacks do Railway mantinha node_modules em cache com a
// v7 da lib mesmo depois do package.json já pedir v6 — v7 lança ValidationError fatal ao ver
// o X-Forwarded-For do proxy reverso do Railway, mesmo com trust proxy configurado.
// Mitigações aplicadas aqui para não repetir o problema:
//   1. `express-rate-limit` fixado em versão EXATA (sem ^) no package.json — elimina ambiguidade
//      de qual major o npm resolve.
//   2. `validate: false` abaixo — desliga a checagem interna que lança o erro fatal (mesma
//      mitigação do commit e1180e9, aplicada agora em todos os limiters, não só no login).
//   3. `railway.toml` volta a forçar `rm -rf node_modules` no build, pra nunca reaproveitar um
//      node_modules cacheado com a versão errada.
//   4. O catch de ERR_ERL_UNEXPECTED_X_FORWARDED_FOR em index.ts continua como rede de segurança.
// Mesmo assim, isso NUNCA foi testado contra o Railway de verdade (conta expirada) — tratar o
// primeiro deploy como canário: acompanhar os logs do healthcheck e de /auth/login de perto.
const limiterResponse = (error: string) => ({
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: { error },
});

export const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  ...limiterResponse('Muitas tentativas de login. Tente novamente em 1 minuto.'),
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  ...limiterResponse('Muitas tentativas de cadastro. Tente novamente em 1 hora.'),
});

export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  ...limiterResponse('Muitas tentativas. Tente novamente em 1 hora.'),
});

// /auth/refresh e /auth/logout são pré-auth (ainda não tem req.userId, então não dá
// pra usar authenticatedLimiter) e ficaram sem limiter nenhum até agora. Limite
// generoso — refresh acontece automaticamente em uso normal do app, várias abas/
// dispositivos atrás do mesmo IP/NAT não podem esbarrar nisso à toa.
export const refreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  ...limiterResponse('Muitas requisições. Tente novamente em 1 minuto.'),
});

// Aplicado depois de authMiddleware nas rotas autenticadas — chave por usuário, não por IP,
// já que a essa altura já sabemos quem está logado (uma rede corporativa/NAT não compartilha cota).
export const authenticatedLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  keyGenerator: (req: Request) => String((req as AuthRequest).userId),
  ...limiterResponse('Muitas requisições. Tente novamente em 1 minuto.'),
});
