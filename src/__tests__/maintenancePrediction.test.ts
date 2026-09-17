import { estimateUsageRate, predictNextMaintenanceDate } from '../utils/maintenancePrediction';

// Casos de teste extraídos número-por-número de scratchpad_previsao_manutencao.html
// (raiz do projeto) — o rascunho já trabalhou os exemplos à mão, então servem de
// vetor de regressão direto pro motor de previsão.

const ABASTECIMENTOS = [
  { data: '2026-07-10', km: 42100 },
  { data: '2026-07-24', km: 42940 },
  { data: '2026-08-07', km: 43780 },
  { data: '2026-08-21', km: 44620 },
  { data: '2026-09-04', km: 45460 },
];
const HOJE = '2026-09-08';

describe('estimateUsageRate', () => {
  it('calcula 60 km/dia quando todos os pontos são plausíveis entre si', () => {
    const result = estimateUsageRate(ABASTECIMENTOS);
    expect(result).not.toBeNull();
    expect(result!.kmPorDia).toBe(60);
    expect(result!.ultimoPonto).toEqual({ data: '2026-09-04', km: 45460 });
  });

  it('retorna null com um único ponto (dados insuficientes)', () => {
    expect(estimateUsageRate([{ data: '2026-08-30', km: 12400 }])).toBeNull();
  });

  it('descarta candidatos com taxa negativa (km andando pra trás) sem mover a âncora', () => {
    const pontos = [
      { data: '2026-06-01', km: 20000 },
      { data: '2026-06-15', km: 20600 }, // 43 km/d vs âncora — plausível, vira âncora
      { data: '2026-06-20', km: 15000 }, // negativo vs âncora — descarta
      { data: '2026-06-25', km: 16000 }, // ainda negativo vs âncora (20600) — descarta
      { data: '2026-07-05', km: 21500 }, // 45 km/d vs âncora (15/06) — plausível, vira âncora
      { data: '2026-07-20', km: 22100 }, // 40 km/d vs âncora (05/07) — plausível, vira âncora
    ];
    const result = estimateUsageRate(pontos);
    expect(result).not.toBeNull();
    expect(result!.kmPorDia).toBeCloseTo(42.857, 2); // (22100-20000)/49
    expect(result!.ultimoPonto).toEqual({ data: '2026-07-20', km: 22100 });
  });

  it('retorna null quando o primeiro ponto é o dado ruim (âncora nunca reavaliada)', () => {
    const pontos = [
      { data: '2026-07-01', km: 8500 },
      { data: '2026-07-15', km: 85600 }, // 5.507 km/d — acima do teto, descarta
      { data: '2026-07-29', km: 86200 }, // ainda acima do teto vs âncora ruim — descarta
    ];
    // Só a âncora sobra (1 ponto) — comportamento seguro, não ideal (ver comentário no código-fonte).
    expect(estimateUsageRate(pontos)).toBeNull();
  });

  it('retorna null quando o intervalo entre o primeiro e o último ponto válido é menor que 14 dias', () => {
    const pontos = [
      { data: '2026-09-01', km: 10000 },
      { data: '2026-09-05', km: 10200 }, // 50 km/d, plausível, mas só 4 dias de intervalo
    ];
    expect(estimateUsageRate(pontos)).toBeNull();
  });
});

describe('predictNextMaintenanceDate', () => {
  it('Exemplo A do rascunho — troca de óleo (10.000km/6 meses): já vencida pela estimativa, clampa em hoje', () => {
    const result = predictNextMaintenanceDate({
      intervaloKm: 10000,
      intervaloMeses: 6,
      baseData: '2026-02-20',
      baseKm: 34900,
      usagePoints: ABASTECIMENTOS,
      today: HOJE,
    });
    expect(result).toEqual({ dataPrevista: HOJE, atrasado: true, baseadoEm: 'km_e_tempo' });
  });

  it('Exemplo B do rascunho — rodízio de pneus (10.000km, sem componente de tempo): previsão futura direta', () => {
    const result = predictNextMaintenanceDate({
      intervaloKm: 10000,
      intervaloMeses: null,
      baseData: '2026-07-01',
      baseKm: 40200,
      usagePoints: ABASTECIMENTOS,
      today: HOJE,
    });
    expect(result).toEqual({ dataPrevista: '2026-11-22', atrasado: false, baseadoEm: 'km' });
  });

  it('retorna null quando o tipo não tem intervalo nenhum no catálogo (cai no fluxo manual)', () => {
    const result = predictNextMaintenanceDate({
      intervaloKm: null,
      intervaloMeses: null,
      baseData: '2026-07-01',
      baseKm: 40200,
      usagePoints: ABASTECIMENTOS,
      today: HOJE,
    });
    expect(result).toBeNull();
  });

  it('usa só a previsão por tempo quando não há baseKm (ex: km nunca registrado pra esse tipo)', () => {
    const result = predictNextMaintenanceDate({
      intervaloKm: 10000,
      intervaloMeses: 6,
      baseData: '2026-02-20',
      baseKm: null,
      usagePoints: ABASTECIMENTOS,
      today: HOJE,
    });
    expect(result).toEqual({ dataPrevista: HOJE, atrasado: true, baseadoEm: 'tempo' });
  });

  it('clampa em fevereiro quando o mês-base não tem o dia de origem (31/01 + 1 mês)', () => {
    const result = predictNextMaintenanceDate({
      intervaloKm: null,
      intervaloMeses: 1,
      baseData: '2026-01-31',
      baseKm: null,
      usagePoints: [],
      today: '2026-01-01',
    });
    expect(result!.dataPrevista).toBe('2026-02-28');
  });
});
