import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import { DailyChecklistPeriod } from './daily-checklist-period.entity';
import { Tool } from './tool.entity';

/**
 * 日別チェック画面で利用者が数量とチェック状態を更新する道具1行分のデータ。
 *
 * Toolへの参照に加えて、作成時点の道具名・カテゴリ名・在庫数・表示順を保存する。
 * 後からマスターを編集しても、過去のチェック内容と当時の上限を維持するため。
 */
@Entity({ name: 'daily_checklist_items' })
// 同じ時間帯へ同一道具を二重追加し、数量が別々に管理される事故を防ぐ。
@Unique('uq_daily_checklist_items_period_source', ['periodId', 'sourceToolId'])
@Index('idx_daily_checklist_items_source_tool', ['sourceToolId'])
@Check(
  'chk_daily_checklist_items_takeout_quantity',
  '`takeout_quantity` BETWEEN 0 AND `stock_quantity_snapshot`',
)
// 数量0なのに準備完了と記録される、意味の矛盾した状態をDBでも拒否する。
@Check(
  'chk_daily_checklist_items_checked_quantity',
  'NOT (`checked` = 1 AND `takeout_quantity` = 0)',
)
export class DailyChecklistItem {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'period_id', type: 'char', length: 36 })
  periodId!: string;

  @Column({ name: 'source_tool_id', type: 'char', length: 36 })
  sourceToolId!: string;

  @Column({ name: 'tool_name_snapshot', type: 'varchar', length: 100 })
  toolNameSnapshot!: string;

  @Column({ name: 'category_name_snapshot', type: 'varchar', length: 50 })
  categoryNameSnapshot!: string;

  @Column({ name: 'stock_quantity_snapshot', type: 'int', unsigned: true })
  stockQuantitySnapshot!: number;

  // 実際に持ち出す数。保有総数であるTool.stockQuantityは変更しない。
  @Column({ name: 'takeout_quantity', type: 'int', unsigned: true, default: 0 })
  takeoutQuantity!: number;

  @Column({ type: 'boolean', default: false })
  checked!: boolean;

  @Column({ name: 'display_order_snapshot', type: 'int', unsigned: true })
  displayOrderSnapshot!: number;

  // where id/versionで更新することで、別ユーザーの更新を上書きしない。
  @VersionColumn({ type: 'int', unsigned: true, default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;

  @ManyToOne(() => DailyChecklistPeriod, (period) => period.items, {
    onDelete: 'RESTRICT',
    onUpdate: 'RESTRICT',
  })
  @JoinColumn({
    name: 'period_id',
    foreignKeyConstraintName: 'fk_daily_checklist_items_period',
  })
  period!: Relation<DailyChecklistPeriod>;

  @ManyToOne(() => Tool, (tool) => tool.checklistItems, {
    onDelete: 'RESTRICT',
    onUpdate: 'RESTRICT',
  })
  @JoinColumn({
    name: 'source_tool_id',
    foreignKeyConstraintName: 'fk_daily_checklist_items_source_tool',
  })
  sourceTool!: Relation<Tool>;
}
