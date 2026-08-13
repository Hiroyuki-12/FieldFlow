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

import { Category } from './category.entity';
import { DailyChecklistItem } from './daily-checklist-item.entity';
import { RecordStatus } from './database.enums';

/**
 * チームが保有する道具と在庫上限を管理する道具マスター。
 *
 * `stockQuantity`は保有総数であり、日々の持ち出し数は`daily_checklist_items`へ保存する。
 * マスター変更で過去の日別表が変わらないよう、日別項目には名称・在庫数の当時値を保存する。
 */
@Entity({ name: 'tools' })
// 有効な道具をカテゴリ別・表示順で取得する一覧クエリを支える。
@Index('idx_tools_status_category_display_order', [
  'status',
  'categoryId',
  'displayOrder',
])
@Index('idx_tools_category_id', ['categoryId'])
// 表記揺れによる同一道具の二重登録をDBでも防止する。
@Index('uq_tools_name', ['name'], { unique: true })
// 在庫数と表示順はUI・業務ルールで扱える0〜9999に限定する。
@Check('chk_tools_stock_quantity', '`stock_quantity` BETWEEN 0 AND 9999')
@Check('chk_tools_display_order', '`display_order` BETWEEN 0 AND 9999')
export class Tool {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'category_id', type: 'char', length: 36 })
  categoryId!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ name: 'stock_quantity', type: 'int', unsigned: true })
  stockQuantity!: number;

  @Column({ name: 'display_order', type: 'int', unsigned: true, default: 0 })
  displayOrder!: number;

  @Column({ type: 'enum', enum: RecordStatus, default: RecordStatus.ACTIVE })
  status!: RecordStatus;

  @VersionColumn({ type: 'int', unsigned: true, default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;

  // 道具やカテゴリの利用停止はstatusで行い、過去の日別表から参照を失わせない。
  @ManyToOne(() => Category, (category) => category.tools, {
    onDelete: 'RESTRICT',
    onUpdate: 'RESTRICT',
  })
  @JoinColumn({
    name: 'category_id',
    foreignKeyConstraintName: 'fk_tools_category',
  })
  category!: Relation<Category>;

  @OneToMany(() => DailyChecklistItem, (item) => item.sourceTool)
  checklistItems!: Relation<DailyChecklistItem[]>;
}
