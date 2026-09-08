import { z } from 'zod';

export const checkoutSchema = z.object({
  plano: z.enum(['premium_mensal', 'premium_anual'], {
    errorMap: () => ({ message: 'Plano inválido. Use: premium_mensal ou premium_anual' }),
  }),
});
