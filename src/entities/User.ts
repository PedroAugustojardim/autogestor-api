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

  @Column({ default: false })
  blocked!: boolean;

  @Column({ name: 'last_login_at', type: 'datetime', nullable: true })
  lastLoginAt!: Date | null;

  // null = email ainda não confirmado; enquanto for null a conta não consegue logar.
  @Column({ name: 'email_verified_at', type: 'datetime', nullable: true })
  emailVerifiedAt!: Date | null;

  // Hash do código de 6 dígitos enviado por email (nunca o código em si — mesmo padrão
  // de resetPasswordToken). Só existe enquanto a conta está aguardando confirmação.
  @Column({ type: 'varchar', name: 'email_verification_code', length: 64, nullable: true })
  emailVerificationCode!: string | null;

  @Column({ name: 'email_verification_expires', type: 'datetime', nullable: true })
  emailVerificationExpires!: Date | null;

  // Tentativas erradas do código atual — 6 dígitos são só 1 milhão de combinações, então o
  // limite por código (não só o rate limit por IP) é o que impede força bruta distribuída.
  @Column({ name: 'email_verification_attempts', type: 'int', default: 0 })
  emailVerificationAttempts!: number;

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
