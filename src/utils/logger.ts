import pino from 'pino';

// Log estruturado (JSON, nível, timestamp) — substitui os console.* dispersos
// pela API inteira. Não é o mesmo papel do Sentry: isto é a trilha de auditoria
// que sobrevive independente de qualquer cota de terceiro; Sentry fica reservado
// pra exceção real e evento de segurança alertável (ver securityEvent.ts).
export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  formatters: {
    level: (label) => ({ level: label }),
  },
});
