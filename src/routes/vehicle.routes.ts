import { Router } from 'express';
import { VehicleController } from '../controllers/VehicleController';
import { authMiddleware } from '../middleware/auth';
import { requirePremium } from '../middleware/premium';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { authenticatedLimiter } from '../middleware/rateLimit';
import { createVehicleSchema, updateVehicleSchema, linkPlateSchema } from '../schemas/vehicle.schema';

const router = Router();
const controller = new VehicleController();

// Middleware por rota — este prefixo (/api/v1/vehicles) é compartilhado com
// expense/report/maintenance/reminder/consulta routers.
router.post('/', authMiddleware, authenticatedLimiter, validate(createVehicleSchema), asyncHandler((req, res) => controller.create(req, res)));
router.get('/', authMiddleware, authenticatedLimiter, asyncHandler((req, res) => controller.list(req, res)));
router.get('/:id', authMiddleware, authenticatedLimiter, asyncHandler((req, res) => controller.getOne(req, res)));
router.put('/:id', authMiddleware, authenticatedLimiter, validate(updateVehicleSchema), asyncHandler((req, res) => controller.update(req, res)));
router.patch('/:id/plate', authMiddleware, authenticatedLimiter, requirePremium, validate(linkPlateSchema), asyncHandler((req, res) => controller.linkPlate(req, res)));
router.delete('/:id', authMiddleware, authenticatedLimiter, asyncHandler((req, res) => controller.remove(req, res)));

export default router;
