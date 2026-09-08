import { VehicleType } from '../../entities/Vehicle';

export interface FineResult {
  id: string;
  valor: number;
  data: string; // 'YYYY-MM-DD'
  descricao: string;
  orgao: string;
}

export interface IpvaParcela {
  numero: number;
  valor: number;
  vencimento: string; // 'YYYY-MM-DD'
  paga: boolean;
}

export interface IpvaResult {
  ano: number;
  valorTotal: number;
  parcelas: IpvaParcela[];
}

export interface DebtsResult {
  multas: { quantidade: number; valorTotal: number };
  ipva: { pendente: boolean; valorTotal: number };
  licenciamento: { vencimento: string; pendente: boolean };
}

export interface RecallResult {
  id: string;
  titulo: string;
  descricao: string;
}

// Padrão Adapter — troca de provedor real (Integrador SP.GOV.BR / SERPRO /
// Infosimples, ver Novo guia.docx seção 24) sem tocar em controller, rota ou
// worker. Só cria uma classe nova implementando isto e registra em `index.ts`.
export interface IConsultaProvider {
  getFines(placa: string): Promise<FineResult[]>;
  getIPVA(placa: string, tipoVeiculo: VehicleType): Promise<IpvaResult>;
  getDebts(placa: string): Promise<DebtsResult>;
  getRecalls(placa: string, renavam: string): Promise<RecallResult[]>;
}
