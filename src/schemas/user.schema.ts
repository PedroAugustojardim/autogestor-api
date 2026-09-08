import { z } from 'zod';
import { passwordSchema, emailSchema } from './auth.schema';

export const updateMeSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  email: emailSchema.optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'currentPassword é obrigatório'),
  newPassword: passwordSchema,
});

// upgradePlanSchema removido junto com PUT /me/plan e UserController.upgradePlan —
// o upgrade de plano agora é só via POST /subscriptions/checkout + webhook do
// Mercado Pago (ver SubscriptionController). PUT /me/plan não existe mais (404),
// não responde mais 501.

export const updateNotificationsSchema = z.object({
  notificationsEnabled: z.boolean(),
});
