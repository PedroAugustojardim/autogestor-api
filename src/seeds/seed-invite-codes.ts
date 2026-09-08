import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import crypto from 'crypto';
import { AppDataSource } from '../config/database';
import { InviteCode } from '../entities/InviteCode';
import { hashToken } from '../utils/hashToken';

// Quantos códigos gerar e por quanto tempo ficam válidos. Ajuste na linha de comando:
// npm run seed:invites -- 10 30   (10 códigos, expira em 30 dias)
const QUANTIDADE = Number(process.argv[2] ?? 5);
const DIAS_VALIDADE = Number(process.argv[3] ?? 90);

function gerarCodigo(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function seed() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(InviteCode);

  const expiresAt = new Date(Date.now() + DIAS_VALIDADE * 86_400_000);
  const codigos = Array.from({ length: QUANTIDADE }, () => gerarCodigo());

  for (const code of codigos) {
    await repo.save(repo.create({ code: hashToken(code), expiresAt }));
  }

  console.log(`✅ ${QUANTIDADE} código(s) de convite criado(s), válidos até ${expiresAt.toISOString()}:`);
  codigos.forEach((c) => console.log(`   ${c}`));
  await AppDataSource.destroy();
}

seed().catch((e) => { console.error('❌ Erro no seed:', e); process.exit(1); });
