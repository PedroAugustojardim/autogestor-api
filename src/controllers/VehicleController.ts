import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Vehicle } from '../entities/Vehicle';
import { AuthRequest } from '../middleware/auth';

const repo = () => AppDataSource.getRepository(Vehicle);

export class VehicleController {
  async create(req: AuthRequest, res: Response): Promise<void> {
    const userId = req.userId!;
    const { tipo, marca, modelo, ano, cor, apelido } = req.body;

    // Plano gratuito: máximo 1 veículo
    if (req.userPlan === 'gratuito') {
      const count = await repo().count({ where: { userId } });
      if (count >= 1) {
        res.status(403).json({
          error: 'Plano gratuito permite apenas 1 veículo. Assine o Premium para adicionar mais.',
        });
        return;
      }
    }

    const vehicle = repo().create({ userId, tipo, marca, modelo, ano, cor, apelido });
    await repo().save(vehicle);

    res.status(201).json(vehicle);
  }

  async list(req: AuthRequest, res: Response): Promise<void> {
    const vehicles = await repo().find({ where: { userId: req.userId! } });
    res.json(vehicles);
  }

  async getOne(req: AuthRequest, res: Response): Promise<void> {
    const vehicle = await repo().findOne({
      where: { id: Number(req.params.id), userId: req.userId! },
    });
    if (!vehicle) {
      res.status(404).json({ error: 'Veículo não encontrado' });
      return;
    }
    res.json(vehicle);
  }

  async update(req: AuthRequest, res: Response): Promise<void> {
    const vehicle = await repo().findOne({
      where: { id: Number(req.params.id), userId: req.userId! },
    });
    if (!vehicle) {
      res.status(404).json({ error: 'Veículo não encontrado' });
      return;
    }

    const { marca, modelo, ano, cor, apelido } = req.body;
    if (marca !== undefined) vehicle.marca = marca;
    if (modelo !== undefined) vehicle.modelo = modelo;
    if (ano !== undefined) vehicle.ano = ano;
    if (cor !== undefined) vehicle.cor = cor;
    if (apelido !== undefined) vehicle.apelido = apelido;
    await repo().save(vehicle);
    res.json(vehicle);
  }

  async remove(req: AuthRequest, res: Response): Promise<void> {
    const vehicle = await repo().findOne({
      where: { id: Number(req.params.id), userId: req.userId! },
    });
    if (!vehicle) {
      res.status(404).json({ error: 'Veículo não encontrado' });
      return;
    }
    await repo().remove(vehicle);
    res.status(204).send();
  }
}
