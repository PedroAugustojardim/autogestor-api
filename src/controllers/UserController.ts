import { Response } from 'express';
import bcrypt from 'bcrypt';
import { AppDataSource } from '../config/database';
import { User, UserPlan } from '../entities/User';
import { AuthRequest } from '../middleware/auth';

const repo = () => AppDataSource.getRepository(User);

export class UserController {
  async getMe(req: AuthRequest, res: Response): Promise<void> {
    const user = await repo().findOneBy({ id: req.userId! });
    if (!user) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      plano: user.plano,
      notificationsEnabled: user.notificationsEnabled,
      createdAt: user.createdAt,
    });
  }

  async updateMe(req: AuthRequest, res: Response): Promise<void> {
    const user = await repo().findOneBy({ id: req.userId! });
    if (!user) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }

    const { name, email } = req.body;
    if (name) user.name = name;
    if (email && email !== user.email) {
      const exists = await repo().findOneBy({ email });
      if (exists) {
        res.status(409).json({ error: 'Email já em uso' });
        return;
      }
      user.email = email;
    }

    await repo().save(user);
    res.json({ id: user.id, name: user.name, email: user.email, plano: user.plano });
  }

  async changePassword(req: AuthRequest, res: Response): Promise<void> {
    const user = await repo().findOneBy({ id: req.userId! });
    if (!user) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'currentPassword e newPassword são obrigatórios' }); return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'A nova senha deve ter no mínimo 8 caracteres' }); return;
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) { res.status(401).json({ error: 'Senha atual incorreta' }); return; }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await repo().save(user);
    res.json({ message: 'Senha alterada com sucesso' });
  }

  async upgradePlan(req: AuthRequest, res: Response): Promise<void> {
    const user = await repo().findOneBy({ id: req.userId! });
    if (!user) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }

    const { plano } = req.body;
    const planosValidos: UserPlan[] = ['premium_mensal', 'premium_anual'];
    if (!planosValidos.includes(plano)) {
      res.status(400).json({ error: 'Plano inválido. Use: premium_mensal ou premium_anual' }); return;
    }

    user.plano = plano;
    await repo().save(user);
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      plano: user.plano,
      message: 'Plano atualizado com sucesso',
    });
  }

  async updateNotifications(req: AuthRequest, res: Response): Promise<void> {
    const user = await repo().findOneBy({ id: req.userId! });
    if (!user) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }

    const { notificationsEnabled } = req.body;
    if (typeof notificationsEnabled !== 'boolean') {
      res.status(400).json({ error: 'notificationsEnabled deve ser boolean' }); return;
    }
    user.notificationsEnabled = notificationsEnabled;
    await repo().save(user);
    res.json({ notificationsEnabled: user.notificationsEnabled });
  }

  async deleteMe(req: AuthRequest, res: Response): Promise<void> {
    const user = await repo().findOneBy({ id: req.userId! });
    if (!user) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }
    await repo().softDelete(user.id);
    await AppDataSource.getRepository('refresh_tokens').update(
      { userId: user.id },
      { revoked: true },
    );
    res.status(204).send();
  }
}
