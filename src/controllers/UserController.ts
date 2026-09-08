import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';
import { RefreshToken } from '../entities/RefreshToken';
import { AuthRequest } from '../middleware/auth';

const repo = () => AppDataSource.getRepository(User);
const tokenRepo = () => AppDataSource.getRepository(RefreshToken);

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

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) { res.status(401).json({ error: 'Senha atual incorreta' }); return; }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await repo().save(user);
    await tokenRepo().update({ userId: user.id }, { revoked: true });
    res.json({ message: 'Senha alterada com sucesso' });
  }

  async updateNotifications(req: AuthRequest, res: Response): Promise<void> {
    const user = await repo().findOneBy({ id: req.userId! });
    if (!user) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }

    const { notificationsEnabled } = req.body;
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
    // Libera o email (unique constraint) e marca o soft delete numa única UPDATE
    // (softDelete() setaria deletedAt sozinho, então fazemos os dois campos juntos
    // aqui em vez de duas chamadas separadas). As duas escritas viram uma
    // transação — sem isso, um crash no meio do caminho podia deixar o email
    // anonimizado sem o soft delete correspondente.
    await AppDataSource.transaction(async (manager) => {
      await manager.update(User, user.id, {
        email: `deleted_${user.id}_${Date.now()}@deleted.autogestor.local`,
        deletedAt: new Date(),
      });
      await manager.update(RefreshToken, { userId: user.id }, { revoked: true });
    });
    res.status(204).send();
  }
}
