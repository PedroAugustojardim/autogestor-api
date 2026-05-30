import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthController } from '../controllers/AuthController';

const router = Router();
const controller = new AuthController();

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas. Aguarde 1 minuto.' },
  validate: { trustProxy: false }, // Railway usa proxy reverso; trust proxy definido em app.ts
});

router.post('/register', (req, res) => controller.register(req, res));
router.post('/login', loginLimiter, (req, res) => controller.login(req, res));
router.post('/refresh', (req, res) => controller.refresh(req, res));
router.post('/logout', (req, res) => controller.logout(req, res));
router.post('/forgot-password', (req, res) => controller.forgotPassword(req, res));
router.post('/reset-password', (req, res) => controller.resetPassword(req, res));

export default router;
