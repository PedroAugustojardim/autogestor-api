import { z } from 'zod';

export const blockUserSchema = z.object({
  blocked: z.boolean(),
});

export const setUserPlanSchema = z.object({
  plano: z.enum(['gratuito', 'premium_mensal', 'premium_anual']),
});

export const generateInviteCodesSchema = z.object({
  quantidade: z.coerce.number().int().min(1).max(50).optional(),
  diasValidade: z.coerce.number().int().min(1).optional(),
});
