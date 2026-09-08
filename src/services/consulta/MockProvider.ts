import { VehicleType } from '../../entities/Vehicle';
import {
  IConsultaProvider, FineResult, IpvaResult, DebtsResult, RecallResult,
} from './IConsultaProvider';

// Hash simples e determinístico — a mesma placa sempre gera os mesmos dados
// fictícios, pra não parecer que os dados mudam sozinhos entre uma consulta e outra.
function seedFromPlaca(placa: string): number {
  let hash = 0;
  for (let i = 0; i < placa.length; i++) {
    hash = (hash * 31 + placa.charCodeAt(i)) >>> 0;
  }
  return hash;
}

// Calendário de IPVA por final de placa — meramente ilustrativo pra dados mock.
// Um provider real NÃO deve hardcodar isso: o calendário oficial muda todo ano e
// tem que vir de configuração (ver aviso already feito no guia sobre isso).
const IPVA_MES_POR_FINAL: Record<number, number> = {
  1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 0: 10,
};

export class MockProvider implements IConsultaProvider {
  async getFines(placa: string): Promise<FineResult[]> {
    const seed = seedFromPlaca(placa);
    const quantidade = seed % 3; // 0, 1 ou 2 multas fictícias
    return Array.from({ length: quantidade }, (_, i) => ({
      id: `mock-multa-${seed}-${i}`,
      valor: 130.16 + (seed % 5) * 100,
      data: `2026-0${((seed + i) % 8) + 1}-15`,
      descricao: ['Excesso de velocidade', 'Estacionamento proibido', 'Avanço de sinal'][(seed + i) % 3],
      orgao: 'DETRAN-SP (mock)',
    }));
  }

  async getIPVA(placa: string, tipoVeiculo: VehicleType): Promise<IpvaResult> {
    const seed = seedFromPlaca(placa);
    const finalPlaca = Number(placa.slice(-1)) || 0;
    const mes = IPVA_MES_POR_FINAL[finalPlaca] ?? 1;
    const base = tipoVeiculo === 'moto' ? 300 : tipoVeiculo === 'caminhao' ? 1800 : 900;
    const valorTotal = base + (seed % 400);
    const parcelas = Math.min(3, (seed % 3) + 1);
    const valorParcela = Number((valorTotal / parcelas).toFixed(2));

    return {
      ano: 2026,
      valorTotal,
      parcelas: Array.from({ length: parcelas }, (_, i) => ({
        numero: i + 1,
        valor: valorParcela,
        vencimento: `2026-${String(mes).padStart(2, '0')}-${10 + i}`,
        paga: i === 0 && seed % 2 === 0, // primeira parcela às vezes já paga, só pra variar o mock
      })),
    };
  }

  async getDebts(placa: string): Promise<DebtsResult> {
    const seed = seedFromPlaca(placa);
    const fines = await this.getFines(placa);
    const finalPlaca = Number(placa.slice(-1)) || 0;
    const mesLicenciamento = IPVA_MES_POR_FINAL[finalPlaca] ?? 1;

    return {
      multas: {
        quantidade: fines.length,
        valorTotal: Number(fines.reduce((s, f) => s + f.valor, 0).toFixed(2)),
      },
      ipva: {
        pendente: seed % 2 !== 0,
        valorTotal: seed % 2 !== 0 ? 900 + (seed % 400) : 0,
      },
      licenciamento: {
        vencimento: `2026-${String(mesLicenciamento).padStart(2, '0')}-30`,
        pendente: seed % 3 === 0,
      },
    };
  }

  async getRecalls(placa: string, _renavam: string): Promise<RecallResult[]> {
    const seed = seedFromPlaca(placa);
    if (seed % 5 !== 0) return []; // a maioria dos veículos mock não tem recall pendente
    return [{
      id: `mock-recall-${seed}`,
      titulo: 'Recall de fábrica (mock)',
      descricao: 'Verificação do sistema de freios — procure uma concessionária autorizada.',
    }];
  }
}
