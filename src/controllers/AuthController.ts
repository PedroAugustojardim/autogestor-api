import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';
import { RefreshToken } from '../entities/RefreshToken';
import { InviteCode } from '../entities/InviteCode';
import { sendPasswordResetEmail, sendVerificationEmail } from '../services/email';
import { hashToken } from '../utils/hashToken';
import {
  generateVerificationCode,
  hashVerificationCode,
  VERIFICATION_CODE_TTL_MS,
  VERIFICATION_MAX_ATTEMPTS,
  VERIFICATION_RESEND_COOLDOWN_MS,
} from '../utils/verificationCode';
import { isTrustedMobileClient } from '../utils/clientDetection';
import { logger } from '../utils/logger';

const userRepo = () => AppDataSource.getRepository(User);
const tokenRepo = () => AppDataSource.getRepository(RefreshToken);

// bcrypt custo 12 de uma senha descartável — só existe pra o login gastar o mesmo tempo
// quando o email não tem conta. Precisa ter o MESMO custo do hash real (12, ver register).
const DUMMY_PASSWORD_HASH = '$2a$12$89nV6cGJKotgNcHNev7GXu8WfW7zjJ/F19y4VDenSiDZ2VykidGFC';

// Lançado dentro da transação de cadastro pra desfazê-la inteira (inclusive o convite).
class EmailTakenError extends Error {}

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

