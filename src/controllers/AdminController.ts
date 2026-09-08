import { Response } from 'express';
import crypto from 'crypto';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';
import { Vehicle } from '../entities/Vehicle';
import { Expense } from '../entities/Expense';
import { PaymentLog } from '../entities/PaymentLog';
import { InviteCode } from '../entities/InviteCode';
import { RefreshToken } from '../entities/RefreshToken';
import { AuthRequest } from '../middleware/auth';
import { hashToken } from '../utils/hashToken';

const userRepo = () => AppDataSource.getRepository(User);
const vehicleRepo = () => AppDataSource.getRepository(Vehicle);
const expenseRepo = () => AppDataSource.getRepository(Expense);
const paymentLogRepo = () => AppDataSource.getRepository(PaymentLog);
const inviteRepo = () => AppDataSource.getRepository(InviteCode);
const tokenRepo = () => AppDataSource.getRepository(RefreshToken);

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

export class AdminController {
  // GET /admin/stats
  async stats(_req: AuthRequest, res: Response): Promise<void> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const [
      totalUsers,
      premiumMensal,
      premiumAnual,
      activos7d,
      activos30d,
      novosNoMes,
      porTipo,
      receitaMensal,
      receitaAnual,
    ] = await Promise.all([
      userRepo().count(),
      userRepo().count({ where: { plano: 'premium_mensal' } }),
      userRepo().count({ where: { plano: 'premium_anual' } }),
      userRepo().createQueryBuilder('u').where('u.last_login_at >= :d', { d: daysAgo(7) }).getCount(),
      userRepo().createQueryBuilder('u').where('u.last_login_at >= :d', { d: daysAgo(30) }).getCount(),
      userRepo().createQueryBuilder('u').where('u.created_at >= :d', { d: monthStart }).getCount(),
      vehicleRepo().createQueryBuilder('v').select('v.tipo', 'tipo').addSelect('COUNT(*)', 'quantidade').groupBy('v.tipo').getRawMany(),
      paymentLogRepo().createQueryBuilder('p')
        .select('COALESCE(SUM(p.valor), 0)', 'total')
        .where('p.status = :status', { status: 'approved' })
        .andWhere('p.updated_at >= :d', { d: monthStart })
        .getRawOne(),
      paymentLogRepo().createQueryBuilder('p')
        .select('COALESCE(SUM(p.valor), 0)', 'total')
        .where('p.status = :status', { status: 'approved' })
        .andWhere('p.updated_at >= :d', { d: yearStart })
        .getRawOne(),
    ]);

    const totalPremium = premiumMensal + premiumAnual;

