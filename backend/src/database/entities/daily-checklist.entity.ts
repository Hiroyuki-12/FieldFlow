import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import { DailyChecklistPeriod } from './daily-checklist-period.entity';
import { DailyChecklistStatus, ScheduleMode } from './database.enums';
import { User } from './user.entity';

/**
 * ある業務日に対する日別チェック表全体のヘッダー。
 *
 * 実際のカテゴリ・道具は時間帯テーブル以下に保存し、このテーブルで日付、運用方式、
 * 現行・取消状態を管理する。取消版を残しながら、現行版だけは1日1件に限定する。
 */
@Entity({ name: 'daily_checklists' })
@Index('idx_daily_checklists_created_by', ['createdByUserId'])
@Index('idx_daily_checklists_cancelled_by', ['cancelledByUserId'])
// CANCELLED履歴は複数残しながら、ACTIVEな現行版だけを1日1件へ限定する。
@Index('uq_daily_checklists_active_work_date', ['activeWorkDate'], {
  unique: true,
})
@Check(
  'chk_daily_checklists_active_work_date',
  "((`status` = 'ACTIVE' AND `active_work_date` IS NOT NULL AND `active_work_date` = `work_date`) OR (`status` = 'CANCELLED' AND `active_work_date` IS NULL))",
)
export class DailyChecklist {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'work_date', type: 'date' })
  workDate!: string;

  @Column({ name: 'schedule_mode', type: 'enum', enum: ScheduleMode })
  scheduleMode!: ScheduleMode;

  @Column({
    type: 'enum',
    enum: DailyChecklistStatus,
    default: DailyChecklistStatus.ACTIVE,
  })
  status!: DailyChecklistStatus;

  /**
   * ACTIVE行だけworkDateを複製し、CANCELLED時はNULLにする。
   * 一意制約とCHECK制約を組み合わせ、履歴を複数残しつつ現行版を1日1件へ限定する。
   */
  @Column({
    name: 'active_work_date',
    type: 'date',
    nullable: true,
  })
  activeWorkDate!: string | null;

  @Column({ name: 'created_by_user_id', type: 'char', length: 36 })
  createdByUserId!: string;

  @Column({
    name: 'cancelled_by_user_id',
    type: 'char',
    length: 36,
    nullable: true,
  })
  cancelledByUserId!: string | null;

  @Column({
    name: 'cancelled_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  cancelledAt!: Date | null;

  // 画面が取得した版と現行版を比較し、別ユーザーの設定変更・削除を上書きしない。
  @VersionColumn({ type: 'int', unsigned: true, default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;

  // 作成者が利用停止になっても監査情報を残すため、参照中のユーザー削除を拒否する。
  @ManyToOne(() => User, (user) => user.createdChecklists, {
    onDelete: 'RESTRICT',
    onUpdate: 'RESTRICT',
  })
  @JoinColumn({
    name: 'created_by_user_id',
    foreignKeyConstraintName: 'fk_daily_checklists_created_by',
  })
  createdByUser!: Relation<User>;

  // 取り消した利用者を残し、「誰が削除したか」を後から確認できるようにする。
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'RESTRICT',
  })
  @JoinColumn({
    name: 'cancelled_by_user_id',
    foreignKeyConstraintName: 'fk_daily_checklists_cancelled_by',
  })
  cancelledByUser!: Relation<User | null>;

  @OneToMany(() => DailyChecklistPeriod, (period) => period.checklist)
  periods!: Relation<DailyChecklistPeriod[]>;
}
