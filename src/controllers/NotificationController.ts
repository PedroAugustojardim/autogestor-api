import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Notification } from '../entities/Notification';
import { AuthRequest } from '../middleware/auth';

const repo = () => AppDataSource.getRepository(Notification);

export class NotificationController {
  // GET /notifications
  async list(req: AuthRequest, res: Response): Promise<void> {
    const items = await repo().find({
      where: { userId: req.userId! },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    res.json(items);
  }

  // GET /notifications/unread-count
  async unreadCount(req: AuthRequest, res: Response): Promise<void> {
    const count = await repo().count({ where: { userId: req.userId!, lida: false } });
    res.json({ count });
  }

  // PATCH /notifications/:id/read
  async markRead(req: AuthRequest, res: Response): Promise<void> {
    const id = Number(req.params.id);
    // update()+affected em vez de findOne()+save(): filtra por dono no mesmo passo
    // que autoriza, sem vazar se a notificação existe e é de outro usuário.
    const result = await repo().update({ id, userId: req.userId! }, { lida: true });
    if (result.affected === 0) {
      res.status(404).json({ error: 'Notificação não encontrada' });
      return;
    }
    res.status(204).send();
  }

  // PATCH /notifications/read-all
  async markAllRead(req: AuthRequest, res: Response): Promise<void> {
    await repo().update({ userId: req.userId!, lida: false }, { lida: true });
    res.status(204).send();
  }
}
