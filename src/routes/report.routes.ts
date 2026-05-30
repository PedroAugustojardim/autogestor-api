import { Router } from 'express';
import { ReportController } from '../controllers/ReportController';
import { authMiddleware } from '../middleware/auth';

const ctrl = new ReportController();
const router = Router({ mergeParams: true });

router.use(authMiddleware);
router.get('/:id/reports/monthly',      (req, res) => ctrl.monthly(req, res));
router.get('/:id/reports/categories',   (req, res) => ctrl.byCategory(req, res));
router.get('/:id/reports/fuel',         (req, res) => ctrl.fuel(req, res));
router.get('/:id/reports/summary-year', (req, res) => ctrl.yearSummary(req, res));

export default router;
