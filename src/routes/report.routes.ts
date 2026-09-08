import { Router } from 'express';
import { ReportController } from '../controllers/ReportController';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { authenticatedLimiter } from '../middleware/rateLimit';

const ctrl = new ReportController();
const router = Router({ mergeParams: true });

// Middleware por rota, não `router.use(...)` em bloco — este router compartilha o
// prefixo /api/v1/vehicles com outros routers; um `.use()` sem path rodaria em
// qualquer request que entrasse aqui, inclusive as destinadas aos outros routers.
router.get('/:id/reports/monthly',      authMiddleware, authenticatedLimiter, asyncHandler((req, res) => ctrl.monthly(req, res)));
router.get('/:id/reports/categories',   authMiddleware, authenticatedLimiter, asyncHandler((req, res) => ctrl.byCategory(req, res)));
router.get('/:id/reports/fuel',         authMiddleware, authenticatedLimiter, asyncHandler((req, res) => ctrl.fuel(req, res)));
router.get('/:id/reports/summary-year', authMiddleware, authenticatedLimiter, asyncHandler((req, res) => ctrl.yearSummary(req, res)));
router.get('/:id/reports/pdf',          authMiddleware, authenticatedLimiter, asyncHandler((req, res) => ctrl.pdf(req, res)));

export default router;
