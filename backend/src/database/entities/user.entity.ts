import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import { DailyChecklist } from './daily-checklist.entity';
import { RecordStatus, UserRole } from './database.enums';
import { RefreshSession } from './refresh-session.entity';

/** 認証情報と権限を保持するユーザー。履歴参照を守るため物理削除しない。 */
@Entity({ name: 'users' })
@Index('idx_users_status', ['status'])
@Index('uq_users_login_id', ['loginId'], { unique: true })
export class User {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ name: 'login_id', type: 'varchar', length: 50 })
  loginId!: string;

  // Argon2idハッシュだけを保存し、平文パスワードは永続化しない。
  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ type: 'enum', enum: UserRole })
  role!: UserRole;

  @Column({ type: 'enum', enum: RecordStatus, default: RecordStatus.ACTIVE })
  status!: RecordStatus;

  @Column({ name: 'must_change_password', type: 'boolean', default: true })
  mustChangePassword!: boolean;

  @Column({ name: 'auth_version', type: 'int', unsigned: true, default: 1 })
  authVersion!: number;

  @Column({
    name: 'failed_login_count',
    type: 'int',
    unsigned: true,
    default: 0,
  })
  failedLoginCount!: number;

  @Column({
    name: 'locked_until',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  lockedUntil!: Date | null;

  // 同時編集による意図しない上書きを検出するため、更新ごとに加算する。
  @VersionColumn({ type: 'int', unsigned: true, default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;

  @OneToMany(() => RefreshSession, (session) => session.user)
  refreshSessions!: Relation<RefreshSession[]>;

  @OneToMany(() => DailyChecklist, (checklist) => checklist.createdByUser)
  createdChecklists!: Relation<DailyChecklist[]>;
}
