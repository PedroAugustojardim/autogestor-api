import { isOverdue } from './reminders';

// Motor de previsão de manutenção por quilometragem — ver
// scratchpad_previsao_manutencao.html (raiz do projeto) pro desenho original com
// exemplo numérico passo-a-passo. Duas contas encadeadas: (1) taxa de uso do
// veículo em km/dia, a partir do histórico de abastecimentos; (2) projeção da
// próxima manutenção de um tipo, cruzando intervalo por km e por tempo.

export interface UsagePoint {
  data: string; // 'YYYY-MM-DD'
  km: number;
}

export interface MaintenanceInterval {
  intervaloKm: number | null;
  intervaloMeses: number | null;
}

export interface PredictionResult {
  dataPrevista: string; // 'YYYY-MM-DD'
  atrasado: boolean;
  baseadoEm: 'km' | 'tempo' | 'km_e_tempo';
}

// Intervalos padrão de mercado por tipo de manutenção (ver autogestor-mobile's
// MAINTENANCE_TYPES pros nomes exatos usados na UI). São heurísticas editáveis,
// não um dado por veículo/fabricante — tipos ausentes ou com os dois campos null
// (ex: "Suspensão", "Outros") caem no fluxo manual de hoje, sem previsão.
export const MAINTENANCE_INTERVALS: Record<string, MaintenanceInterval> = {
  'Troca de óleo': { intervaloKm: 10000, intervaloMeses: 6 },
  'Revisão geral': { intervaloKm: 10000, intervaloMeses: 12 },
  'Troca de filtro': { intervaloKm: 10000, intervaloMeses: 6 },
  Bateria: { intervaloKm: null, intervaloMeses: 24 },
  'Alinhamento/Balanceamento': { intervaloKm: 10000, intervaloMeses: 6 },
  'Troca de pneu': { intervaloKm: 40000, intervaloMeses: null },
  Freios: { intervaloKm: 20000, intervaloMeses: null },
  'Corrente/Relação': { intervaloKm: 15000, intervaloMeses: null },
  Tacógrafo: { intervaloKm: null, intervaloMeses: 12 },
};

const MAX_PLAUSIBLE_KM_PER_DIA = 800; // teto de plausibilidade do filtro de taxa implícita
const MIN_PONTOS_VALIDOS = 2;
const MIN_DIAS_INTERVALO = 14;

function daysBetween(a: string, b: string): number {
  const da = Date.UTC(...parseISO(a));
  const db = Date.UTC(...parseISO(b));
  return Math.round((db - da) / 86_400_000);
}

function parseISO(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.split('-').map(Number);
  return [y, m - 1, d];
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = parseISO(dateStr);
  const dt = new Date(Date.UTC(y, m, d + Math.round(days)));
  return dt.toISOString().slice(0, 10);
}

function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = parseISO(dateStr);
  const totalMonths = m + months;
  const targetYear = y + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  // Clampa no último dia do mês-alvo quando o dia de origem não existe nele
  // (ex: 31/01 + 1 mês não pode virar 03/03 — vira 28/02 ou 29/02).
  const diasNoMesAlvo = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(d, diasNoMesAlvo);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

// Percorre os pontos em ordem cronológica mantendo uma "âncora": um candidato só
// é aceito (e vira a nova âncora) se a taxa implícita entre ele e a âncora atual
// for plausível (0 < taxa ≤ 800 km/dia) — descarta tanto km andando pra trás
// quanto um salto implausível pra frente (dígito digitado a mais no odômetro).
// Limitação conhecida: se a própria âncora for um dado ruim, a janela toda após
// ela pode ser descartada, já que a âncora nunca é reavaliada — comportamento
// seguro (cai em "dados insuficientes"), não ideal, ver o rascunho original.
function filterPlausiblePoints(points: UsagePoint[]): UsagePoint[] {
  const sorted = [...points].sort((a, b) => a.data.localeCompare(b.data));
  if (sorted.length === 0) return [];

  const valid: UsagePoint[] = [sorted[0]];
  let anchor = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const candidate = sorted[i];
    const dias = daysBetween(anchor.data, candidate.data);
    if (dias <= 0) continue; // mesma data (ou fora de ordem) da âncora — ignora
    const taxa = (candidate.km - anchor.km) / dias;
    if (taxa > 0 && taxa <= MAX_PLAUSIBLE_KM_PER_DIA) {
      valid.push(candidate);
      anchor = candidate;
    }
  }
  return valid;
}

