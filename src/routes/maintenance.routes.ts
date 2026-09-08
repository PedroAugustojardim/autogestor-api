import { Router } from 'express';
import { MaintenanceController } from '../controllers/MaintenanceController';
import { ReminderController } from '../controllers/ReminderController';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { authenticatedLimiter } from '../middleware/rateLimit';
import {
  createMaintenanceSchema, updateMaintenanceSchema,
  createReminderSchema, updateReminderSchema,
} from '../schemas/maintenance.schema';

const maintCtrl = new MaintenanceController();
const reminderCtrl = new ReminderController();

// Montado em /api/v1/vehicles — middleware por rota, não `router.use(...)` em
// bloco: este prefixo é compartilhado com outros routers (vehicle/report/expense/
// reminder/consulta), e um `.use()` sem path roda pra qualquer request que entra
// no router, inclusive as destinadas aos outros — já causou 401/403 indevido em
// rotas de outros routers montados no mesmo prefixo antes de ser corrigido aqui.
export const maintenanceRouter = Router({ mergeParams: true });
maintenanceRouter.post('/:id/maintenance',        authMiddleware, authenticatedLimiter, validate(createMaintenanceSchema), asyncHandler((req, res) => maintCtrl.create(req, res)));
maintenanceRouter.get('/:id/maintenance',          authMiddleware, authenticatedLimiter, asyncHandler((req, res) => maintCtrl.list(req, res)));
maintenanceRouter.get('/:id/maintenance/:mid',     authMiddleware, authenticatedLimiter, asyncHandler((req, res) => maintCtrl.getOne(req, res)));
maintenanceRouter.put('/:id/maintenance/:mid',     authMiddleware, authenticatedLimiter, validate(updateMaintenanceSchema), asyncHandler((req, res) => maintCtrl.update(req, res)));
maintenanceRouter.delete('/:id/maintenance/:mid',  authMiddleware, authenticatedLimiter, asyncHandler((req, res) => maintCtrl.remove(req, res)));

// Montado em /api/v1/vehicles — mesmo motivo acima.
export const reminderRouter = Router({ mergeParams: true });
reminderRouter.post('/:id/reminders',                authMiddleware, authenticatedLimiter, validate(createReminderSchema), asyncHandler((req, res) => reminderCtrl.create(req, res)));
reminderRouter.get('/:id/reminders',                  authMiddleware, authenticatedLimiter, asyncHandler((req, res) => reminderCtrl.list(req, res)));
reminderRouter.get('/:id/reminders/next',             authMiddleware, authenticatedLimiter, asyncHandler((req, res) => reminderCtrl.next(req, res)));
reminderRouter.put('/:id/reminders/:rid',             authMiddleware, authenticatedLimiter, validate(updateReminderSchema), asyncHandler((req, res) => reminderCtrl.update(req, res)));
reminderRouter.patch('/:id/reminders/:rid/silence',   authMiddleware, authenticatedLimiter, asyncHandler((req, res) => reminderCtrl.silence(req, res)));
reminderRouter.delete('/:id/reminders/:rid',          authMiddleware, authenticatedLimiter, asyncHandler((req, res) => reminderCtrl.remove(req, res)));
