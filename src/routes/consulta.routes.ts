import { Router } from 'express';
import { ConsultaController } from '../controllers/ConsultaController';
import { authMiddleware } from '../middleware/auth';
import { requirePremium } from '../middleware/premium';
import { asyncHandler } from '../middleware/asyncHandler';
import { authenticatedLimiter } from '../middleware/rateLimit';

const ctrl = new ConsultaController();

// Montado em /api/v1/vehicles — middleware por rota, não `router.use(...)` em
// bloco. Isso já foi um bug real e grave: com `requirePremium` num `.use()` sem
// path, TODA requisição que entrasse neste router (inclusive `POST /vehicles`,
// `GET /vehicles/:id` etc., destinadas ao vehicleRoutes montado depois) tomava
// 403 de usuário gratuito antes de sequer chegar no router certo — quebrava
// cadastro/gestão de veículo pra todo usuário do plano gratuito.
export const consultaRouter = Router({ mergeParams: true });

consultaRouter.get('/:id/fines',   authMiddleware, authenticatedLimiter, requirePremium, asyncHandler((req, res) => ctrl.fines(req, res)));
consultaRouter.get('/:id/ipva',    authMiddleware, authenticatedLimiter, requirePremium, asyncHandler((req, res) => ctrl.ipva(req, res)));
consultaRouter.get('/:id/debts',   authMiddleware, authenticatedLimiter, requirePremium, asyncHandler((req, res) => ctrl.debts(req, res)));
consultaRouter.get('/:id/recalls', authMiddleware, authenticatedLimiter, requirePremium, asyncHandler((req, res) => ctrl.recalls(req, res)));
