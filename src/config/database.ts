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
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});
