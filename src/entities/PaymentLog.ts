import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User, UserPlan } from './User';

@Entity('payment_logs')
export class PaymentLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'user_id' })
  userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  // Sempre premium_mensal/premium_anual — nunca 'gratuito' (não faz sentido comprar
  // o plano gratuito). Reaproveita o mesmo union type de User.plano.
  @Column({ type: 'enum', enum: ['premium_mensal', 'premium_anual'] })
  plano!: Exclude<UserPlan, 'gratuito'>;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  valor!: number;

  @Column({ name: 'mercado_pago_preference_id', type: 'varchar', length: 100, nullable: true })
  mercadoPagoPreferenceId!: string | null;

  // Só preenchido quando o webhook confirma o pagamento de verdade — external_reference
  // (id desta linha) é o que correlaciona a preferência criada com a notificação recebida.
  @Column({ name: 'mercado_pago_payment_id', type: 'varchar', length: 100, nullable: true, unique: true })
  mercadoPagoPaymentId!: string | null;

  @Column({ type: 'enum', enum: ['pending', 'approved', 'rejected'], default: 'pending' })
  status!: 'pending' | 'approved' | 'rejected';

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
