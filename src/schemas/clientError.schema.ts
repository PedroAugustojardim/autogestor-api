import { z } from 'zod';

export const reportClientErrorSchema = z.object({
  message: z.string().trim().min(1).max(500),
  stack: z.string().trim().max(4000).optional(),
  platform: z.enum(['mobile', 'admin']),
  // Tela/componente onde o erro ocorreu — texto livre curto, só pra contexto no Sentry.
  context: z.string().trim().max(200).optional(),
});
