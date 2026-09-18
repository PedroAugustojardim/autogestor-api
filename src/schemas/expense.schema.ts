import { z } from 'zod';
import { dateString, MAX_MONEY, MAX_LITERS, MAX_KM } from './common';

const DATA_MSG = 'Data: use o formato AAAA-MM-DD e informe uma data válida';

export const createExpenseSchema = z.object({
  categoryId: z.coerce.number().int().positive('categoryId é obrigatório'),
  valor: z.coerce.number().positive('O valor deve ser maior que zero').max(MAX_MONEY),
  data: dateString(DATA_MSG),
  descricao: z.string().trim().max(255).nullable().optional(),
  kmAtual: z.coerce.number().int().nonnegative().max(MAX_KM).nullable().optional(),
  litros: z.coerce.number().positive().max(MAX_LITERS).nullable().optional(),
  precoLitro: z.coerce.number().positive().max(MAX_LITERS).nullable().optional(),
  tipoCombustivel: z.string().trim().max(30).nullable().optional(),
});

export const updateExpenseSchema = z.object({
  valor: z.coerce.number().positive('O valor deve ser maior que zero').max(MAX_MONEY).optional(),
  data: dateString(DATA_MSG).optional(),
  descricao: z.string().trim().max(255).nullable().optional(),
  kmAtual: z.coerce.number().int().nonnegative().max(MAX_KM).nullable().optional(),
  litros: z.coerce.number().positive().max(MAX_LITERS).nullable().optional(),
  precoLitro: z.coerce.number().positive().max(MAX_LITERS).nullable().optional(),
  tipoCombustivel: z.string().trim().max(30).nullable().optional(),
});
