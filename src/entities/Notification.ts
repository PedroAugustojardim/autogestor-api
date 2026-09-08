import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from './User';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'user_id' })
  userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  // Só 'lembrete' por enquanto (worker de manutenção) — string livre em vez de enum
  // pra não precisar de migration toda vez que uma origem nova de notificação nascer.
  @Column({ length: 50 })
  tipo!: string;

  @Column({ length: 150 })
  titulo!: string;

  @Column({ type: 'varchar', length: 500 })
  mensagem!: string;

  @Column({ default: false })
  lida!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
