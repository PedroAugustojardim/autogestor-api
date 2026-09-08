import { Response } from 'express';
import { Between } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Expense } from '../entities/Expense';
import { AuthRequest } from '../middleware/auth';
import { ownsVehicle } from '../utils/ownership';

const expRepo  = () => AppDataSource.getRepository(Expense);

function monthRange(mes: number, ano: number) {
  const lastDay = new Date(ano, mes, 0).getDate();
  return {
    start: `${ano}-${String(mes).padStart(2, '0')}-01`,
    end:   `${ano}-${String(mes).padStart(2, '0')}-${lastDay}`,
  };
}

export class ReportController {
  // GET /vehicles/:id/reports/monthly?meses=6
  // Retorna total de gastos dos últimos N meses (padrão 6)
  async monthly(req: AuthRequest, res: Response): Promise<void> {
    const vehicleId = Number(req.params.id);
    if (!await ownsVehicle(vehicleId, req.userId!)) {
      res.status(404).json({ error: 'Veículo não encontrado' }); return;
    }

    const meses = Math.min(Number(req.query.meses ?? 6), 12);
    const result: { mes: number; ano: number; label: string; total: number; quantidade: number }[] = [];

    const now = new Date();
    for (let i = meses - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mes = d.getMonth() + 1;
      const ano = d.getFullYear();
      const { start, end } = monthRange(mes, ano);

      const expenses = await expRepo().find({
        where: { vehicleId, data: Between(start, end) },
      });

      const total = expenses.reduce((s, e) => s + Number(e.valor), 0);
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      result.push({ mes, ano, label, total: Number(total.toFixed(2)), quantidade: expenses.length });
    }

    res.json(result);
  }

  // GET /vehicles/:id/reports/categories?mes=5&ano=2026
  // Distribuição por categoria no mês
  async byCategory(req: AuthRequest, res: Response): Promise<void> {
    const vehicleId = Number(req.params.id);
    if (!await ownsVehicle(vehicleId, req.userId!)) {
      res.status(404).json({ error: 'Veículo não encontrado' }); return;
    }

    const now = new Date();
    const mes = Number(req.query.mes ?? now.getMonth() + 1);
    const ano = Number(req.query.ano ?? now.getFullYear());
    const { start, end } = monthRange(mes, ano);

    const expenses = await expRepo().find({
      where: { vehicleId, data: Between(start, end) },
      relations: ['category'],
    });

    const total = expenses.reduce((s, e) => s + Number(e.valor), 0);

    const map: Record<string, { nome: string; icone: string | null; total: number; percentual: number }> = {};
    for (const e of expenses) {
      const nome = e.category?.nome ?? 'Outros';
      if (!map[nome]) map[nome] = { nome, icone: e.category?.icone ?? null, total: 0, percentual: 0 };
      map[nome].total += Number(e.valor);
    }

    const cats = Object.values(map).map((c) => ({
      ...c,
      total: Number(c.total.toFixed(2)),
      percentual: total > 0 ? Number(((c.total / total) * 100).toFixed(1)) : 0,
    })).sort((a, b) => b.total - a.total);

    res.json({ mes, ano, total: Number(total.toFixed(2)), categorias: cats });
  }

