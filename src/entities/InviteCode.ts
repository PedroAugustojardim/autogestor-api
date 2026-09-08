import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from './User';

@Entity('invite_codes')
export class InviteCode {
  @PrimaryGeneratedColumn()
  id!: number;

  // SHA-256(código) — o valor bruto só existe na resposta do seed (pra distribuir
  // ao convidado) e nunca é persistido, mesmo padrão de refresh_tokens.token e
  // users.reset_password_token (ver hashToken em src/utils/hashToken.ts).
  @Column({ unique: true, length: 64 })
  code!: string;

  @Column({ name: 'used_by', nullable: true })
  usedBy!: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'used_by' })
  user?: User;

  @Column({ name: 'expires_at', type: 'datetime', nullable: true })
  expiresAt!: Date | null;

  @Column({ name: 'used_at', type: 'datetime', nullable: true })
  usedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
