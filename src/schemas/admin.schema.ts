import { z } from 'zod';

export const blockUserSchema = z.object({
  blocked: z.boolean(),
});

export const setUserPlanSchema = z.object({
  plano: z.enum(['gratuito', 'premium_mensal', 'premium_anual']),
});

export const generateInviteCodesSchema = z.object({
  quantidade: z.coerce.number().int().min(1).max(50).optional(),
  // Teto de 1 ano: sem ele, um valor enorme virava Invalid Date e o convite era salvo sem expiração.
  diasValidade: z.coerce.number().int().min(1).max(365).optional(),
});
