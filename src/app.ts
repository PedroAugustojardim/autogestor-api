import 'reflect-metadata';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import * as dotenv from 'dotenv';
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

dotenv.config();

const app = express();

app.set('trust proxy', 1); // Railway/Heroku/Render ficam atrás de proxy reverso
app.use(helmet());

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Sem origin = requisição server-to-server ou ferramenta tipo curl/Postman — permitir.
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Origem não permitida por CORS'));
    }
  },
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
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] === 'https') {
      next();
    } else {
      // 308 (não 301) preserva método e corpo no redirect — um 301 em POST faz a
      // maioria dos clientes reenviar como GET sem corpo, o que quebraria o
      // webhook do Mercado Pago se esse cabeçalho não chegar corretamente.
      res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
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

// Handler de erro global — toda rota async agora usa asyncHandler, que encaminha
// qualquer rejeição pra cá em vez de virar unhandled rejection e derrubar o processo.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

export default app;
