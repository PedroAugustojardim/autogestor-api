import * as Sentry from '@sentry/node';

// Precisa ser o PRIMEIRO import de src/index.ts (antes até de reflect-metadata) —
// a auto-instrumentação HTTP do SDK precisa rodar antes de `express` ser
// importado por qualquer coisa, e app.ts importa express na primeira linha.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  // Sem caso de uso de APM/tracing com 2 testers no piloto — deixar em 0 evita
  // queimar a cota grátis com dado que ninguém vai olhar ainda.
  tracesSampleRate: 0,
  // Sem sendDefaultPii:false, a primeira exceção capturada em /auth/login mandaria
  // o corpo da requisição (email+password em texto claro, antes do hash) pros
  // servidores do Sentry — a "solução de observabilidade" viraria ela mesma um
  // novo operador de dado pessoal de brasileiro não avaliado.
  sendDefaultPii: false,
  // Desligados de propósito: o comportamento default (onUnhandledRejectionIntegration
  // em modo "warn", onUncaughtExceptionIntegration que não força saída quando há
  // outro handler registrado) não entra em conflito com os handlers manuais de
  // src/index.ts, mas capturar automaticamente E manualmente reportaria o mesmo
  // evento duas vezes. Os handlers manuais (index.ts) mantêm controle explícito do
  // flush antes do process.exit — sem isso, o evento mais importante (o que
  // derrubou o processo) fica na fila de envio assíncrono e nunca sai.
  integrations: (defaults) =>
    defaults.filter((i) => i.name !== 'OnUncaughtException' && i.name !== 'OnUnhandledRejection'),
  beforeSend(event) {
    if (event.request) {
      delete event.request.cookies;
      delete event.request.data;
      if (event.request.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
    }
    return event;
  },
});
