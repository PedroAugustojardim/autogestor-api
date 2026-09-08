import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from './User';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 500 })
  token!: string;

  @Column({ name: 'user_id' })
  userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  // Todos os tokens gerados por uma cadeia de rotação (login -> refresh -> refresh -> ...)
  // compartilham o mesmo familyId. Nullable só para linhas criadas antes desta coluna existir.
  @Column({ name: 'family_id', type: 'varchar', length: 36, nullable: true })
  familyId!: string | null;

  @Column({ name: 'expires_at', type: 'datetime' })
  expiresAt!: Date;

  @Column({ default: false })
  revoked!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
