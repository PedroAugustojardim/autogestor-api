import 'reflect-metadata';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import * as dotenv from 'dotenv';
import * as Sentry from '@sentry/node';
import authRoutes from './routes/auth.routes';
import vehicleRoutes from './routes/vehicle.routes';
import userRoutes from './routes/user.routes';
import { categoryRouter, expenseRouter } from './routes/expense.routes';
import reportRoutes from './routes/report.routes';
import { maintenanceRouter, reminderRouter } from './routes/maintenance.routes';
import notificationRoutes from './routes/notification.routes';
import { subscriptionRouter, subscriptionPublicRouter, mercadoPagoWebhookRouter } from './routes/subscription.routes';
import { consultaRouter } from './routes/consulta.routes';
import adminRoutes from './routes/admin.routes';
import clientErrorRoutes from './routes/clientError.routes';
import { logger } from './utils/logger';

dotenv.config();

const app = express();

app.set('trust proxy', 1); // Railway/Heroku/Render ficam atrás de proxy reverso
app.use(helmet());

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Requisição de navegador com Origin fora da allowlist recebe 403 limpo, sem chegar em
// nenhuma rota. Antes isso era um `callback(new Error(...))` do próprio cors, que
// caía no handler global como 500 E virava um evento no Sentry por requisição — sem
// login e sem limiter (roda antes de todos), dava pra queimar a cota do Sentry e
// cegar a detecção só mandando `Origin: qualquer-coisa` em loop.
//
// Rejeitar aqui (e não só omitir o Access-Control-Allow-Origin) também é o que impede
// CSRF nos endpoints de cookie (/auth/refresh, /auth/logout, com SameSite=None em
// produção): o navegador sempre manda Origin em POST cross-site, então uma página
// de terceiros não consegue disparar essas rotas. O app mobile não manda Origin
// (não é navegador) e passa direto.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.includes(origin)) {
    res.status(403).json({ error: 'Origem não permitida' });
    return;
  }
  next();
});

app.use(cors({
  // A checagem de verdade é o middleware acima; aqui só devolve o veredito pro cors
  // montar os headers, sem nunca lançar erro (um `new Error` aqui vira 500 + Sentry).
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)),
  credentials: true,
}));

// Antes do redirect HTTPS: o healthcheck do Railway (railway.toml) bate direto
// no container pela rede interna, sem passar pela borda que seta
// x-forwarded-proto — se ficasse depois do redirect, levaria um 308 em vez de
// 200 e o Railway marcaria o deploy como unhealthy.
app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

if (process.env.NODE_ENV === 'production') {
  // Host canônico vem do APP_URL (já obrigatório em produção pro webhook do Mercado
  // Pago), não do header Host da requisição — esse é escolhido por quem faz o request,
  // e refleti-lo no Location era um open redirect (`Host: evil.example` → 308 pra
  // https://evil.example/...). Sem APP_URL válido cai no comportamento antigo.
  let canonicalHost: string | null = null;
  try {
    if (process.env.APP_URL) canonicalHost = new URL(process.env.APP_URL).host;
  } catch {
    canonicalHost = null;
  }

  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] === 'https') {
      next();
    } else {
      // 308 (não 301) preserva método e corpo no redirect — um 301 em POST faz a
      // maioria dos clientes reenviar como GET sem corpo, o que quebraria o
      // webhook do Mercado Pago se esse cabeçalho não chegar corretamente.
      res.redirect(308, `https://${canonicalHost ?? req.headers.host}${req.originalUrl}`);
    }
  });
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
// Prefixo específico (não /api/v1 puro): um /api/v1 bare seria prefixo de toda
// rota do sistema, e o roteamento aqui é sensível a isso — ver comentário em
// expense.routes.ts sobre o bug que isso já causou (webhook do MP inalcançável).
app.use('/api/v1/expense-categories', categoryRouter);
app.use('/api/v1/vehicles', expenseRouter);  // /api/v1/vehicles/:id/expenses
app.use('/api/v1/vehicles', reportRoutes);   // relatórios por veículo
app.use('/api/v1/vehicles', maintenanceRouter); // /api/v1/vehicles/:id/maintenance
app.use('/api/v1/vehicles', reminderRouter);    // /api/v1/vehicles/:id/reminders
app.use('/api/v1/vehicles', consultaRouter);    // /api/v1/vehicles/:id/{fines,ipva,debts,recalls} — Premium
app.use('/api/v1/vehicles', vehicleRoutes);  // CRUD de veículos
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/subscriptions', subscriptionRouter);
app.use('/api/v1/subscriptions', subscriptionPublicRouter);
app.use('/api/v1/webhooks', mercadoPagoWebhookRouter);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/client-errors', clientErrorRoutes);

// Precisa vir depois de todas as rotas e antes do handler de erro abaixo —
// captura qualquer exceção que chegue até aqui e cria um evento no Sentry antes
// do handler final responder ao cliente.
Sentry.setupExpressErrorHandler(app);

// Handler de erro global — toda rota async agora usa asyncHandler, que encaminha
// qualquer rejeição pra cá em vez de virar unhandled rejection e derrubar o processo.
app.use((err: Error & { status?: number; statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
  // Erros que os próprios middlewares já classificam como culpa do client (JSON
  // malformado e corpo acima do limite vindos do body-parser, URL com percent-encoding
  // inválido) carregam um status 4xx — responder 500 pra isso mentia pro client e
  // sujava o log com "erro interno" que qualquer um dispara com um corpo quebrado.
  const status = err.status ?? err.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    res.status(status).json({ error: status === 413 ? 'Corpo da requisição grande demais' : 'Requisição inválida' });
    return;
  }
  logger.error({ err }, 'erro não tratado em rota');
  res.status(500).json({ error: 'Erro interno do servidor' });
});

export default app;
