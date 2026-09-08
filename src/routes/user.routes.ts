import { Router } from 'express';
import { UserController } from '../controllers/UserController';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { authenticatedLimiter } from '../middleware/rateLimit';
import {
  updateMeSchema,
  changePasswordSchema,
  updateNotificationsSchema,
} from '../schemas/user.schema';

const router = Router();
const controller = new UserController();

router.use(authMiddleware, authenticatedLimiter);

router.get('/me',                   asyncHandler((req, res) => controller.getMe(req, res)));
router.put('/me',                   validate(updateMeSchema),           asyncHandler((req, res) => controller.updateMe(req, res)));
router.delete('/me',                asyncHandler((req, res) => controller.deleteMe(req, res)));
router.put('/me/password',          validate(changePasswordSchema),     asyncHandler((req, res) => controller.changePassword(req, res)));
router.put('/me/notifications',     validate(updateNotificationsSchema),asyncHandler((req, res) => controller.updateNotifications(req, res)));

export default router;
