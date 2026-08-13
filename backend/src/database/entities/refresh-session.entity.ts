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

/**
 * 端末ごとのRefresh Tokenの有効期限、失効、ローテーション履歴を管理する。
 *
 * Cookieへ渡すToken本体は保存せず、照合用のSHA-256ハッシュだけを保持する。
 * DBが漏洩しても、保存値をそのままRefresh Tokenとして悪用できないようにするため。
 */
@Entity({ name: 'refresh_sessions' })
// ユーザーの「現在有効なセッション」を失効状態と期限から効率よく検索する。
@Index('idx_refresh_sessions_user_validity', [
  'userId',
  'revokedAt',
  'expiresAt',
])
@Index('idx_refresh_sessions_replaced_by', ['replacedBySessionId'])
// 同じRefresh Tokenが複数セッションへ登録されることを防ぐ。
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

  // ローテーション前後のセッションをつなぎ、使用済みTokenの再利用検知に利用する。
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
