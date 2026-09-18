import { z } from 'zod';

// Formato usado em todo o app (ver autogestor-mobile/src/utils/date.ts,
// todayLocalISO): "YYYY-MM-DD". Além do formato, confere se é uma data de
// calendário real (rejeita "2024-02-30"), não só o shape da string.
const dateString = (message: string) =>
  z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, message)
    .refine((value) => {
      const [year, month, day] = value.split('-').map(Number);
      const d = new Date(Date.UTC(year, month - 1, day));
      return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
    }, message);

export const createMaintenanceSchema = z.object({
  // Normaliza pra NFC: o mesmo texto visível ("Troca de óleo") pode chegar em
  // NFD (o + acento combinante) dependendo do cliente, e o motor de previsão
  // (MAINTENANCE_INTERVALS[tipo], utils/maintenancePrediction.ts) faz lookup de
  // objeto sem normalizar — grava sempre a mesma forma pra tipo nunca divergir
  // entre o que foi salvo e o que é comparado depois.
  tipo: z.string().trim().min(1, 'tipo é obrigatório').max(100).transform((s) => s.normalize('NFC')),
  data: dateString('data deve estar no formato AAAA-MM-DD e ser uma data válida'),
  km: z.coerce.number().int().nonnegative().nullable().optional(),
  custo: z.coerce.number().nonnegative().nullable().optional(),
  descricao: z.string().trim().max(255).nullable().optional(),
  // Se enviado, cria um Reminder vinculado a esta manutenção junto (toggle "criar lembrete pro próximo?").
  criarLembrete: z.object({
    tipo: z.string().trim().min(1).max(100).transform((s) => s.normalize('NFC')),
    dataPrevista: dateString('dataPrevista deve estar no formato AAAA-MM-DD e ser uma data válida'),
  }).nullable().optional(),
});

export const updateMaintenanceSchema = z.object({
  tipo: z.string().trim().min(1).max(100).transform((s) => s.normalize('NFC')).optional(),
  data: dateString('data deve estar no formato AAAA-MM-DD e ser uma data válida').optional(),
  km: z.coerce.number().int().nonnegative().nullable().optional(),
  custo: z.coerce.number().nonnegative().nullable().optional(),
  descricao: z.string().trim().max(255).nullable().optional(),
});

export const createReminderSchema = z.object({
  tipo: z.string().trim().min(1, 'tipo é obrigatório').max(100).transform((s) => s.normalize('NFC')),
  dataPrevista: dateString('dataPrevista deve estar no formato AAAA-MM-DD e ser uma data válida'),
});

export const updateReminderSchema = z.object({
  tipo: z.string().trim().min(1).max(100).transform((s) => s.normalize('NFC')).optional(),
  dataPrevista: dateString('dataPrevista deve estar no formato AAAA-MM-DD e ser uma data válida').optional(),
  concluido: z.boolean().optional(),
});
