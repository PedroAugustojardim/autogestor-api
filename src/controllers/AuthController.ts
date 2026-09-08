import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';
import { RefreshToken } from '../entities/RefreshToken';
import { InviteCode } from '../entities/InviteCode';
import { sendPasswordResetEmail } from '../services/email';
import { hashToken } from '../utils/hashToken';
import { isTrustedMobileClient } from '../utils/clientDetection';

const userRepo = () => AppDataSource.getRepository(User);
const tokenRepo = () => AppDataSource.getRepository(RefreshToken);

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

// O admin (browser) usa o cookie httpOnly — não lê o token, então XSS não consegue roubá-lo.
// O mobile ignora o cookie e usa o valor do body, como antes.
function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_EXPIRES_IN_MS,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: REFRESH_COOKIE_PATH,
  });
}

// Monta a resposta de login/register/refresh — único lugar que decide se o refresh
// token entra no body. Centralizar isso evita que um endpoint novo esqueça a
// checagem e vaze o token no body mesmo com o cookie httpOnly protegido.
//
// A decisão vem de `isTrustedMobileClient` (User-Agent), não mais de um header que
// o próprio client escolhia mandar — ver src/utils/clientDetection.ts pro porquê.
function buildAuthResponse(req: Request, accessToken: string, refreshToken: string, extra?: Record<string, unknown>) {
  return {
    ...extra,
    accessToken,
    ...(isTrustedMobileClient(req) ? { refreshToken } : {}),
  };
}

function parseDurationMs(input: string | undefined, fallbackMs: number): number {
  if (!input) return fallbackMs;
  const match = /^(\d+)(s|m|h|d)$/.exec(input.trim());
  if (!match) return fallbackMs;
  const unitMs: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Number(match[1]) * unitMs[match[2]];
}

// Calculados uma vez no boot (os env vars não mudam durante a vida do processo),
// em vez de reparsear o regex a cada login/register/refresh.
const ACCESS_TOKEN_EXPIRES_IN_SECONDS = parseDurationMs(process.env.JWT_EXPIRES_IN, 15 * 60_000) / 1000;
const REFRESH_TOKEN_EXPIRES_IN_MS = parseDurationMs(process.env.JWT_REFRESH_EXPIRES_IN, 7 * 86_400_000);

function generateAccessToken(user: User): string {
  // expiresIn do jsonwebtoken só aceita number (segundos) ou um literal de tipo 'ms'
  // (ex.: '15m') — não uma string genérica, então convertemos pra segundos no boot.
  return jwt.sign(
    { sub: user.id, plano: user.plano, isAdmin: user.isAdmin },
    process.env.JWT_SECRET!,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS },
  );
}

// Sem familyId (login/register) = começa uma família nova. Passando o familyId do token
// anterior (refresh) = continua a mesma família, pra detecção de reuso saber quais tokens
// pertencem à mesma cadeia de rotação.
async function generateRefreshToken(user: User, familyId: string = crypto.randomUUID()): Promise<string> {
  const token = crypto.randomBytes(64).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN_MS);

  const rt = tokenRepo().create({ token: hashToken(token), userId: user.id, familyId, expiresAt });
  await tokenRepo().save(rt);
  return token;
}

