import { Response } from 'express';
import { Between, In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Expense } from '../entities/Expense';
import { ExpenseCategory } from '../entities/ExpenseCategory';
import { AuthRequest } from '../middleware/auth';
import { ownsVehicle } from '../utils/ownership';

const expRepo = () => AppDataSource.getRepository(Expense);
const catRepo = () => AppDataSource.getRepository(ExpenseCategory);

export class ExpenseController {
  // GET /expense-categories?tipo=carro
  async listCategories(req: AuthRequest, res: Response): Promise<void> {
    const tipo = req.query.tipo as string | undefined;
    const where = tipo
      ? [{ tipoVeiculo: 'todos' as const, ativo: true }, { tipoVeiculo: tipo as any, ativo: true }]
      : [{ ativo: true }];
    const cats = await catRepo().find({ where, order: { nome: 'ASC' } });
    res.json(cats);
  }

  // GET /vehicles/:id/expenses/:eid
  async findOne(req: AuthRequest, res: Response): Promise<void> {
    const vehicleId = Number(req.params.id);
    const expId     = Number(req.params.eid);
    if (!await ownsVehicle(vehicleId, req.userId!)) {
      res.status(404).json({ error: 'Veículo não encontrado' }); return;
    }
    const expense = await expRepo().findOne({ where: { id: expId, vehicleId }, relations: ['category'] });
    if (!expense) { res.status(404).json({ error: 'Gasto não encontrado' }); return; }
    res.json(expense);
  }

  // POST /vehicles/:id/expenses
  async create(req: AuthRequest, res: Response): Promise<void> {
    const vehicleId = Number(req.params.id);
    if (!await ownsVehicle(vehicleId, req.userId!)) {
      res.status(404).json({ error: 'Veículo não encontrado' }); return;
    }
    const { categoryId, valor, data, descricao, kmAtual, litros, precoLitro, tipoCombustivel } = req.body;

    const category = await catRepo().findOneBy({ id: Number(categoryId), ativo: true });
    if (!category) {
      res.status(400).json({ error: 'Categoria não encontrada' }); return;
    }

    const expense = expRepo().create({
      vehicleId, categoryId, valor, data, descricao, kmAtual, litros, precoLitro, tipoCombustivel,
    });
    await expRepo().save(expense);
    const saved = await expRepo().findOne({ where: { id: expense.id }, relations: ['category'] });
    res.status(201).json(saved);
  }

  // GET /vehicles/:id/expenses?mes=5&ano=2026
  async list(req: AuthRequest, res: Response): Promise<void> {
    const vehicleId = Number(req.params.id);
    if (!await ownsVehicle(vehicleId, req.userId!)) {
      res.status(404).json({ error: 'Veículo não encontrado' }); return;
    }
    const now = new Date();
    const mes = Number(req.query.mes || now.getMonth() + 1);
    const ano = Number(req.query.ano || now.getFullYear());
    const start = `${ano}-${String(mes).padStart(2, '0')}-01`;
    const lastDay = new Date(ano, mes, 0).getDate();
    const end   = `${ano}-${String(mes).padStart(2, '0')}-${lastDay}`;

    const expenses = await expRepo().find({
      where: { vehicleId, data: Between(start, end) },
      relations: ['category'],
      order: { data: 'DESC', createdAt: 'DESC' },
    });
    res.json(expenses);
  }

  // GET /vehicles/:id/expenses/summary?mes=5&ano=2026
  async summary(req: AuthRequest, res: Response): Promise<void> {
    const vehicleId = Number(req.params.id);
    if (!await ownsVehicle(vehicleId, req.userId!)) {
      res.status(404).json({ error: 'Veículo não encontrado' }); return;
    }
    const now = new Date();
    const mes = Number(req.query.mes || now.getMonth() + 1);
    const ano = Number(req.query.ano || now.getFullYear());
    const start = `${ano}-${String(mes).padStart(2, '0')}-01`;
    const lastDay = new Date(ano, mes, 0).getDate();
    const end   = `${ano}-${String(mes).padStart(2, '0')}-${lastDay}`;

    const expenses = await expRepo().find({
      where: { vehicleId, data: Between(start, end) },
      relations: ['category'],
    });

    const total = expenses.reduce((sum, e) => sum + Number(e.valor), 0);

    const porCategoria = expenses.reduce<Record<string, { nome: string; icone: string | null; total: number }>>((acc, e) => {
      const nome = e.category?.nome ?? 'Outros';
      if (!acc[nome]) acc[nome] = { nome, icone: e.category?.icone ?? null, total: 0 };
      acc[nome].total += Number(e.valor);
      return acc;
    }, {});

    res.json({
      mes, ano,
      total: Number(total.toFixed(2)),
      quantidade: expenses.length,
      porCategoria: Object.values(porCategoria).sort((a, b) => b.total - a.total),
    });
  }

  // PUT /vehicles/:id/expenses/:eid
  async update(req: AuthRequest, res: Response): Promise<void> {
    const vehicleId = Number(req.params.id);
    const expId     = Number(req.params.eid);
    if (!await ownsVehicle(vehicleId, req.userId!)) {
      res.status(404).json({ error: 'Veículo não encontrado' }); return;
    }
    const expense = await expRepo().findOneBy({ id: expId, vehicleId });
    if (!expense) { res.status(404).json({ error: 'Gasto não encontrado' }); return; }

    const { valor, data, descricao, kmAtual, litros, precoLitro, tipoCombustivel } = req.body;
    if (valor !== undefined) expense.valor = valor;
    if (data !== undefined) expense.data = data;
    if (descricao !== undefined) expense.descricao = descricao;
    if (kmAtual !== undefined) expense.kmAtual = kmAtual;
    if (litros !== undefined) expense.litros = litros;
    if (precoLitro !== undefined) expense.precoLitro = precoLitro;
    if (tipoCombustivel !== undefined) expense.tipoCombustivel = tipoCombustivel;

    await expRepo().save(expense);
    const updated = await expRepo().findOne({ where: { id: expId }, relations: ['category'] });
    res.json(updated);
  }

  // DELETE /vehicles/:id/expenses/:eid
  async remove(req: AuthRequest, res: Response): Promise<void> {
    const vehicleId = Number(req.params.id);
    const expId     = Number(req.params.eid);
    if (!await ownsVehicle(vehicleId, req.userId!)) {
      res.status(404).json({ error: 'Veículo não encontrado' }); return;
    }
    const expense = await expRepo().findOneBy({ id: expId, vehicleId });
    if (!expense) { res.status(404).json({ error: 'Gasto não encontrado' }); return; }
    await expRepo().remove(expense);
    res.status(204).send();
  }
}