  // GET /vehicles/:id/reports/fuel?meses=6
  // Histórico de abastecimentos: litros, preço médio/L, consumo km/L
  async fuel(req: AuthRequest, res: Response): Promise<void> {
    const vehicleId = Number(req.params.id);
    if (!await ownsVehicle(vehicleId, req.userId!)) {
      res.status(404).json({ error: 'Veículo não encontrado' }); return;
    }

    const meses = Math.min(Number(req.query.meses ?? 6), 12);
    const now = new Date();
    const d0 = new Date(now.getFullYear(), now.getMonth() - meses + 1, 1);
    const start = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-01`;
    const { end } = monthRange(now.getMonth() + 1, now.getFullYear());

    const abasts = await expRepo().find({
      where: { vehicleId, data: Between(start, end) },
      relations: ['category'],
      order: { data: 'ASC' },
    });

    const combustiveis = abasts.filter((e) => e.category?.nome === 'Combustível' && e.litros);

    const totalLitros   = combustiveis.reduce((s, e) => s + Number(e.litros ?? 0), 0);
    const totalGasto    = combustiveis.reduce((s, e) => s + Number(e.valor), 0);
    const precoMedioL   = combustiveis.length > 0 ? totalGasto / totalLitros : 0;

    // km/L: calcula entre abastecimentos que têm km registrado
    const comKm = combustiveis.filter((e) => e.kmAtual);
    let kmL: number | null = null;
    if (comKm.length >= 2) {
      const kmTotal = Number(comKm[comKm.length - 1].kmAtual) - Number(comKm[0].kmAtual);
      const litrosTotal = comKm.slice(1).reduce((s, e) => s + Number(e.litros ?? 0), 0);
      if (litrosTotal > 0) kmL = Number((kmTotal / litrosTotal).toFixed(2));
    }

    res.json({
      abastecimentos: combustiveis.length,
      totalLitros: Number(totalLitros.toFixed(3)),
      totalGasto: Number(totalGasto.toFixed(2)),
      precoMedioLitro: Number(precoMedioL.toFixed(3)),
      kmPorLitro: kmL,
      historico: combustiveis.map((e) => ({
        id: e.id,
        data: e.data,
        litros: e.litros,
        precoLitro: e.precoLitro,
        valor: e.valor,
        kmAtual: e.kmAtual,
        tipoCombustivel: e.tipoCombustivel,
      })),
    });
  }

  // GET /vehicles/:id/reports/summary-year?ano=2026
  // Totais mês a mês do ano + total anual
  async yearSummary(req: AuthRequest, res: Response): Promise<void> {
    const vehicleId = Number(req.params.id);
    if (!await ownsVehicle(vehicleId, req.userId!)) {
      res.status(404).json({ error: 'Veículo não encontrado' }); return;
    }

    const ano = Number(req.query.ano ?? new Date().getFullYear());
    const meses = [];
    let totalAno = 0;

    for (let mes = 1; mes <= 12; mes++) {
      const { start, end } = monthRange(mes, ano);
      const expenses = await expRepo().find({ where: { vehicleId, data: Between(start, end) } });
      const total = Number(expenses.reduce((s, e) => s + Number(e.valor), 0).toFixed(2));
      totalAno += total;
      const label = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'short' });
      meses.push({ mes, label, total, quantidade: expenses.length });
    }

    res.json({ ano, totalAno: Number(totalAno.toFixed(2)), meses });
  }

  // GET /vehicles/:id/reports/pdf?mes=5&ano=2026
  // Dados agregados pro relatório em PDF: veículo, totais, categorias e a lista de gastos do período
  async pdf(req: AuthRequest, res: Response): Promise<void> {
    const vehicleId = Number(req.params.id);
    const vehicle = await ownsVehicle(vehicleId, req.userId!);
    if (!vehicle) {
      res.status(404).json({ error: 'Veículo não encontrado' }); return;
    }

    const now = new Date();
    const mes = Number(req.query.mes ?? now.getMonth() + 1);
    const ano = Number(req.query.ano ?? now.getFullYear());
    const { start, end } = monthRange(mes, ano);

    const expenses = await expRepo().find({
      where: { vehicleId, data: Between(start, end) },
      relations: ['category'],
      order: { data: 'ASC' },
    });

    const total = expenses.reduce((s, e) => s + Number(e.valor), 0);

    const porCategoria: Record<string, { nome: string; icone: string | null; total: number; percentual: number }> = {};
    for (const e of expenses) {
      const nome = e.category?.nome ?? 'Outros';
      if (!porCategoria[nome]) porCategoria[nome] = { nome, icone: e.category?.icone ?? null, total: 0, percentual: 0 };
      porCategoria[nome].total += Number(e.valor);
    }
    const categorias = Object.values(porCategoria).map((c) => ({
      ...c,
      total: Number(c.total.toFixed(2)),
      percentual: total > 0 ? Number(((c.total / total) * 100).toFixed(1)) : 0,
    })).sort((a, b) => b.total - a.total);

    const label = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    res.json({
      veiculo: {
        tipo: vehicle.tipo,
        marca: vehicle.marca,
        modelo: vehicle.modelo,
        ano: vehicle.ano,
        apelido: vehicle.apelido,
      },
      periodo: { mes, ano, label },
      total: Number(total.toFixed(2)),
      quantidade: expenses.length,
      categorias,
      gastos: expenses.map((e) => ({
        data: e.data,
        categoria: e.category?.nome ?? 'Outros',
        descricao: e.descricao,
        valor: Number(e.valor),
      })),
      geradoEm: new Date().toISOString(),
    });
  }
}
