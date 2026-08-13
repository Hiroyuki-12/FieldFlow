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

/**
 * 各時間帯で利用者が選択した作業カテゴリを記録する中間・履歴テーブル。
 *
 * Categoryへの参照に加えて、名称と表示順の当時値（スナップショット）を保存する。
 * 後日マスター名や表示順を変更しても、「その日に何を選んだか」という過去の表示を変えないため。
 */
@Entity({ name: 'daily_checklist_period_categories' })
// 1つの時間帯へ同じカテゴリを複数回追加することをDBでも拒否する。
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

  // 元カテゴリを物理削除させず、当時値とマスター参照の両方を保持する。
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
