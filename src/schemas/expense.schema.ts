import { z } from 'zod';

export const createExpenseSchema = z.object({
  categoryId: z.coerce.number().int().positive('categoryId é obrigatório'),
  valor: z.coerce.number().positive('O valor deve ser maior que zero'),
  data: z.string().min(1, 'data é obrigatória'),
  descricao: z.string().trim().max(255).nullable().optional(),
  kmAtual: z.coerce.number().int().nonnegative().nullable().optional(),
  litros: z.coerce.number().positive().nullable().optional(),
  precoLitro: z.coerce.number().positive().nullable().optional(),
  tipoCombustivel: z.string().trim().max(30).nullable().optional(),
});

export const updateExpenseSchema = z.object({
  valor: z.coerce.number().positive('O valor deve ser maior que zero').optional(),
  data: z.string().min(1).optional(),
  descricao: z.string().trim().max(255).nullable().optional(),
  kmAtual: z.coerce.number().int().nonnegative().nullable().optional(),
  litros: z.coerce.number().positive().nullable().optional(),
  precoLitro: z.coerce.number().positive().nullable().optional(),
  tipoCombustivel: z.string().trim().max(30).nullable().optional(),
});