export class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    const { name, email, password, inviteCode } = req.body;

    const existing = await userRepo().findOneBy({ email });
    if (existing) {
      res.status(409).json({ error: 'Email já cadastrado' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const hashedInvite = hashToken(inviteCode);

    // Reivindicação do convite, criação do usuário e marcação de "usado por" numa
    // transação só — se qualquer passo falhar (inclusive um crash no meio), o banco
    // desfaz tudo sozinho, sem precisar de rollback manual escrito à mão.
    const user = await AppDataSource.transaction(async (manager) => {
      // UPDATE condicional em vez de ler-depois-escrever, senão duas requisições
      // simultâneas com o mesmo código conseguiriam as duas passar pela checagem e
      // criar duas contas. A condição de expiração entra no próprio WHERE (não só
      // numa leitura anterior), senão um código que expira entre a leitura e o
      // UPDATE ainda seria aceito.
      const claim = await manager
        .createQueryBuilder()
        .update(InviteCode)
        .set({ usedAt: () => 'NOW()' })
        .where('code = :code', { code: hashedInvite })
        .andWhere('used_at IS NULL')
        .andWhere('(expires_at IS NULL OR expires_at > NOW())')
        .execute();

      if (claim.affected === 0) return null;

      const newUser = manager.create(User, { name, email, passwordHash });
      await manager.save(newUser);

      await manager
        .createQueryBuilder()
        .update(InviteCode)
        .set({ usedBy: newUser.id })
        .where('code = :code', { code: hashedInvite })
        .execute();

      return newUser;
    });

    if (!user) {
      res.status(400).json({ error: 'Código de convite inválido, expirado ou já utilizado' });
      return;
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = await generateRefreshToken(user);
    setRefreshCookie(res, refreshToken);

    res.status(201).json(buildAuthResponse(req, accessToken, refreshToken, {
      user: { id: user.id, name: user.name, email: user.email, plano: user.plano },
    }));
  }

  async login(req: Request, res: Response): Promise<void> {
    const { email, password } = req.body;

    const user = await userRepo().findOneBy({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: 'Email ou senha inválidos' });
      return;
    }

    // Mensagem específica revela que a conta existe (mesmo trade-off já aceito e
    // documentado no cadastro, item 13 do PLANO_SEGURANCA) — vale a pena aqui
    // porque a alternativa (dizer "senha inválida" pra alguém bloqueado por um
    // admin) é uma UX ruim sem ganho de segurança real: bloqueio é ação manual
    // rara, não um alvo natural de enumeração em massa.
    if (user.blocked) {
      res.status(403).json({ error: 'Conta bloqueada. Entre em contato com o suporte.' });
      return;
    }

    await userRepo().update(user.id, { lastLoginAt: new Date() });

    const accessToken = generateAccessToken(user);
    const refreshToken = await generateRefreshToken(user);
    setRefreshCookie(res, refreshToken);

    res.json(buildAuthResponse(req, accessToken, refreshToken, {
      user: { id: user.id, name: user.name, email: user.email, plano: user.plano },
    }));
  }

  async refresh(req: Request, res: Response): Promise<void> {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] ?? req.body.refreshToken;
    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token não fornecido' });
      return;
    }

    const hashed = hashToken(refreshToken);
    const rt = await tokenRepo().findOne({ where: { token: hashed }, relations: ['user'] });

    if (!rt) {
      clearRefreshCookie(res);
      res.status(401).json({ error: 'Refresh token inválido ou expirado' });
      return;
    }

    // Token já revogado sendo reapresentado — não é a corrida de duas abas (essa é tratada
    // pelo UPDATE atômico abaixo), é alguém usando uma cópia de um token que já foi rotacionado
    // antes. Sinal de roubo: derruba a família inteira, não só este token, pra matar também a
    // sessão de quem estiver com a cópia roubada. familyId pode ser null em tokens emitidos antes
    // desta coluna existir — nesse caso não tem família pra derrubar, só nega o token mesmo.
    if (rt.revoked) {
      if (rt.familyId) {
        await tokenRepo().update({ familyId: rt.familyId }, { revoked: true });
      }
      clearRefreshCookie(res);
      res.status(401).json({ error: 'Refresh token inválido ou expirado' });
      return;
    }

    if (rt.expiresAt < new Date()) {
      // UPDATE...WHERE revoked=false atômico, mesmo padrão do fluxo principal
      // logo abaixo — "ler, depois salvar" reabriria a mesma corrida entre
      // requisições concorrentes que esse padrão existe pra evitar.
      await tokenRepo().update({ id: rt.id, revoked: false }, { revoked: true });
      clearRefreshCookie(res);
      res.status(401).json({ error: 'Refresh token inválido ou expirado' });
      return;
    }

    // UPDATE...WHERE revoked=false é atômico no banco: se duas requisições concorrentes
    // chegarem aqui com o mesmo token, só uma consegue affected=1 e segue — a outra
    // recebe 401 em vez de as duas rotacionarem o token e uma pisar na resposta da outra.
    const result = await tokenRepo().update({ id: rt.id, revoked: false }, { revoked: true });
    if (result.affected === 0) {
      clearRefreshCookie(res);
      res.status(401).json({ error: 'Refresh token inválido ou expirado' });
      return;
    }

    const accessToken = generateAccessToken(rt.user);
    const newRefreshToken = await generateRefreshToken(rt.user, rt.familyId ?? undefined);
    setRefreshCookie(res, newRefreshToken);

    res.json(buildAuthResponse(req, accessToken, newRefreshToken));
  }

  async logout(req: Request, res: Response): Promise<void> {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] ?? req.body.refreshToken;
    if (refreshToken) {
      await tokenRepo().update({ token: hashToken(refreshToken) }, { revoked: true });
    }
    clearRefreshCookie(res);
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
    user.resetPasswordToken = hashToken(token);
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hora
    await userRepo().save(user);

    // Uma falha no envio (Resend fora do ar, API key revogada) não pode virar 500 —
    // isso quebraria o reset de senha inteiro durante qualquer instabilidade do
    // provedor E reabriria enumeração de conta (200 pra email inexistente vs. 500
    // pra existente é uma forma de descobrir quem tem conta tão boa quanto a
    // mensagem de erro que esta rota já toma cuidado de nunca revelar).
    try {
      await sendPasswordResetEmail(email, token);
    } catch (err) {
      console.error('[forgotPassword] falha ao enviar email de reset:', err);
    }

    res.json({ message: 'Se o email estiver cadastrado, você receberá as instruções.' });
  }

  async resetPassword(req: Request, res: Response): Promise<void> {
    const { token, password } = req.body;

    const user = await userRepo().findOneBy({ resetPasswordToken: hashToken(token) });
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
