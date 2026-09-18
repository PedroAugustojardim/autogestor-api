import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  entities: [path.join(__dirname, '..', 'entities', '**', '*.{ts,js}')],
  migrations: [path.join(__dirname, '..', 'migrations', '**', '*.{ts,js}')],
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  // 'Z' (UTC) explícito — sem isso o driver assume que o timezone da sessão MySQL
  // é igual ao do processo Node ('local', o default do mysql2). Datas gravadas via
  // `new Date()` (ex.: expiresAt de convite/refresh token) são comparadas no banco
  // contra `NOW()` calculado pelo MySQL — se processo e servidor discordarem de
  // timezone (bem plausível: dev local em America/Sao_Paulo, MySQL gerenciado em
  // UTC), o limite efetivo de expiração desliza pelo offset entre os dois.
  timezone: 'Z',
  // Achado rodando contra um MySQL de verdade pela primeira vez: colunas
  // `type: 'date'` (Expense.data, Maintenance.data, Reminder.dataPrevista) vinham
  // um dia atrasadas em qualquer processo rodando num timezone local negativo
  // (ex.: America/Sao_Paulo). Causa: o mysql2 lê a DATE já respeitando `timezone:
  // 'Z'` acima e devolve um Date UTC-midnight, mas o TypeORM reconverte esse Date
  // pra string usando os getters *locais* do JS (getFullYear/getMonth/getDate),
  // não os UTC — em UTC-3, meia-noite UTC cai no dia anterior no relógio local.
  // `dateStrings: ['DATE']` faz o driver devolver DATE como string crua
  // ("AAAA-MM-DD"), sem nunca virar Date/sofrer conversão de timezone nenhuma.
  // DATETIME/TIMESTAMP (createdAt, expiresAt etc.) continuam como Date normal.
  extra: { dateStrings: ['DATE'] },
});
