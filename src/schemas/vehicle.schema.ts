import { z } from 'zod';

const vehicleType = z.enum(['carro', 'moto', 'caminhao', 'van']);

export const createVehicleSchema = z.object({
  tipo: vehicleType,
  marca: z.string().trim().min(1, 'marca é obrigatória').max(100),
  modelo: z.string().trim().min(1, 'modelo é obrigatório').max(100),
  ano: z.coerce.number().int().min(1900).max(2100).nullable().optional(),
  cor: z.string().trim().max(50).nullable().optional(),
  apelido: z.string().trim().max(50).nullable().optional(),
});

export const updateVehicleSchema = z.object({
  marca: z.string().trim().min(1).max(100).optional(),
  modelo: z.string().trim().min(1).max(100).optional(),
  ano: z.coerce.number().int().min(1900).max(2100).nullable().optional(),
  cor: z.string().trim().max(50).nullable().optional(),
  apelido: z.string().trim().max(50).nullable().optional(),
});

// Placa antiga (AAA1234) ou padrão Mercosul (AAA1A23) — maiúsculas, sem hífen.
const placaRegex = /^[A-Z]{3}[0-9]{4}$|^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;

export const linkPlateSchema = z.object({
  placa: z.string().trim().toUpperCase().regex(placaRegex, 'Placa inválida — use o formato AAA1234 ou AAA1A23'),
  renavam: z.string().trim().regex(/^\d{11}$/, 'RENAVAM deve ter 11 dígitos'),
});
