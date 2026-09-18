import { Response } from 'express';
import * as Sentry from '@sentry/node';
import { AuthRequest } from '../middleware/auth';

// POST /client-errors — recebe erro JS não capturado do admin (Error Boundary) ou
// do mobile (ErrorUtils.setGlobalHandler) e reporta pro Sentry do lado do servidor.
// Existe porque o app mobile (bare React Native, sem Expo) não tem o SDK nativo do
// Sentry instalado ainda — instalar isso exige build nativo (Gradle/Pod), custo
// desproporcional pro tamanho do piloto agora. Isso dá "saber que aconteceu e mais
// ou menos onde" a custo zero, sem symbolication de stack nativo.
export class ClientErrorController {
  async report(req: AuthRequest, res: Response): Promise<void> {
    const { message, stack, platform, context } = req.body;

    Sentry.captureMessage(`client_error:${platform}`, {
      level: 'error',
      tags: { event_type: 'client_error', platform },
      extra: { message, stack, context, userId: req.userId },
    });

    res.status(204).send();
  }
}
