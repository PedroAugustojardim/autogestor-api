import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from './User';

export type VehicleType = 'carro' | 'moto' | 'caminhao' | 'van';

@Entity('vehicles')
export class Vehicle {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'user_id' })
  userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'enum', enum: ['carro', 'moto', 'caminhao', 'van'] })
  tipo!: VehicleType;

  @Column({ length: 100 })
  marca!: string;

  @Column({ length: 100 })
  modelo!: string;

  @Column({ type: 'int', nullable: true })
  ano!: number | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  placa!: string | null;

  @Column({ type: 'varchar', length: 11, nullable: true })
  renavam!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  cor!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  apelido!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
