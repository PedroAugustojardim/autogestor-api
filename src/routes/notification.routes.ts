import { Router } from 'express';
import { NotificationController } from '../controllers/NotificationController';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { validateIdParams } from '../middleware/validateParams';
import { authenticatedLimiter } from '../middleware/rateLimit';

const router = Router();
validateIdParams(router);
const ctrl = new NotificationController();

router.use(authMiddleware, authenticatedLimiter);

router.get('/',              asyncHandler((req, res) => ctrl.list(req, res)));
router.get('/unread-count',  asyncHandler((req, res) => ctrl.unreadCount(req, res)));
router.patch('/read-all',    asyncHandler((req, res) => ctrl.markAllRead(req, res)));
router.patch('/:id/read',    asyncHandler((req, res) => ctrl.markRead(req, res)));

export default router;
