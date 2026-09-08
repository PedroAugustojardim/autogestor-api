import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Reminder } from '../entities/Reminder';
import { AuthRequest } from '../middleware/auth';
import { ownsVehicle } from '../utils/ownership';

const reminderRepo = () => AppDataSource.getRepository(Reminder);

export class ReminderController {
  // POST /vehicles/:id/reminders
  async create(req: AuthRequest, res: Response): Promise<void> {
    const vehicleId = Number(req.params.id);
    if (!await ownsVehicle(vehicleId, req.userId!)) {
      res.status(404).json({ error: 'Veículo não encontrado' }); return;
    }
    const { tipo, dataPrevista } = req.body;
    const reminder = reminderRepo().create({ vehicleId, tipo, dataPrevista });
    await reminderRepo().save(reminder);
    res.status(201).json(reminder);
  }

  // GET /vehicles/:id/reminders
  async list(req: AuthRequest, res: Response): Promise<void> {
    const vehicleId = Number(req.params.id);
    if (!await ownsVehicle(vehicleId, req.userId!)) {
      res.status(404).json({ error: 'Veículo não encontrado' }); return;
    }
    const items = await reminderRepo().find({ where: { vehicleId }, order: { dataPrevista: 'ASC' } });
    res.json(items);
  }

  // GET /vehicles/:id/reminders/next — próximo lembrete pendente, pro card da Home
  async next(req: AuthRequest, res: Response): Promise<void> {
    const vehicleId = Number(req.params.id);
    if (!await ownsVehicle(vehicleId, req.userId!)) {
      res.status(404).json({ error: 'Veículo não encontrado' }); return;
    }
    const item = await reminderRepo().findOne({
      where: { vehicleId, concluido: false, silenciado: false },
      order: { dataPrevista: 'ASC' },
    });
    res.json(item ?? null);
  }

  // PUT /vehicles/:id/reminders/:rid
  async update(req: AuthRequest, res: Response): Promise<void> {
    const vehicleId = Number(req.params.id);
    const id = Number(req.params.rid);
    if (!await ownsVehicle(vehicleId, req.userId!)) {
      res.status(404).json({ error: 'Veículo não encontrado' }); return;
    }
    const item = await reminderRepo().findOneBy({ id, vehicleId });
    if (!item) { res.status(404).json({ error: 'Lembrete não encontrado' }); return; }

    const { tipo, dataPrevista, concluido } = req.body;
    if (tipo !== undefined) item.tipo = tipo;
    if (dataPrevista !== undefined) item.dataPrevista = dataPrevista;
    if (concluido !== undefined) item.concluido = concluido;

    await reminderRepo().save(item);
    res.json(item);
  }

  // PATCH /vehicles/:id/reminders/:rid/silence
  async silence(req: AuthRequest, res: Response): Promise<void> {
    const vehicleId = Number(req.params.id);
    const id = Number(req.params.rid);
    if (!await ownsVehicle(vehicleId, req.userId!)) {
      res.status(404).json({ error: 'Veículo não encontrado' }); return;
    }
    const item = await reminderRepo().findOneBy({ id, vehicleId });
    if (!item) { res.status(404).json({ error: 'Lembrete não encontrado' }); return; }
    item.silenciado = true;
    await reminderRepo().save(item);
    res.json(item);
  }

  // DELETE /vehicles/:id/reminders/:rid
  async remove(req: AuthRequest, res: Response): Promise<void> {
    const vehicleId = Number(req.params.id);
    const id = Number(req.params.rid);
    if (!await ownsVehicle(vehicleId, req.userId!)) {
      res.status(404).json({ error: 'Veículo não encontrado' }); return;
    }
    const item = await reminderRepo().findOneBy({ id, vehicleId });
    if (!item) { res.status(404).json({ error: 'Lembrete não encontrado' }); return; }
    await reminderRepo().remove(item);
    res.status(204).send();
  }
}
