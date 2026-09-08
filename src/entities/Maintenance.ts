import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Vehicle } from './Vehicle';

@Entity('maintenances')
export class Maintenance {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'vehicle_id' })
  vehicleId!: number;

  @ManyToOne(() => Vehicle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle!: Vehicle;

  @Column({ length: 100 })
  tipo!: string;

  @Column({ type: 'date' })
  data!: string;

  @Column({ type: 'int', nullable: true })
  km!: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  custo!: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  descricao!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
