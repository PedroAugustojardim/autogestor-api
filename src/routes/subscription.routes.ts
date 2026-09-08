import { Router } from 'express';
import { SubscriptionController } from '../controllers/SubscriptionController';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { authenticatedLimiter } from '../middleware/rateLimit';
import { checkoutSchema } from '../schemas/subscription.schema';

const ctrl = new SubscriptionController();

// Montado em /api/v1/subscriptions, no MESMO prefixo de subscriptionPublicRouter
// (mongtado logo abaixo) — middleware por rota, não `router.use(...)` em bloco.
// Um `.use()` sem path aqui rodaria também na rota pública (checkout-result,
// sem token), derrubando-a com 401 antes de chegar no router certo.
export const subscriptionRouter = Router();
subscriptionRouter.post('/checkout', authMiddleware, authenticatedLimiter, validate(checkoutSchema), asyncHandler((req, res) => ctrl.checkout(req, res)));
subscriptionRouter.get('/status', authMiddleware, authenticatedLimiter, asyncHandler((req, res) => ctrl.status(req, res)));

// Montado em /api/v1/subscriptions — público (redirect do navegador pós-checkout,
// não carrega o JWT do app).
export const subscriptionPublicRouter = Router();
subscriptionPublicRouter.get('/checkout-result', asyncHandler((req, res) => ctrl.checkoutResult(req, res)));

// Montado em /api/v1/webhooks — público, o Mercado Pago chama isso direto. Sem
// authMiddleware e sem rate limit (ver comentário no controller).
export const mercadoPagoWebhookRouter = Router();
mercadoPagoWebhookRouter.post('/mercadopago', asyncHandler((req, res) => ctrl.webhook(req, res)));
