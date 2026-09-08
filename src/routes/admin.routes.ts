import { Router } from 'express';
import { AdminController } from '../controllers/AdminController';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { authenticatedLimiter } from '../middleware/rateLimit';
import { blockUserSchema, setUserPlanSchema, generateInviteCodesSchema } from '../schemas/admin.schema';

const ctrl = new AdminController();

// Montado em /api/v1/admin — prefixo próprio, não compartilhado com nenhum outro
// router, mas middleware por rota de qualquer forma (mesma disciplina adotada em
// todo o resto da API depois do bug de roteamento de 2026-09-04 — ver
// project_autogestor_routing_bug_2026-09-04 na memória).
const router = Router();

router.get('/stats',                    authMiddleware, authenticatedLimiter, adminMiddleware, asyncHandler((req, res) => ctrl.stats(req, res)));
router.get('/users',                    authMiddleware, authenticatedLimiter, adminMiddleware, asyncHandler((req, res) => ctrl.listUsers(req, res)));
router.get('/users/:id',                authMiddleware, authenticatedLimiter, adminMiddleware, asyncHandler((req, res) => ctrl.getUser(req, res)));
router.patch('/users/:id/block',        authMiddleware, authenticatedLimiter, adminMiddleware, validate(blockUserSchema), asyncHandler((req, res) => ctrl.blockUser(req, res)));
router.patch('/users/:id/plan',         authMiddleware, authenticatedLimiter, adminMiddleware, validate(setUserPlanSchema), asyncHandler((req, res) => ctrl.setUserPlan(req, res)));
router.delete('/users/:id',             authMiddleware, authenticatedLimiter, adminMiddleware, asyncHandler((req, res) => ctrl.deleteUser(req, res)));
router.get('/invite-codes',             authMiddleware, authenticatedLimiter, adminMiddleware, asyncHandler((req, res) => ctrl.listInviteCodes(req, res)));
router.post('/invite-codes',            authMiddleware, authenticatedLimiter, adminMiddleware, validate(generateInviteCodesSchema), asyncHandler((req, res) => ctrl.generateInviteCodes(req, res)));

export default router;
