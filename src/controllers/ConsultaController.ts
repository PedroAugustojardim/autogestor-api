import { Response } from 'express';
import { Vehicle } from '../entities/Vehicle';
import { AuthRequest } from '../middleware/auth';
import { ownsVehicle } from '../utils/ownership';
import { getConsultaProvider } from '../services/consulta';

// Toda consulta precisa da placa cadastrada (a API do órgão consulta por placa,
// não pelo nosso id interno) — PATCH /vehicles/:id/plate cadastra isso.
async function ownedVehicleWithPlate(vehicleId: number, userId: number): Promise<Vehicle | null | 'sem-placa'> {
  const vehicle = await ownsVehicle(vehicleId, userId);
  if (!vehicle) return null;
  if (!vehicle.placa) return 'sem-placa';
  return vehicle;
}

export class ConsultaController {
  // GET /vehicles/:id/fines
  async fines(req: AuthRequest, res: Response): Promise<void> {
    const vehicleId = Number(req.params.id);
    const vehicle = await ownedVehicleWithPlate(vehicleId, req.userId!);
    if (vehicle === null) { res.status(404).json({ error: 'Veículo não encontrado' }); return; }
    if (vehicle === 'sem-placa') { res.status(400).json({ error: 'Cadastre a placa do veículo antes de consultar' }); return; }

    try {
      const multas = await getConsultaProvider().getFines(vehicle.placa!);
      res.json(multas);
    } catch (err) {
      console.error(`[consulta] falha ao buscar multas da placa ${vehicle.placa}:`, err);
      res.status(503).json({ error: 'Serviço de consulta indisponível no momento. Tente novamente mais tarde.' });
    }
  }

  // GET /vehicles/:id/ipva
  async ipva(req: AuthRequest, res: Response): Promise<void> {
    const vehicleId = Number(req.params.id);
    const vehicle = await ownedVehicleWithPlate(vehicleId, req.userId!);
    if (vehicle === null) { res.status(404).json({ error: 'Veículo não encontrado' }); return; }
    if (vehicle === 'sem-placa') { res.status(400).json({ error: 'Cadastre a placa do veículo antes de consultar' }); return; }

    try {
      const ipva = await getConsultaProvider().getIPVA(vehicle.placa!, vehicle.tipo);
      res.json(ipva);
    } catch (err) {
      console.error(`[consulta] falha ao buscar IPVA da placa ${vehicle.placa}:`, err);
      res.status(503).json({ error: 'Serviço de consulta indisponível no momento. Tente novamente mais tarde.' });
    }
  }

  // GET /vehicles/:id/debts — resumo combinado (multas + IPVA + licenciamento)
  async debts(req: AuthRequest, res: Response): Promise<void> {
    const vehicleId = Number(req.params.id);
    const vehicle = await ownedVehicleWithPlate(vehicleId, req.userId!);
    if (vehicle === null) { res.status(404).json({ error: 'Veículo não encontrado' }); return; }
    if (vehicle === 'sem-placa') { res.status(400).json({ error: 'Cadastre a placa do veículo antes de consultar' }); return; }

    try {
      const debts = await getConsultaProvider().getDebts(vehicle.placa!);
      res.json(debts);
    } catch (err) {
      console.error(`[consulta] falha ao buscar débitos da placa ${vehicle.placa}:`, err);
      res.status(503).json({ error: 'Serviço de consulta indisponível no momento. Tente novamente mais tarde.' });
    }
  }

  // GET /vehicles/:id/recalls
  async recalls(req: AuthRequest, res: Response): Promise<void> {
    const vehicleId = Number(req.params.id);
    const vehicle = await ownedVehicleWithPlate(vehicleId, req.userId!);
    if (vehicle === null) { res.status(404).json({ error: 'Veículo não encontrado' }); return; }
    if (vehicle === 'sem-placa') { res.status(400).json({ error: 'Cadastre a placa do veículo antes de consultar' }); return; }
    if (!vehicle.renavam) { res.status(400).json({ error: 'Cadastre o RENAVAM do veículo antes de consultar recalls' }); return; }

    try {
      const recalls = await getConsultaProvider().getRecalls(vehicle.placa!, vehicle.renavam);
      res.json(recalls);
    } catch (err) {
      console.error(`[consulta] falha ao buscar recalls da placa ${vehicle.placa}:`, err);
      res.status(503).json({ error: 'Serviço de consulta indisponível no momento. Tente novamente mais tarde.' });
    }
  }
}
