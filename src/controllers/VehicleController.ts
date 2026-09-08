import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Vehicle } from '../entities/Vehicle';
import { User } from '../entities/User';
import { AuthRequest } from '../middleware/auth';

const repo = () => AppDataSource.getRepository(Vehicle);

export class VehicleController {
  async create(req: AuthRequest, res: Response): Promise<void> {
    const userId = req.userId!;
    const { tipo, marca, modelo, ano, cor, apelido } = req.body;

    // Plano gratuito: máximo 1 veículo. Trava a linha do usuário (pessimistic_write)
    // pra serializar criações concorrentes do mesmo usuário — sem isso, duas
    // requisições simultâneas passavam as duas pela contagem antes de qualquer
    // uma salvar, e um usuário gratuito conseguia ficar com 2 veículos. Usa o plano
    // lido agora do banco (não req.userPlan, a claim do JWT, que pode ter até
    // JWT_EXPIRES_IN de atraso em relação a uma mudança de plano real) — já que a
    // linha precisa ser buscada mesmo assim pro lock, sai de graça.
    const vehicle = await AppDataSource.transaction(async (manager) => {
      const currentUser = await manager.findOne(User, { where: { id: userId }, lock: { mode: 'pessimistic_write' } });

      // Fail-closed: se o usuário não for encontrado (ex.: conta deletada, token
      // ainda válido pelos minutos restantes do JWT), trata como gratuito em vez
      // de pular o limite — !currentUser antes do === evita que `undefined ===
      // 'gratuito'` (false) libere criação ilimitada de veículos por engano.
      if (!currentUser || currentUser.plano === 'gratuito') {
        const count = await manager.count(Vehicle, { where: { userId } });
        if (count >= 1) return null;
      }

      const v = manager.create(Vehicle, { userId, tipo, marca, modelo, ano, cor, apelido });
      return manager.save(v);
    });

    if (!vehicle) {
      res.status(403).json({
        error: 'Plano gratuito permite apenas 1 veículo. Assine o Premium para adicionar mais.',
      });
      return;
    }

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

  // PATCH /vehicles/:id/plate — Premium (requirePremium na rota). Placa/RENAVAM
  // são exigidos pelas consultas SP (a API do órgão consulta por placa).
  async linkPlate(req: AuthRequest, res: Response): Promise<void> {
    const vehicle = await repo().findOne({
      where: { id: Number(req.params.id), userId: req.userId! },
    });
    if (!vehicle) {
      res.status(404).json({ error: 'Veículo não encontrado' });
      return;
    }

    const { placa, renavam } = req.body;
    vehicle.placa = placa;
    vehicle.renavam = renavam;
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
