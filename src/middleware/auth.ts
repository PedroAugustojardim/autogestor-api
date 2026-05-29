import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: number;
  userPlan?: string;
  isAdmin?: boolean;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token não fornecido' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as unknown as {
      sub: number;
      plano: string;
      isAdmin: boolean;
    };
    req.userId = payload.sub;
    req.userPlan = payload.plano;
    req.isAdmin = payload.isAdmin;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

export function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.isAdmin) {
    res.status(403).json({ error: 'Acesso restrito a administradores' });
    return;
  }
  next();
}