// Cookie primeiro (admin), body como fallback (mobile) — mas só aceita string. O
// cookie-parser converte qualquer cookie que começa com `j:` em objeto via JSON.parse
// (`refreshToken=j:{"a":1}` vira `{a:1}`), e um objeto aqui estourava em hashToken
// (crypto.update exige string) como TypeError → 500 + evento no Sentry, num endpoint
// sem login. Valor que não é string é tratado como "não fornecido".
function readRefreshToken(req: Request): string | undefined {
  const fromCookie = req.cookies?.[REFRESH_COOKIE_NAME];
  if (typeof fromCookie === 'string' && fromCookie.length > 0) return fromCookie;
  const fromBody = req.body?.refreshToken;
  return typeof fromBody === 'string' && fromBody.length > 0 ? fromBody : undefined;
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

    // Email de conta confirmada, ou de cadastro ainda aguardando confirmação com o código
    // vigente, é sempre 409 — com a MESMA mensagem nos dois casos, pra não distinguir.
    // Só um cadastro não confirmado cujo código já expirou é substituído (o dono do email
    // nunca chegou a provar que é dele). Nunca sobrescrever um cadastro pendente ainda
    // válido: senão alguém com um convite qualquer registraria o email da vítima logo depois
    // dela, o código novo chegaria na caixa dela, e ao digitá-lo ela confirmaria uma conta
    // cuja SENHA é do atacante (pre-hijacking). Quem perdeu o email pro squatting recupera
    // pelo "esqueci minha senha", que prova a posse da caixa e define a senha dela.
    const existing = await userRepo().findOneBy({ email });
    const pendingStillValid = !!existing && !existing.emailVerifiedAt
      && !!existing.emailVerificationExpires && existing.emailVerificationExpires > new Date();
    if (existing && (existing.emailVerifiedAt || pendingStillValid)) {
      res.status(409).json({ error: 'Email já cadastrado' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const hashedInvite = hashToken(inviteCode);
    const verificationCode = generateVerificationCode();
    const verificationExpires = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);

    // Reivindicação do convite, criação do usuário e marcação de "usado por" numa
    // transação só — se qualquer passo falhar (inclusive um crash no meio), o banco
    // desfaz tudo sozinho, sem precisar de rollback manual escrito à mão.
    let user: User | null;
    try {
      user = await this.createPendingUser(existing, { name, email, passwordHash }, hashedInvite, verificationCode, verificationExpires);
    } catch (err) {
      if (err instanceof EmailTakenError || (err as { code?: string })?.code === 'ER_DUP_ENTRY') {
        res.status(409).json({ error: 'Email já cadastrado' });
        return;
      }
      throw err;
    }

    if (!user) {
      res.status(400).json({ error: 'Código de convite inválido, expirado ou já utilizado' });
      return;
    }

    // Falha de envio (Resend fora do ar, chave errada) não derruba o cadastro: a conta já
    // existe e a pessoa pede um novo código na tela de confirmação.
    try {
      await sendVerificationEmail(user.email, verificationCode);
    } catch (err) {
      logger.error({ err }, '[register] falha ao enviar email de verificação');
    }

    // Sem tokens aqui: quem se cadastra só ganha sessão depois de provar que a caixa de
    // email é dela (POST /auth/verify-email).
    res.status(201).json({ verificationRequired: true, email: user.email });
  }

  // Cria a conta (ou substitui uma pendente expirada) e consome o convite, tudo numa
  // transação. Retorna null se o convite não valer; lança EmailTakenError se o email foi
  // confirmado por outra requisição no meio do caminho (a transação inteira desfaz, o
  // convite volta a ficar livre).
  private async createPendingUser(
    existing: User | null,
    data: { name: string; email: string; passwordHash: string },
    hashedInvite: string,
    verificationCode: string,
    verificationExpires: Date,
  ): Promise<User | null> {
    return AppDataSource.transaction(async (manager) => {
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

      let target: User;
      if (existing) {
        // Substitui a conta pendente expirada. UPDATE condicional (email_verified_at IS
        // NULL), não save() de um objeto lido antes: se o dono confirmou o email no
        // intervalo, isto não pode sobrescrever a senha dele.
        const replaced = await manager
          .createQueryBuilder()
          .update(User)
          .set({
            name: data.name,
            passwordHash: data.passwordHash,
            emailVerificationCode: hashVerificationCode(existing.id, verificationCode),
            emailVerificationExpires: verificationExpires,
            emailVerificationAttempts: 0,
          })
          .where('id = :id AND email_verified_at IS NULL', { id: existing.id })
          .execute();
        if (replaced.affected === 0) throw new EmailTakenError();
        target = existing;
      } else {
        target = manager.create(User, { name: data.name, email: data.email, passwordHash: data.passwordHash });
        await manager.save(target);
        // O id só existe depois do INSERT, e o hash do código é amarrado a ele.
        await manager.update(User, target.id, {
          emailVerificationCode: hashVerificationCode(target.id, verificationCode),
          emailVerificationExpires: verificationExpires,
          emailVerificationAttempts: 0,
        });
      }

      await manager
        .createQueryBuilder()
        .update(InviteCode)
        .set({ usedBy: target.id })
        .where('code = :code', { code: hashedInvite })
        .execute();

      return target;
    });
  }

  async login(req: Request, res: Response): Promise<void> {
    const { email, password } = req.body;

    const user = await userRepo().findOneBy({ email });
    // Sem usuário, compara contra um hash fixo mesmo assim. Sem isto, "email não existe"
    // respondia em ~10ms e "email existe, senha errada" em ~300ms (bcrypt custo 12): medido,
    // 33x de diferença — dava pra descobrir quais emails têm conta só cronometrando o login.
    const passwordOk = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_PASSWORD_HASH);
    if (!user || !passwordOk) {
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

    // Depois da checagem da senha (nunca revela o estado da conta pra quem não sabe a
    // senha). O `code` é o que o app usa pra levar a pessoa à tela de confirmação.
    if (!user.emailVerifiedAt) {
      res.status(403).json({ error: 'Confirme seu email para entrar.', code: 'email_not_verified' });
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
    const refreshToken = readRefreshToken(req);
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
    const refreshToken = readRefreshToken(req);
    if (refreshToken) {
      await tokenRepo().update({ token: hashToken(refreshToken) }, { revoked: true });
    }
    clearRefreshCookie(res);
    res.status(204).send();
  }

  // POST /auth/verify-email { email, code } — prova a posse da caixa de email e, só então,
  // abre a primeira sessão (mesma resposta do login).
  async verifyEmail(req: Request, res: Response): Promise<void> {
    const { email, code } = req.body;
    const invalid = () => res.status(400).json({ error: 'Código inválido ou expirado' });

    const user = await userRepo().findOneBy({ email });
    if (!user || user.emailVerifiedAt || !user.emailVerificationCode) { invalid(); return; }

    // Passo 1 — conta a tentativa ANTES de olhar se o código bate, atomicamente no banco. Se
    // a contagem viesse depois da comparação, ou fosse "ler o contador, comparar, gravar", N
    // requisições concorrentes ganhariam N palpites com o mesmo contador. Assim o total de
    // palpites por código é no máximo VERIFICATION_MAX_ATTEMPTS, não importa a concorrência.
    const now = new Date();
    const counted = await userRepo()
      .createQueryBuilder()
      .update(User)
      .set({ emailVerificationAttempts: () => 'email_verification_attempts + 1' })
      .where('id = :id AND email_verified_at IS NULL', { id: user.id })
      .andWhere('email_verification_attempts < :max', { max: VERIFICATION_MAX_ATTEMPTS })
      .andWhere('email_verification_expires > :now', { now })
      .execute();
    if (counted.affected === 0) { invalid(); return; }

    // Passo 2 — compara e consome o código num UPDATE só (o hash vai no WHERE). Nunca há
    // uma janela em que "o código bateu" fica separado de "a conta virou verificada".
    const claimed = await userRepo()
      .createQueryBuilder()
      .update(User)
      .set({ emailVerifiedAt: now, emailVerificationCode: null, emailVerificationExpires: null, emailVerificationAttempts: 0 })
      .where('id = :id AND email_verified_at IS NULL', { id: user.id })
      .andWhere('email_verification_code = :hash', { hash: hashVerificationCode(user.id, code) })
      .andWhere('email_verification_expires > :now', { now })
      .execute();
    if (claimed.affected === 0) { invalid(); return; }

    const verified = await userRepo().findOneBy({ id: user.id });
    if (!verified) { invalid(); return; }
    if (verified.blocked) {
      res.status(403).json({ error: 'Conta bloqueada. Entre em contato com o suporte.' });
      return;
    }

    await userRepo().update(verified.id, { lastLoginAt: new Date() });
    const accessToken = generateAccessToken(verified);
    const refreshToken = await generateRefreshToken(verified);
    setRefreshCookie(res, refreshToken);

    res.json(buildAuthResponse(req, accessToken, refreshToken, {
      user: { id: verified.id, name: verified.name, email: verified.email, plano: verified.plano },
    }));
  }

  // POST /auth/resend-verification { email } — sempre a mesma resposta 200, exista a conta
  // ou não (e já esteja confirmada ou não), pra não virar oráculo de "este email tem conta".
  async resendVerification(req: Request, res: Response): Promise<void> {
    const { email } = req.body;
    const generic = { message: 'Se o cadastro estiver aguardando confirmação, enviamos um novo código.' };

    const user = await userRepo().findOneBy({ email });
    if (!user || user.emailVerifiedAt) { res.json(generic); return; }

    // Cooldown: o código atual foi emitido há menos de VERIFICATION_RESEND_COOLDOWN_MS se
    // ele ainda tem quase o TTL inteiro pela frente. Sem coluna extra pra "último envio".
    const sentJustNow = !!user.emailVerificationExpires
      && user.emailVerificationExpires.getTime() - Date.now() > VERIFICATION_CODE_TTL_MS - VERIFICATION_RESEND_COOLDOWN_MS;
    if (sentJustNow) { res.json(generic); return; }

    const code = generateVerificationCode();
    const updated = await userRepo()
      .createQueryBuilder()
      .update(User)
      .set({
        emailVerificationCode: hashVerificationCode(user.id, code),
        emailVerificationExpires: new Date(Date.now() + VERIFICATION_CODE_TTL_MS),
        emailVerificationAttempts: 0,
      })
      .where('id = :id AND email_verified_at IS NULL', { id: user.id })
      .execute();

    // Sem `await`: mesmo motivo do forgotPassword — o tempo de resposta não pode revelar
    // se o email tem um cadastro pendente.
    if (updated.affected) {
      sendVerificationEmail(user.email, code).catch((err) => {
        logger.error({ err }, '[resendVerification] falha ao enviar email de verificação');
      });
    }

    res.json(generic);
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
    //
    // Sem `await` de propósito: esperar o Resend (uma chamada de rede de centenas de ms)
    // só quando a conta existe fazia "existe" demorar muito mais que "não existe" — o
    // mesmo oráculo de existência de conta, agora por tempo de resposta.
    sendPasswordResetEmail(email, token).catch((err) => {
      logger.error({ err }, '[forgotPassword] falha ao enviar email de reset');
    });

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
    // Ter recebido e usado o token de reset prova a posse da caixa de email tanto quanto
    // o código de confirmação — e é o caminho de quem teve o cadastro "squatado" por outra
    // pessoa: a senha do atacante é substituída pela dele e a conta passa a valer.
    if (!user.emailVerifiedAt) {
      user.emailVerifiedAt = new Date();
      user.emailVerificationCode = null;
      user.emailVerificationExpires = null;
      user.emailVerificationAttempts = 0;
    }
    await userRepo().save(user);

    await tokenRepo().update({ userId: user.id }, { revoked: true });

    res.json({ message: 'Senha redefinida com sucesso' });
  }
}
