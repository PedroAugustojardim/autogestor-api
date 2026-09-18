import Bull from 'bull';
import * as dotenv from 'dotenv';
import * as Sentry from '@sentry/node';
import { logger } from '../utils/logger';

dotenv.config();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Só declarar fila aqui quando ela já tiver um worker de verdade (ver src/workers/) —
// `new Bull(...)` abre conexões reais com o Redis na hora, então uma fila sem
// consumidor só desperdiça handles à toa. Quando a Etapa 7 (email transacional)
// precisar de fila própria, declarar ali.
export const reminderQueue = new Bull('reminders', redisUrl);
export const consultaQueue = new Bull('consultas', redisUrl);

// Bull (EventEmitter) derruba o processo com um erro não tratado se 'error' for
// emitido sem listener — sem isso, o Redis cair levaria a API inteira junto, não só
// os jobs. Só loga: a API continua servindo HTTP normalmente com o Redis fora.
//
// 'failed'/'stalled' não existiam antes — se um job falhasse de verdade (exceção
// fora do try/catch interno do loop, timeout, job travado), ficava invisível: só
// aparecia no estado interno do Bull dentro do Redis, sem log de aplicação e sem
// alerta. Sem 'completed' de propósito: as filas rodam ~1x/dia via cron, "completou"
// não é sinal de erro, é ruído sem valor de alerta.
for (const queue of [reminderQueue, consultaQueue]) {
  queue.on('error', (err: NodeJS.ErrnoException) => {
    logger.error({ queue: queue.name, err }, 'erro de conexão com Redis');
  });
  queue.on('failed', (job, err) => {
    logger.error({ queue: queue.name, jobId: job.id, jobName: job.name, attemptsMade: job.attemptsMade }, 'job falhou');
    Sentry.captureException(err, { tags: { queue: queue.name, job: job.name } });
  });
  queue.on('stalled', (job) => {
    logger.warn({ queue: queue.name, jobId: job.id, jobName: job.name }, 'job travado (stalled)');
    Sentry.captureMessage(`Job travado: ${queue.name}/${job.name}`, { level: 'warning', tags: { queue: queue.name } });
  });
}