    res.json({
      usuarios: {
        total: totalUsers,
        novosNoMes,
        ativos7Dias: activos7d,
        ativos30Dias: activos30d,
      },
      assinantes: {
        premiumMensal,
        premiumAnual,
        total: totalPremium,
        taxaConversao: totalUsers > 0 ? Number(((totalPremium / totalUsers) * 100).toFixed(1)) : 0,
      },
      receita: {
        mensal: Number(receitaMensal.total),
        anual: Number(receitaAnual.total),
      },
      veiculosPorTipo: porTipo.map((r: { tipo: string; quantidade: string }) => ({
        tipo: r.tipo,
        quantidade: Number(r.quantidade),
      })),
    });
  }

  // GET /admin/users?page=1&limit=20&search=texto
  async listUsers(req: AuthRequest, res: Response): Promise<void> {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const search = (req.query.search as string | undefined)?.trim();

    const qb = userRepo().createQueryBuilder('u')
      .select(['u.id', 'u.name', 'u.email', 'u.plano', 'u.blocked', 'u.isAdmin', 'u.lastLoginAt', 'u.createdAt'])
      .orderBy('u.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (search) {
      qb.where('u.name LIKE :s OR u.email LIKE :s', { s: `%${search}%` });
    }

    const [items, total] = await qb.getManyAndCount();
    res.json({ items, total, page, limit });
  }

  // GET /admin/users/:id
  async getUser(req: AuthRequest, res: Response): Promise<void> {
    const id = Number(req.params.id);
    const user = await userRepo().findOne({ where: { id }, withDeleted: true });
    if (!user) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }

    const vehicles = await vehicleRepo().find({ where: { userId: id } });
    const vehicleIds = vehicles.map((v) => v.id);

    const recentExpenses = vehicleIds.length > 0
      ? await expenseRepo().createQueryBuilder('e')
          .where('e.vehicle_id IN (:...ids)', { ids: vehicleIds })
          .orderBy('e.data', 'DESC')
          .take(10)
          .getMany()
      : [];

    const totalGasto = vehicleIds.length > 0
      ? await expenseRepo().createQueryBuilder('e')
          .select('COALESCE(SUM(e.valor), 0)', 'total')
          .where('e.vehicle_id IN (:...ids)', { ids: vehicleIds })
          .getRawOne()
      : { total: 0 };

    const payments = await paymentLogRepo().find({ where: { userId: id }, order: { createdAt: 'DESC' } });

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      plano: user.plano,
      blocked: user.blocked,
      isAdmin: user.isAdmin,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      deletedAt: user.deletedAt,
      vehicles,
      expenses: { recentes: recentExpenses, totalGasto: Number(totalGasto.total) },
      payments,
    });
  }

  // PATCH /admin/users/:id/block  { blocked: boolean }
  async blockUser(req: AuthRequest, res: Response): Promise<void> {
    const id = Number(req.params.id);
    const { blocked } = req.body as { blocked: boolean };

    const user = await userRepo().findOneBy({ id });
    if (!user) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }
    if (user.isAdmin) { res.status(400).json({ error: 'Não é possível bloquear um administrador' }); return; }

    await userRepo().update(id, { blocked });
    if (blocked) {
      // Corta a possibilidade de renovar a sessão — o access token de até 15min
      // ainda em posse do usuário continua válido até expirar naturalmente
      // (mesma limitação já aceita em UserController.deleteMe).
      await tokenRepo().update({ userId: id }, { revoked: true });
    }

    res.json({ id, blocked });
  }

  // DELETE /admin/users/:id
  async deleteUser(req: AuthRequest, res: Response): Promise<void> {
    const id = Number(req.params.id);
    const user = await userRepo().findOneBy({ id });
    if (!user) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }
    if (user.isAdmin) { res.status(400).json({ error: 'Não é possível excluir um administrador' }); return; }

    // Mesmo padrão de UserController.deleteMe: libera o email antes do soft
    // delete (numa transação só) pra permitir recadastro futuro com o mesmo email.
    await AppDataSource.transaction(async (manager) => {
      await manager.update(User, id, {
        email: `deleted_${id}_${Date.now()}@deleted.autogestor.local`,
        deletedAt: new Date(),
      });
      await manager.update(RefreshToken, { userId: id }, { revoked: true });
    });

    res.status(204).send();
  }

  // PATCH /admin/users/:id/plan  { plano }
  // Não existe conceito de "assinatura com data de expiração" neste projeto (só
  // User.plano + PaymentLog) — em vez de inventar "cancelar"/"estender" sem dado
  // real por trás, este único endpoint cobre os dois casos: setar 'gratuito'
  // (equivale a cancelar) ou premium_mensal/anual (concessão manual, ex. cortesia).
  async setUserPlan(req: AuthRequest, res: Response): Promise<void> {
    const id = Number(req.params.id);
    const { plano } = req.body as { plano: 'gratuito' | 'premium_mensal' | 'premium_anual' };

    const user = await userRepo().findOneBy({ id });
    if (!user) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }

    await userRepo().update(id, { plano });
    res.json({ id, plano });
  }

  // GET /admin/invite-codes
  // O código bruto não pode ser mostrado aqui — só o hash SHA-256 é persistido
  // (ver InviteCode.ts). Um código não usado que o admin perdeu não tem como ser
  // recuperado; gerar um novo é o caminho, igual perder uma senha.
  async listInviteCodes(_req: AuthRequest, res: Response): Promise<void> {
    const codes = await inviteRepo().find({
      relations: ['user'],
      order: { createdAt: 'DESC' },
      take: 100,
    });

    res.json(codes.map((c) => ({
      id: c.id,
      usedAt: c.usedAt,
      usedByName: c.user?.name ?? null,
      expiresAt: c.expiresAt,
      createdAt: c.createdAt,
      status: c.usedAt ? 'usado' : (c.expiresAt && c.expiresAt < new Date() ? 'expirado' : 'disponível'),
    })));
  }

  // POST /admin/invite-codes  { quantidade?, diasValidade? }
  // Responde com os códigos em texto puro — única vez que eles existem fora do
  // hash. Copie/envie agora; a listagem nunca vai mostrar o valor de novo.
  async generateInviteCodes(req: AuthRequest, res: Response): Promise<void> {
    // Limites (1-50 / mínimo 1 dia) já aplicados por generateInviteCodesSchema
    // via validate() — só falta o valor default para quando não é enviado.
    const quantidade = Number(req.body?.quantidade) || 1;
    const diasValidade = Number(req.body?.diasValidade) || 90;
    const expiresAt = new Date(Date.now() + diasValidade * 86_400_000);

    const codigos = Array.from({ length: quantidade }, () => crypto.randomBytes(4).toString('hex').toUpperCase());

    await inviteRepo().save(codigos.map((code) => inviteRepo().create({ code: hashToken(code), expiresAt })));

    res.status(201).json({ codigos, expiresAt });
  }
}
