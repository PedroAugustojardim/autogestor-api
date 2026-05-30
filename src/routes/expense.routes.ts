import { Router } from 'express';
import { ExpenseController } from '../controllers/ExpenseController';
import { authMiddleware } from '../middleware/auth';

const ctrl = new ExpenseController();

// Rota de categorias — montada em /api/v1
export const categoryRouter = Router();
categoryRouter.use(authMiddleware);
categoryRouter.get('/expense-categories', (req, res) => ctrl.listCategories(req, res));

// Rotas de gastos — montadas em /api/v1/vehicles
export const expenseRouter = Router({ mergeParams: true });
expenseRouter.use(authMiddleware);
expenseRouter.post('/:id/expenses',         (req, res) => ctrl.create(req, res));
expenseRouter.get('/:id/expenses/summary',  (req, res) => ctrl.summary(req, res));
expenseRouter.get('/:id/expenses',          (req, res) => ctrl.list(req, res));
expenseRouter.put('/:id/expenses/:eid',     (req, res) => ctrl.update(req, res));
expenseRouter.delete('/:id/expenses/:eid',  (req, res) => ctrl.remove(req, res));
