import * as Sentry from '@sentry/node';
import { logger } from './logger';

// Trilha de auditoria (sempre) + alerta (só quando opts.alert=true) para eventos
// que importam pra segurança, não só pra debug — distinto de logger.error solto,
// que é qualquer erro de operação. Nem todo evento de segurança merece alertar:
// tratar todos igual é o mesmo que não ter alerta nenhum (ruído demais pra checar).
export function recordSecurityEvent(
  name: string,
  payload: Record<string, unknown>,
  opts: { alert?: boolean } = {},
): void {
  logger.warn({ event_type: 'security', event_name: name, ...payload });
  if (opts.alert) {
    Sentry.captureMessage(`security:${name}`, {
      level: 'warning',
      tags: { event_type: 'security', event_name: name },
      extra: payload,
    });
  }
}
