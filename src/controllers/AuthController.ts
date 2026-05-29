import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';
import { RefreshToken } from '../entities/RefreshToken';

const userRepo = () => AppDataSource.getRepository(User);
const tokenRepo = () => AppDataSource.getRepository(RefreshToken);

function generateAccessToken(user: User): string {
  return jwt.sign(
    { sub: user.id, plano: user.plano, isAdmin: user.isAdmin },
    process.env.JWT_SECRET!,
    { expiresIn: 900 }, // 15 minutos em segundos
  );
}

async function generateRefreshToken(user: User): Promise<string> {
  const token = crypto.randomBytes(64).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const rt = tokenRepo().create({ token, userId: user.id, expiresAt });
  await tokenRepo().save(rt);
  return token;
}

export class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    const { name, email, password } = req.body;

    const existing = await userRepo().findOneBy({ email });
    if (existing) {
      res.status(409).json({ error: 'Email já cadastrado' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = userRepo().create({ name, email, passwordHash });
    await userRepo().save(user);

    const accessToken = generateAccessToken(user);
    const refreshToken = await generateRefreshToken(user);

    res.status(201).json({
      user: { id: user.id, name: user.name, email: user.email, plano: user.plano },
      accessToken,
      refreshToken,
    });
  }

  async login(req: Request, res: Response): Promise<void> {
    const { email, password } = req.body;

    const user = await userRepo().findOneBy({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: 'Email ou senha inválidos' });
      return;
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = await generateRefreshToken(user);

    res.json({
      user: { id: user.id, name: user.name, email: user.email, plano: user.plano },
      accessToken,
      refreshToken,
    });
  }

  async refresh(req: Request, res: Response): Promise<void> {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token não fornecido' });
      return;
    }

    const rt = await tokenRepo().findOne({
      where: { token: refreshToken, revoked: false },
      relations: ['user'],
    });

    if (!rt || rt.expiresAt < new Date()) {
      res.status(401).json({ error: 'Refresh token inválido ou expirado' });
      return;
    }

    rt.revoked = true;
    await tokenRepo().save(rt);

    const accessToken = generateAccessToken(rt.user);
    const newRefreshToken = await generateRefreshToken(rt.user);

    res.json({ accessToken, refreshToken: newRefreshToken });
  }

  async logout(req: Request, res: Response): Promise<void> {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await tokenRepo().update({ token: refreshToken }, { revoked: true });
    }
    res.status(204).send();
  }

  async forgotPassword(req: Request, res: Response): Promise<void> {
    const { email } = req.body;
    const user = await userRepo().findOneBy({ email });

    // Responde sempre 200 para não revelar se email existe
    if (!user) {
      res.json({ message: 'Se o email estiver cadastrado, você receberá as instruções.' });
      return;
    }

    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hora
    await userRepo().save(user);

    // TODO Etapa 7: enviar email via Resend
    console.log(`[DEV] Reset token para ${email}: ${token}`);

    res.json({ message: 'Se o email estiver cadastrado, você receberá as instruções.' });
  }

  async resetPassword(req: Request, res: Response): Promise<void> {
    const { token, password } = req.body;

    const user = await userRepo().findOneBy({ resetPasswordToken: token });
    if (!user || !user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      res.status(400).json({ error: 'Token inválido ou expirado' });
      return;
    }

    user.passwordHash = await bcrypt.hash(password, 12);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await userRepo().save(user);

    await tokenRepo().update({ userId: user.id }, { revoked: true });

    res.json({ message: 'Senha redefinida com sucesso' });
  }
}
