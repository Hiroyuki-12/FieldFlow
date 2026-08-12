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

/** 日別チェックをFULL_DAY、MORNING、AFTERNOONの単位へ分ける。 */
@Entity({ name: 'daily_checklist_periods' })
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

  @OneToMany(() => DailyChecklistItem, (item) => item.period)
  items!: Relation<DailyChecklistItem[]>;
}
