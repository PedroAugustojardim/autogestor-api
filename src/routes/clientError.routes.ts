import { Router } from 'express';
import { ClientErrorController } from '../controllers/ClientErrorController';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { authenticatedLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { reportClientErrorSchema } from '../schemas/clientError.schema';

const router = Router();
const ctrl = new ClientErrorController();

// Prefixo dedicado (/api/v1/client-errors), não compartilhado com nenhum outro
// router montado em app.ts — router.use() em bloco é seguro aqui pelo mesmo
// motivo que já é em notification.routes.ts.
router.use(authMiddleware, authenticatedLimiter);

router.post('/', validate(reportClientErrorSchema), asyncHandler((req, res) => ctrl.report(req, res)));

export default router;
