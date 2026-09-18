import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  loginLimiter, registerLimiter, forgotPasswordLimiter, refreshLimiter,
  verifyEmailLimiter, resendVerificationLimiter,
} from '../middleware/rateLimit';
import {
  registerSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../schemas/auth.schema';

const router = Router();
const controller = new AuthController();

router.post('/register', registerLimiter, validate(registerSchema), asyncHandler((req, res) => controller.register(req, res)));
router.post('/verify-email', verifyEmailLimiter, validate(verifyEmailSchema), asyncHandler((req, res) => controller.verifyEmail(req, res)));
router.post('/resend-verification', resendVerificationLimiter, validate(resendVerificationSchema), asyncHandler((req, res) => controller.resendVerification(req, res)));
router.post('/login', loginLimiter, validate(loginSchema), asyncHandler((req, res) => controller.login(req, res)));
router.post('/refresh', refreshLimiter, validate(refreshSchema), asyncHandler((req, res) => controller.refresh(req, res)));
router.post('/logout', refreshLimiter, validate(logoutSchema), asyncHandler((req, res) => controller.logout(req, res)));
router.post('/forgot-password', forgotPasswordLimiter, validate(forgotPasswordSchema), asyncHandler((req, res) => controller.forgotPassword(req, res)));
router.post('/reset-password', forgotPasswordLimiter, validate(resetPasswordSchema), asyncHandler((req, res) => controller.resetPassword(req, res)));

export default router;