// Taxa de uso do veículo (km/dia), a partir do histórico de abastecimentos
// (Expense.kmAtual). Retorna null quando não há dados suficientes pra confiar
// na taxa — menos de 2 pontos plausíveis, ou menos de 14 dias entre eles.
export function estimateUsageRate(points: UsagePoint[]): { kmPorDia: number; ultimoPonto: UsagePoint } | null {
  const valid = filterPlausiblePoints(points);
  if (valid.length < MIN_PONTOS_VALIDOS) return null;

  const primeiro = valid[0];
  const ultimo = valid[valid.length - 1];
  const dias = daysBetween(primeiro.data, ultimo.data);
  if (dias < MIN_DIAS_INTERVALO) return null;

  return { kmPorDia: (ultimo.km - primeiro.km) / dias, ultimoPonto: ultimo };
}

export interface PredictParams {
  intervaloKm: number | null;
  intervaloMeses: number | null;
  baseData: string; // data da ocorrência mais recente deste tipo de manutenção
  baseKm: number | null; // km daquela ocorrência (pode ser null — ver MaintenanceController.predict)
  usagePoints: UsagePoint[];
  today: string;
}

// Previsão da próxima manutenção de um tipo: cruza a projeção por quilometragem
// (baseKm + intervaloKm, usando a taxa de uso pra saber quando o veículo chega
// lá) com a projeção por tempo (baseData + intervaloMeses), e usa a que vier
// primeiro. Retorna null quando nenhuma das duas é calculável (tipo fora do
// catálogo, ou sem dados de uso e sem intervalo por tempo) — o chamador deve
// cair no fluxo manual (usuário digita a data) nesse caso.
export function predictNextMaintenanceDate(params: PredictParams): PredictionResult | null {
  const { intervaloKm, intervaloMeses, baseData, baseKm, usagePoints, today } = params;

  let dataPorKm: string | null = null;
  if (intervaloKm !== null && baseKm !== null) {
    const usage = estimateUsageRate(usagePoints);
    if (usage && usage.kmPorDia > 0) {
      const diasDesdeUltimo = daysBetween(usage.ultimoPonto.data, today);
      const kmAtualEstimado = usage.ultimoPonto.km + usage.kmPorDia * diasDesdeUltimo;
      const kmAlvo = baseKm + intervaloKm;
      const diasAteKmAlvo = (kmAlvo - kmAtualEstimado) / usage.kmPorDia;
      dataPorKm = addDays(today, diasAteKmAlvo);
    }
  }

  const dataPorTempo = intervaloMeses !== null ? addMonths(baseData, intervaloMeses) : null;

  if (dataPorKm === null && dataPorTempo === null) return null;

  let dataPrevista: string;
  let baseadoEm: PredictionResult['baseadoEm'];
  if (dataPorKm !== null && dataPorTempo !== null) {
    dataPrevista = dataPorKm < dataPorTempo ? dataPorKm : dataPorTempo;
    baseadoEm = 'km_e_tempo';
  } else if (dataPorKm !== null) {
    dataPrevista = dataPorKm;
    baseadoEm = 'km';
  } else {
    dataPrevista = dataPorTempo!;
    baseadoEm = 'tempo';
  }

  // Não cria um lembrete "vencido no passado" silenciosamente — se a previsão já
  // passou, usa hoje como data e marca atrasado=true pro chamador exibir o aviso.
  const atrasado = isOverdue(dataPrevista, today);
  if (atrasado) dataPrevista = today;

  return { dataPrevista, atrasado, baseadoEm };
}
