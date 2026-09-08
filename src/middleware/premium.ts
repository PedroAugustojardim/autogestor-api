import { Response, NextFunction } from 'express';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';
import { AuthRequest } from './auth';

const userRepo = () => AppDataSource.getRepository(User);

// Lê o plano fresco do banco, não req.userPlan (a claim do JWT, que fica até
// JWT_EXPIRES_IN atrasada em relação a uma mudança de plano real) — importante
// agora que o Mercado Pago pode virar o plano pra premium a qualquer momento via
// webhook, sem que o usuário precise esperar o token expirar.
export function requirePremium(req: AuthRequest, res: Response, next: NextFunction): void {
  userRepo()
    .findOneBy({ id: req.userId! })
    .then((user) => {
      if (!user || user.plano === 'gratuito') {
        res.status(403).json({ error: 'Recurso exclusivo para assinantes Premium' });
        return;
      }
      next();
    })
    .catch(next);
}
