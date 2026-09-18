import './instrument';
import 'reflect-metadata';
import * as Sentry from '@sentry/node';
import app from './app';
import { AppDataSource } from './config/database';
import { startReminderWorker } from './workers/reminderWorker';
import { startConsultaWorker } from './workers/consultaWorker';
import { logger } from './utils/logger';

// Captura erros do express-rate-limit causados por proxy reverso (Railway/Heroku)
// sem este handler o processo morre com ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
process.on('unhandledRejection', (reason: any) => {
  if (reason?.code === 'ERR_ERL_UNEXPECTED_X_FORWARDED_FOR') return;
  logger.error({ reason }, 'unhandled rejection');
  Sentry.captureException(reason);
  Sentry.flush(2000).finally(() => process.exit(1));
});

// Antes não existia handler nenhum aqui — uma exceção síncrona não capturada em
// qualquer parte do código derrubava o processo sem log estruturado nenhum, só o
// stack cru do Node no stderr.
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaught exception');
  Sentry.captureException(err);
  Sentry.flush(2000).finally(() => process.exit(1));
});

// Em produção o RESEND_API_KEY também é obrigatório: o cadastro só vira sessão depois do
// código enviado por email, então sem a chave ninguém novo consegue entrar (e sem isso
// o sintoma seria "o app não deixa ninguém logar", bem longe da causa). Falhar no boot
// aponta direto pra variável que falta. Resend só entrega pra qualquer destinatário com
// um domínio verificado (RESEND_FROM_EMAIL) — com onboarding@resend.dev só chega no email
// dono da conta Resend.
const REQUIRED_ENV = ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
if (process.env.NODE_ENV === 'production') REQUIRED_ENV.push('RESEND_API_KEY');
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  logger.error({ missing }, 'variáveis de ambiente obrigatórias não definidas');
  process.exit(1);
}

const PORT = process.env.PORT || 3000;

AppDataSource.initialize()
  .then(() => {
    logger.info('banco de dados conectado');
    startReminderWorker();
    startConsultaWorker();
    app.listen(PORT, () => {
      logger.info({ port: PORT }, 'servidor rodando');
    });
  })
  .catch((err) => {
    logger.error({ err }, 'erro ao conectar no banco');
    process.exit(1);
  });
