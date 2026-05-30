import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import * as dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import vehicleRoutes from './routes/vehicle.routes';
import userRoutes from './routes/user.routes';
import { categoryRouter, expenseRouter } from './routes/expense.routes';
import reportRoutes from './routes/report.routes';

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1', categoryRouter);          // GET /api/v1/expense-categories
app.use('/api/v1/vehicles', expenseRouter);  // /api/v1/vehicles/:id/expenses
app.use('/api/v1/vehicles', reportRoutes);   // relatórios por veículo
app.use('/api/v1/vehicles', vehicleRoutes);  // CRUD de veículos

export default app;
