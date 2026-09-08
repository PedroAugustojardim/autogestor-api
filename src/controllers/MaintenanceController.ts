import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Maintenance } from '../entities/Maintenance';
import { Reminder } from '../entities/Reminder';
import { AuthRequest } from '../middleware/auth';
import { ownsVehicle } from '../utils/ownership';

const maintRepo = () => AppDataSource.getRepository(Maintenance);
const reminderRepo = () => AppDataSource.getRepository(Reminder);

export class MaintenanceController {
  // POST /vehicles/:id/maintenance
  async create(req: AuthRequest, res: Response): Promise<void> {
    const vehicleId = Number(req.params.id);
    if (!await ownsVehicle(vehicleId, req.userId!)) {
      res.status(404).json({ error: 'Veículo não encontrado' }); return;
    }

    const { tipo, data, km, custo, descricao, criarLembrete } = req.body;

    const maintenance = await AppDataSource.transaction(async (manager) => {
      const created = manager.create(Maintenance, { vehicleId, tipo, data, km, custo, descricao });
      await manager.save(created);

      if (criarLembrete) {
        const reminder = manager.create(Reminder, {
          vehicleId,
          maintenanceId: created.id,
          tipo: criarLembrete.tipo,
          dataPrevista: criarLembrete.dataPrevista,
        });
        await manager.save(reminder);
      }

      return created;
    });

    // Rebusca do banco antes de responder: `custo` (decimal) volta como string do
    // MySQL, mas o objeto recém-salvo em memória ainda tem o number que o Zod
    // coeriu — sem isso, POST devolvia number e GET a mesma manutenção devolvia
    // string pro mesmo campo (mesmo padrão já usado em ExpenseController.create).
    const saved = await maintRepo().findOneBy({ id: maintenance.id });
    res.status(201).json(saved);
  }

  // GET /vehicles/:id/maintenance
  async list(req: AuthRequest, res: Response): Promise<void> {
    const vehicleId = Number(req.params.id);
    if (!await ownsVehicle(vehicleId, req.userId!)) {
      res.status(404).json({ error: 'Veículo não encontrado' }); return;
    }
    const items = await maintRepo().find({ where: { vehicleId }, order: { data: 'DESC' } });
    res.json(items);
  }

  // GET /vehicles/:id/maintenance/:mid
  async getOne(req: AuthRequest, res: Response): Promise<void> {
    const vehicleId = Number(req.params.id);
    const id = Number(req.params.mid);
    if (!await ownsVehicle(vehicleId, req.userId!)) {
      res.status(404).json({ error: 'Veículo não encontrado' }); return;
    }
    const item = await maintRepo().findOneBy({ id, vehicleId });
    if (!item) { res.status(404).json({ error: 'Manutenção não encontrada' }); return; }
    res.json(item);
  }

  // PUT /vehicles/:id/maintenance/:mid
  async update(req: AuthRequest, res: Response): Promise<void> {
    const vehicleId = Number(req.params.id);
    const id = Number(req.params.mid);
    if (!await ownsVehicle(vehicleId, req.userId!)) {
      res.status(404).json({ error: 'Veículo não encontrado' }); return;
    }
    const item = await maintRepo().findOneBy({ id, vehicleId });
    if (!item) { res.status(404).json({ error: 'Manutenção não encontrada' }); return; }

    const { tipo, data, km, custo, descricao } = req.body;
    if (tipo !== undefined) item.tipo = tipo;
    if (data !== undefined) item.data = data;
    if (km !== undefined) item.km = km;
    if (custo !== undefined) item.custo = custo;
    if (descricao !== undefined) item.descricao = descricao;

    await maintRepo().save(item);
    const updated = await maintRepo().findOneBy({ id });
    res.json(updated);
  }

  // DELETE /vehicles/:id/maintenance/:mid
  async remove(req: AuthRequest, res: Response): Promise<void> {
    const vehicleId = Number(req.params.id);
    const id = Number(req.params.mid);
    if (!await ownsVehicle(vehicleId, req.userId!)) {
      res.status(404).json({ error: 'Veículo não encontrado' }); return;
    }
    const item = await maintRepo().findOneBy({ id, vehicleId });
    if (!item) { res.status(404).json({ error: 'Manutenção não encontrada' }); return; }
    await maintRepo().remove(item);
    res.status(204).send();
  }
}
