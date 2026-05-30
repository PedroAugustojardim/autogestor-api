import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Vehicle } from './Vehicle';
import { ExpenseCategory } from './ExpenseCategory';

@Entity('expenses')
export class Expense {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'vehicle_id' })
  vehicleId!: number;

  @ManyToOne(() => Vehicle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle!: Vehicle;

  @Column({ name: 'category_id' })
  categoryId!: number;

  @ManyToOne(() => ExpenseCategory)
  @JoinColumn({ name: 'category_id' })
  category!: ExpenseCategory;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  valor!: number;

  @Column({ type: 'date' })
  data!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  descricao!: string | null;

  @Column({ name: 'km_atual', type: 'int', nullable: true })
  kmAtual!: number | null;

  // Campos extras para combustível
  @Column({ type: 'decimal', precision: 6, scale: 3, nullable: true })
  litros!: number | null;

  @Column({ name: 'preco_litro', type: 'decimal', precision: 6, scale: 3, nullable: true })
  precoLitro!: number | null;

  @Column({ name: 'tipo_combustivel', type: 'varchar', length: 30, nullable: true })
  tipoCombustivel!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
