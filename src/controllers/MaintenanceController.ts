import { Response } from 'express';
import { Not, IsNull } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Maintenance } from '../entities/Maintenance';
import { Reminder } from '../entities/Reminder';
import { Expense } from '../entities/Expense';
import { AuthRequest } from '../middleware/auth';
import { ownsVehicle } from '../utils/ownership';
import { MAINTENANCE_INTERVALS, predictNextMaintenanceDate } from '../utils/maintenancePrediction';

const maintRepo = () => AppDataSource.getRepository(Maintenance);
const reminderRepo = () => AppDataSource.getRepository(Reminder);
const expenseRepo = () => AppDataSource.getRepository(Expense);

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

  // GET /vehicles/:id/maintenance/predict?tipo=X&data=YYYY-MM-DD&km=NNN
  // Sugere a dataPrevista do próximo lembrete pro tipo/data/km que o usuário está
  // digitando agora nessa manutenção (ela vira a ocorrência mais recente desse
  // tipo assim que salva) — ver utils/maintenancePrediction.ts pro motor de
  // cálculo. Responde null quando não há previsão possível (tipo fora do
  // catálogo, ou dados insuficientes); o mobile cai no fluxo manual nesse caso.
  async predict(req: AuthRequest, res: Response): Promise<void> {
    const vehicleId = Number(req.params.id);
    if (!await ownsVehicle(vehicleId, req.userId!)) {
      res.status(404).json({ error: 'Veículo não encontrado' }); return;
    }

    const tipo = typeof req.query.tipo === 'string' ? req.query.tipo : '';
    const baseData = typeof req.query.data === 'string' ? req.query.data : '';
    if (!tipo || !/^\d{4}-\d{2}-\d{2}$/.test(baseData)) {
      res.status(400).json({ error: 'tipo e data são obrigatórios' }); return;
    }

    let baseKm: number | null = null;
    if (typeof req.query.km === 'string' && req.query.km !== '') {
      const parsed = Number(req.query.km);
      if (Number.isFinite(parsed)) baseKm = parsed;
    }
    if (baseKm === null) {
      // Sem km informado agora — busca pra trás o km da ocorrência anterior deste
      // mesmo tipo (a data-base continua sendo a data recém-digitada, só o km
      // "empresta" do registro anterior).
      const anterior = await maintRepo().findOne({ where: { vehicleId, tipo }, order: { data: 'DESC' } });
      if (anterior?.km != null) baseKm = anterior.km;
    }

    const pontos = await expenseRepo().find({
      where: { vehicleId, kmAtual: Not(IsNull()) },
      select: { data: true, kmAtual: true },
      order: { data: 'ASC' },
    });
    const usagePoints = pontos.map((p) => ({ data: p.data, km: p.kmAtual! }));

    const catalogo = MAINTENANCE_INTERVALS[tipo] ?? { intervaloKm: null, intervaloMeses: null };
    const today = new Date().toISOString().slice(0, 10);
    const resultado = predictNextMaintenanceDate({
      intervaloKm: catalogo.intervaloKm,
      intervaloMeses: catalogo.intervaloMeses,
      baseData,
      baseKm,
      usagePoints,
      today,
    });

    res.json(resultado);
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
