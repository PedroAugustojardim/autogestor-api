import { z } from 'zod';

// Formato usado em todo o app (ver autogestor-mobile/src/utils/date.ts,
// todayLocalISO): "YYYY-MM-DD". Além do formato, confere se é uma data de
// calendário real (rejeita "2024-02-30"), não só o shape da string.
export const dateString = (message: string) =>
  z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, message)
    .refine((value) => {
      const [year, month, day] = value.split('-').map(Number);
      const d = new Date(Date.UTC(year, month - 1, day));
      return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
    }, message);

// Tetos = a capacidade real da coluna no MySQL. Sem eles, um valor acima disso passava
// no Zod e estourava no INSERT como erro de SQL → 500 (e evento no Sentry) em vez de 400.
// DECIMAL(10,2) — expenses.valor, maintenances.custo.
export const MAX_MONEY = 99_999_999.99;
// DECIMAL(6,3) — expenses.litros, expenses.preco_litro.
export const MAX_LITERS = 999.999;
// A coluna é INT (até 2,1 bi); 10 milhões de km é mais que qualquer veículo real e deixa
// folga contra digitação errada sem ser um limite que alguém alcance de verdade.
export const MAX_KM = 10_000_000;
