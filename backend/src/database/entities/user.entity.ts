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

/**
 * ログイン情報、権限、アカウント状態を保持するユーザーマスター。
 *
 * ユーザーはRefresh Sessionと日別表の作成者から参照されるため物理削除しない。
 * 退職などで利用を止める場合は`status=INACTIVE`にし、過去の監査情報を残す。
 */
@Entity({ name: 'users' })
@Index('idx_users_status', ['status'])
// MySQLの照合順序により大文字小文字を区別せず、同じログインIDの重複をDBでも防ぐ。
@Index('uq_users_login_id', ['loginId'], { unique: true })
export class User {
  // UUIDはService／Seed側で生成する。環境をまたいでも衝突しにくく、連番を外部へ見せない。
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

  // Seedで作った初期パスワードのまま利用し続けないよう、初回ログイン後の変更を要求する。
  @Column({ name: 'must_change_password', type: 'boolean', default: true })
  mustChangePassword!: boolean;

  // パスワード変更などで増加させ、発行済みAccess Tokenを全端末まとめて失効させる。
  @Column({ name: 'auth_version', type: 'int', unsigned: true, default: 1 })
  authVersion!: number;

  // 連続失敗回数と解除時刻を組み合わせ、総当たりログインを一時的に制限する。
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

  // Token本体は持たず、端末ごとのRefresh Token状態を別テーブルで管理する。
  @OneToMany(() => RefreshSession, (session) => session.user)
  refreshSessions!: Relation<RefreshSession[]>;

  // 日別表には作成者IDを残し、ユーザーが利用停止になった後も作成者を追跡できるようにする。
  @OneToMany(() => DailyChecklist, (checklist) => checklist.createdByUser)
  createdChecklists!: Relation<DailyChecklist[]>;
}
