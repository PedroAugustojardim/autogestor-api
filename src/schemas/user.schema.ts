import { z } from 'zod';
import { passwordSchema } from './auth.schema';

// Sem `email` de propósito. Nenhum cliente troca email hoje (a tela de perfil do mobile só
// manda `name`), então aceitar o campo aqui só servia a quem roubasse um access token:
// trocar o email pro dele e tomar a conta de vez pelo "esqueci minha senha". Zod remove
// chaves desconhecidas, então um `email` no corpo é simplesmente ignorado. Quando a troca
// de email virar feature: exigir senha atual + confirmar o email NOVO por código antes de
// aplicar (mesmo fluxo de /auth/verify-email).
export const updateMeSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
});

// Excluir a conta é irreversível pro usuário — e o app não tem essa tela ainda, então
// exigir a senha atual não quebra nenhum cliente. Sem isso, um access token roubado
// (15 min) apagava a conta sem nenhum atrito.
export const deleteAccountSchema = z.object({
  currentPassword: z.string().min(1, 'currentPassword é obrigatório'),
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
