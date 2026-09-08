import { Router } from 'express';
import { ExpenseController } from '../controllers/ExpenseController';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { authenticatedLimiter } from '../middleware/rateLimit';
import { createExpenseSchema, updateExpenseSchema } from '../schemas/expense.schema';

const ctrl = new ExpenseController();

// Montado em /api/v1/expense-categories (prefixo específico, não /api/v1 puro —
// um `.use()` sem path casa com QUALQUER coisa que entra no router, e /api/v1 é
// prefixo de toda rota do sistema; isso já bloqueou de verdade o webhook do
// Mercado Pago e a página pública de checkout-result antes de ser corrigido aqui).
export const categoryRouter = Router();
categoryRouter.get('/', authMiddleware, authenticatedLimiter, asyncHandler((req, res) => ctrl.listCategories(req, res)));

// Rotas de gastos — montadas em /api/v1/vehicles, prefixo compartilhado com
// vehicleRoutes/reportRoutes/maintenanceRouter/reminderRouter/consultaRouter.
// Middleware por rota (não `router.use(...)` em bloco): um `.use()` sem path roda
// pra QUALQUER path que entra no router, então rodaria também nas rotas dos
// outros routers montados no mesmo prefixo — decorrência auth/rate-limit
// repetida à toa (a cada barra decrementava a mesma cota por usuário várias
// vezes numa só requisição lógica).
export const expenseRouter = Router({ mergeParams: true });
expenseRouter.post('/:id/expenses',         authMiddleware, authenticatedLimiter, validate(createExpenseSchema), asyncHandler((req, res) => ctrl.create(req, res)));
expenseRouter.get('/:id/expenses/summary',  authMiddleware, authenticatedLimiter, asyncHandler((req, res) => ctrl.summary(req, res)));
expenseRouter.get('/:id/expenses',          authMiddleware, authenticatedLimiter, asyncHandler((req, res) => ctrl.list(req, res)));
expenseRouter.get('/:id/expenses/:eid',     authMiddleware, authenticatedLimiter, asyncHandler((req, res) => ctrl.findOne(req, res)));
expenseRouter.put('/:id/expenses/:eid',     authMiddleware, authenticatedLimiter, validate(updateExpenseSchema), asyncHandler((req, res) => ctrl.update(req, res)));
expenseRouter.delete('/:id/expenses/:eid',  authMiddleware, authenticatedLimiter, asyncHandler((req, res) => ctrl.remove(req, res)));
