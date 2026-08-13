import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import { DailyChecklistPeriod } from './daily-checklist-period.entity';
import { ScheduleMode } from './database.enums';
import { User } from './user.entity';

/**
 * ある業務日に対する日別チェック表全体のヘッダー。
 *
 * 実際のカテゴリ・道具は時間帯テーブル以下に保存し、このテーブルは日付、運用方式、
 * 作成者だけを持つ。`workDate`を一意にして、同日の二重作成をDBでも防止する。
 */
@Entity({ name: 'daily_checklists' })
@Index('idx_daily_checklists_created_by', ['createdByUserId'])
// 同時リクエストがService層の確認をすり抜けても、1日1表を最後にDBで保証する。
@Index('uq_daily_checklists_work_date', ['workDate'], { unique: true })
export class DailyChecklist {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'work_date', type: 'date' })
  workDate!: string;

  @Column({ name: 'schedule_mode', type: 'enum', enum: ScheduleMode })
  scheduleMode!: ScheduleMode;

  @Column({ name: 'created_by_user_id', type: 'char', length: 36 })
  createdByUserId!: string;

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

  @OneToMany(() => DailyChecklistPeriod, (period) => period.checklist)
  periods!: Relation<DailyChecklistPeriod[]>;
}
