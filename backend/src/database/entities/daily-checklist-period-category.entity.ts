import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import type { Relation } from 'typeorm';

import { Category } from './category.entity';
import { DailyChecklistPeriod } from './daily-checklist-period.entity';

/** 時間帯で選択した作業カテゴリと、選択時点の表示情報を保持する。 */
@Entity({ name: 'daily_checklist_period_categories' })
@Unique('uq_period_categories_period_source', ['periodId', 'sourceCategoryId'])
@Index('idx_period_categories_source_category', ['sourceCategoryId'])
export class DailyChecklistPeriodCategory {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'period_id', type: 'char', length: 36 })
  periodId!: string;

  @Column({ name: 'source_category_id', type: 'char', length: 36 })
  sourceCategoryId!: string;

  // マスター名変更後も、その日に選択した表示内容を変えないためのスナップショット。
  @Column({ name: 'category_name_snapshot', type: 'varchar', length: 50 })
  categoryNameSnapshot!: string;

  @Column({ name: 'display_order_snapshot', type: 'int', unsigned: true })
  displayOrderSnapshot!: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @ManyToOne(() => DailyChecklistPeriod, (period) => period.categories, {
    onDelete: 'RESTRICT',
    onUpdate: 'RESTRICT',
  })
  @JoinColumn({
    name: 'period_id',
    foreignKeyConstraintName: 'fk_period_categories_period',
  })
  period!: Relation<DailyChecklistPeriod>;

  @ManyToOne(() => Category, (category) => category.periodCategories, {
    onDelete: 'RESTRICT',
    onUpdate: 'RESTRICT',
  })
  @JoinColumn({
    name: 'source_category_id',
    foreignKeyConstraintName: 'fk_period_categories_source_category',
  })
  sourceCategory!: Relation<Category>;
}
