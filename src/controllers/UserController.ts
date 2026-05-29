import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';
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
