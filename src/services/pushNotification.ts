import { initializeApp, cert, App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import * as dotenv from 'dotenv';

// Este módulo lê process.env.FIREBASE_SERVICE_ACCOUNT_JSON já na importação
// (abaixo), então não pode depender de outro módulo ter carregado o .env antes.
dotenv.config();

// Sem FIREBASE_SERVICE_ACCOUNT_JSON (nenhum projeto Firebase criado ainda), cai no
// fallback de log — mesmo padrão do Resend/Mercado Pago. O worker que chama isto
// (consultaWorker) sempre cria a notificação in-app também, então o usuário é
// avisado de qualquer forma; push é só um reforço quando estiver configurado.
let app: App | null = null;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    app = initializeApp({ credential: cert(serviceAccount) });
  }
} catch (err) {
  console.error('[push] FIREBASE_SERVICE_ACCOUNT_JSON inválido — push desabilitado:', (err as Error).message);
}

export function isPushConfigured(): boolean {
  return app !== null;
}

export async function sendPushNotification(fcmToken: string, title: string, body: string): Promise<void> {
  if (!app) {
    console.log(`[DEV] Firebase não configurado — push "${title}" não enviado (token ${fcmToken.slice(0, 12)}...)`);
    return;
  }

  try {
    await getMessaging(app).send({
      token: fcmToken,
      notification: { title, body },
    });
  } catch (err) {
    // Token inválido/expirado é normal (app desinstalado, token rotacionado) — não
    // deve derrubar o job que chamou isto, só logar e seguir.
    console.error(`[push] falha ao enviar notificação:`, (err as Error).message);
  }
}
