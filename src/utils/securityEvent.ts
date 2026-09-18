import * as Sentry from '@sentry/node';
import { logger } from './logger';

// Um alerta por chave a cada ALERT_WINDOW_MS, o resto só conta. Sem isso, qualquer
// um sem login gerava 1 evento no Sentry POR requisição: o handler do limiter roda
// a cada requisição acima do limite, e webhook_signature_invalid a cada POST com
// assinatura ruim (o webhook é público e sem limiter de propósito). Bastavam
// alguns minutos de loop pra estourar a cota grátis do Sentry — e depois disso os
// eventos reais (inclusive o do ataque de verdade) eram descartados em silêncio.
// A trilha de auditoria (logger.warn) continua registrando TODAS as ocorrências;
// só o canal de alerta é limitado, e o próximo alerta informa quantas foram abafadas.
const ALERT_WINDOW_MS = 5 * 60_000;
const lastAlertAt = new Map<string, number>();
const suppressedSince = new Map<string, number>();

// Trilha de auditoria (sempre) + alerta (só quando opts.alert=true) para eventos
// que importam pra segurança, não só pra debug — distinto de logger.error solto,
// que é qualquer erro de operação. Nem todo evento de segurança merece alertar:
// tratar todos igual é o mesmo que não ter alerta nenhum (ruído demais pra checar).
//
// throttleKey: separa a janela de alerta por subtipo (ex.: cada limiter tem a sua),
// pra um flood de /login não abafar o primeiro alerta de /register. Precisa ser de
// cardinalidade fixa — nunca IP/usuário, senão o Map cresce sem limite.
export function recordSecurityEvent(
  name: string,
  payload: Record<string, unknown>,
  opts: { alert?: boolean; throttleKey?: string } = {},
): void {
  logger.warn({ event_type: 'security', event_name: name, ...payload });
  if (!opts.alert) return;

  const key = opts.throttleKey ? `${name}:${opts.throttleKey}` : name;
  const now = Date.now();
  const last = lastAlertAt.get(key);
  if (last !== undefined && now - last < ALERT_WINDOW_MS) {
    suppressedSince.set(key, (suppressedSince.get(key) ?? 0) + 1);
    return;
  }

  const suppressed = suppressedSince.get(key) ?? 0;
  suppressedSince.delete(key);
  lastAlertAt.set(key, now);

  Sentry.captureMessage(`security:${name}`, {
    level: 'warning',
    tags: { event_type: 'security', event_name: name },
    extra: { ...payload, suppressedSinceLastAlert: suppressed },
  });
}
