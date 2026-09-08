import Bull from 'bull';
import * as dotenv from 'dotenv';

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
for (const queue of [reminderQueue, consultaQueue]) {
  queue.on('error', (err: NodeJS.ErrnoException) => {
    console.error(`[bull:${queue.name}] erro de conexão com Redis:`, err.message || err.code || err);
  });
}
