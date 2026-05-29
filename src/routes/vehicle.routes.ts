import { Router } from 'express';
import { VehicleController } from '../controllers/VehicleController';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const controller = new VehicleController();

router.use(authMiddleware);

router.post('/', (req, res) => controller.create(req, res));
router.get('/', (req, res) => controller.list(req, res));
router.get('/:id', (req, res) => controller.getOne(req, res));
router.put('/:id', (req, res) => controller.update(req, res));
router.delete('/:id', (req, res) => controller.remove(req, res));

export default router;
