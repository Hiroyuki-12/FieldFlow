import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import { DailyChecklistItem } from './daily-checklist-item.entity';
import { DailyChecklistPeriodCategory } from './daily-checklist-period-category.entity';
import { DailyChecklist } from './daily-checklist.entity';
import { ChecklistPeriodType } from './database.enums';

/**
 * 日別チェック表を「終日」または「午前・午後」の操作単位へ分割する。
 *
 * FULL_DAY方式ではFULL_DAYを1行、SPLIT方式ではMORNINGとAFTERNOONを各1行作る。
 * scheduleModeとの組み合わせは複数行にまたがるため、ServiceのTransactionで保証する。
 */
@Entity({ name: 'daily_checklist_periods' })
// 同じ日別表に午前が2行作られるなど、時間帯の重複を防ぐ。
@Unique('uq_daily_checklist_periods_checklist_period', [
  'checklistId',
  'period',
])
export class DailyChecklistPeriod {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'checklist_id', type: 'char', length: 36 })
  checklistId!: string;

  @Column({ type: 'enum', enum: ChecklistPeriodType })
  period!: ChecklistPeriodType;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;

  @ManyToOne(() => DailyChecklist, (checklist) => checklist.periods, {
    onDelete: 'RESTRICT',
    onUpdate: 'RESTRICT',
  })
  @JoinColumn({
    name: 'checklist_id',
    foreignKeyConstraintName: 'fk_daily_checklist_periods_checklist',
  })
  checklist!: Relation<DailyChecklist>;

  @OneToMany(
    () => DailyChecklistPeriodCategory,
    (periodCategory) => periodCategory.period,
  )
  categories!: Relation<DailyChecklistPeriodCategory[]>;

  // 各時間帯が、実際に数量・チェック状態を更新する複数の道具行を持つ。
  @OneToMany(() => DailyChecklistItem, (item) => item.period)
  items!: Relation<DailyChecklistItem[]>;
}
