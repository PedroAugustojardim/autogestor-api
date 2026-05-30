import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { AppDataSource } from '../config/database';
import { ExpenseCategory } from '../entities/ExpenseCategory';

const categories = [
  // Todos os tipos
  { nome: 'Combustível',    icone: '⛽', tipoVeiculo: 'todos' },
  { nome: 'Manutenção',     icone: '🔧', tipoVeiculo: 'todos' },
  { nome: 'Seguro',         icone: '🛡️', tipoVeiculo: 'todos' },
  { nome: 'Estacionamento', icone: '🅿️', tipoVeiculo: 'todos' },
  { nome: 'Lavação',        icone: '🚿', tipoVeiculo: 'todos' },
  { nome: 'Pedágio',        icone: '🛣️', tipoVeiculo: 'todos' },
  { nome: 'Outros',         icone: '📦', tipoVeiculo: 'todos' },
  // Caminhão
  { nome: 'ARLA 32',        icone: '🧴', tipoVeiculo: 'caminhao' },
  { nome: 'Tacógrafo',      icone: '⏱️', tipoVeiculo: 'caminhao' },
  { nome: 'Pneu de Carga',  icone: '🔵', tipoVeiculo: 'caminhao' },
  { nome: 'Lona/Amarração', icone: '🪢', tipoVeiculo: 'caminhao' },
  { nome: 'Balança',        icone: '⚖️', tipoVeiculo: 'caminhao' },
  // Moto
  { nome: 'Capacete/Equipamento', icone: '⛑️', tipoVeiculo: 'moto' },
  { nome: 'Corrente/Coroa',       icone: '⛓️', tipoVeiculo: 'moto' },
  { nome: 'Embreagem',            icone: '🔩', tipoVeiculo: 'moto' },
  // Van
  { nome: 'Fretamento',           icone: '📋', tipoVeiculo: 'van' },
  { nome: 'Adesivação',           icone: '🎨', tipoVeiculo: 'van' },
  { nome: 'Seguro de Passageiros', icone: '👥', tipoVeiculo: 'van' },
] as const;

async function seed() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(ExpenseCategory);

  const existing = await repo.count();
  if (existing > 0) {
    console.log(`✅ Categorias já existem (${existing} registros). Seed ignorado.`);
    await AppDataSource.destroy();
    return;
  }

  for (const cat of categories) {
    await repo.save(repo.create(cat));
  }

  console.log(`✅ ${categories.length} categorias inseridas com sucesso.`);
  await AppDataSource.destroy();
}

seed().catch((e) => { console.error('❌ Erro no seed:', e); process.exit(1); });
