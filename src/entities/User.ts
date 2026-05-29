import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
} from 'typeorm';

export type UserPlan = 'gratuito' | 'premium_mensal' | 'premium_anual';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 100 })
  name!: string;

  @Column({ unique: true, length: 150 })
  email!: string;

  @Column({ name: 'password_hash', length: 255 })
  passwordHash!: string;

  @Column({ type: 'enum', enum: ['gratuito', 'premium_mensal', 'premium_anual'], default: 'gratuito' })
  plano!: UserPlan;

  @Column({ name: 'is_admin', default: false })
  isAdmin!: boolean;

  @Column({ name: 'notifications_enabled', default: true })
  notificationsEnabled!: boolean;

  @Column({ type: 'varchar', name: 'fcm_token', length: 255, nullable: true })
  fcmToken!: string | null;

  @Column({ type: 'varchar', name: 'reset_password_token', length: 255, nullable: true })
  resetPasswordToken!: string | null;

  @Column({ name: 'reset_password_expires', type: 'datetime', nullable: true })
  resetPasswordExpires!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt!: Date | null;
}
