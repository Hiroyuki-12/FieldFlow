import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import { User } from './user.entity';

/** 端末ごとのRefresh Token状態。Token本体ではなく固定長ハッシュだけを保存する。 */
@Entity({ name: 'refresh_sessions' })
@Index('idx_refresh_sessions_user_validity', [
  'userId',
  'revokedAt',
  'expiresAt',
])
@Index('idx_refresh_sessions_replaced_by', ['replacedBySessionId'])
@Index('uq_refresh_sessions_token_hash', ['tokenHash'], { unique: true })
export class RefreshSession {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'user_id', type: 'char', length: 36 })
  userId!: string;

  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'datetime', precision: 6 })
  expiresAt!: Date;

  @Column({
    name: 'revoked_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  revokedAt!: Date | null;

  @Column({
    name: 'replaced_by_session_id',
    type: 'char',
    length: 36,
    nullable: true,
  })
  replacedBySessionId!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent!: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  // 利用停止後もセッション調査履歴を保持するため、ユーザー削除はDBでも拒否する。
  @ManyToOne(() => User, (user) => user.refreshSessions, {
    onDelete: 'RESTRICT',
    onUpdate: 'RESTRICT',
  })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_refresh_sessions_user',
  })
  user!: Relation<User>;

  @ManyToOne(() => RefreshSession, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'RESTRICT',
  })
  @JoinColumn({
    name: 'replaced_by_session_id',
    foreignKeyConstraintName: 'fk_refresh_sessions_replaced_by',
  })
  replacedBySession!: Relation<RefreshSession> | null;
}
