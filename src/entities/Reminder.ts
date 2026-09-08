import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Vehicle } from './Vehicle';
import { Maintenance } from './Maintenance';

@Entity('reminders')
export class Reminder {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'vehicle_id' })
  vehicleId!: number;

  @ManyToOne(() => Vehicle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle!: Vehicle;

  // Preenchido quando o lembrete nasce do toggle "criar lembrete para o próximo?"
  // ao registrar uma manutenção — null quando o lembrete é criado avulso.
  @Column({ name: 'maintenance_id', nullable: true })
  maintenanceId!: number | null;

  @ManyToOne(() => Maintenance, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'maintenance_id' })
  maintenance?: Maintenance;

  @Column({ length: 100 })
  tipo!: string;

  @Column({ name: 'data_prevista', type: 'date' })
  dataPrevista!: string;

  @Column({ default: false })
  silenciado!: boolean;

  @Column({ default: false })
  concluido!: boolean;

  // Null = nunca notificado. reminderWorker renotifica quando null ou quando já
  // passou o cooldown de 7 dias — implementa "avisa perto da data, depois semanal"
  // com uma regra só, sem precisar de um contador/estado separado.
  @Column({ name: 'last_notified_at', type: 'datetime', nullable: true })
  lastNotifiedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
