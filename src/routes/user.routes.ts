import { Router } from 'express';
import { UserController } from '../controllers/UserController';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const controller = new UserController();

router.use(authMiddleware);

router.get('/me', (req, res) => controller.getMe(req, res));
router.put('/me', (req, res) => controller.updateMe(req, res));
router.delete('/me', (req, res) => controller.deleteMe(req, res));

export default router;
