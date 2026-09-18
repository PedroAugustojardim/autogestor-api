import { z } from 'zod';
import { dateString, MAX_MONEY, MAX_KM } from './common';

export const createMaintenanceSchema = z.object({
  // Normaliza pra NFC: o mesmo texto visível ("Troca de óleo") pode chegar em
  // NFD (o + acento combinante) dependendo do cliente, e o motor de previsão
  // (MAINTENANCE_INTERVALS[tipo], utils/maintenancePrediction.ts) faz lookup de
  // objeto sem normalizar — grava sempre a mesma forma pra tipo nunca divergir
  // entre o que foi salvo e o que é comparado depois.
  tipo: z.string().trim().min(1, 'tipo é obrigatório').max(100).transform((s) => s.normalize('NFC')),
  data: dateString('Data: use o formato AAAA-MM-DD e informe uma data válida'),
  km: z.coerce.number().int().nonnegative().max(MAX_KM).nullable().optional(),
  custo: z.coerce.number().nonnegative().max(MAX_MONEY).nullable().optional(),
  descricao: z.string().trim().max(255).nullable().optional(),
  // Se enviado, cria um Reminder vinculado a esta manutenção junto (toggle "criar lembrete pro próximo?").
  criarLembrete: z.object({
    tipo: z.string().trim().min(1).max(100).transform((s) => s.normalize('NFC')),
    dataPrevista: dateString('Data prevista: use o formato AAAA-MM-DD e informe uma data válida'),
  }).nullable().optional(),
});

export const updateMaintenanceSchema = z.object({
  tipo: z.string().trim().min(1).max(100).transform((s) => s.normalize('NFC')).optional(),
  data: dateString('Data: use o formato AAAA-MM-DD e informe uma data válida').optional(),
  km: z.coerce.number().int().nonnegative().max(MAX_KM).nullable().optional(),
  custo: z.coerce.number().nonnegative().max(MAX_MONEY).nullable().optional(),
  descricao: z.string().trim().max(255).nullable().optional(),
});

export const createReminderSchema = z.object({
  tipo: z.string().trim().min(1, 'tipo é obrigatório').max(100).transform((s) => s.normalize('NFC')),
  dataPrevista: dateString('Data prevista: use o formato AAAA-MM-DD e informe uma data válida'),
});

export const updateReminderSchema = z.object({
  tipo: z.string().trim().min(1).max(100).transform((s) => s.normalize('NFC')).optional(),
  dataPrevista: dateString('Data prevista: use o formato AAAA-MM-DD e informe uma data válida').optional(),
  concluido: z.boolean().optional(),
});
