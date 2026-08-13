import {
  Check,
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

import { DailyChecklistPeriodCategory } from './daily-checklist-period-category.entity';
import { CategoryType, RecordStatus } from './database.enums';
import { Tool } from './tool.entity';

/**
 * 「清掃」「高所作業」など、作業単位で道具をまとめるカテゴリマスター。
 *
 * `WORK`は利用者が日別表へ選択する通常カテゴリ、`COMMON`は全日別表へ自動追加する
 * 特別なカテゴリ。COMMONはSeedで1件作り、変更・停止の禁止はService層で保証する。
 */
@Entity({ name: 'categories' })
// 一覧画面の主要な絞り込みと表示順に合わせた複合インデックス。
@Index('idx_categories_status_display_order', ['status', 'displayOrder'])
// 名称の大文字小文字違いによる実質的な重複もMySQL側で拒否する。
@Index('uq_categories_name', ['name'], { unique: true })
// APIを経由しないSQLからも、画面で扱える表示順の範囲を超えないようにする。
@Check('chk_categories_display_order', '`display_order` BETWEEN 0 AND 9999')
export class Category {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 50 })
  name!: string;

  @Column({ name: 'display_order', type: 'int', unsigned: true, default: 0 })
  displayOrder!: number;

  @Column({ name: 'category_type', type: 'enum', enum: CategoryType })
  categoryType!: CategoryType;

  @Column({ type: 'enum', enum: RecordStatus, default: RecordStatus.ACTIVE })
  status!: RecordStatus;

  @VersionColumn({ type: 'int', unsigned: true, default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;

  @OneToMany(() => Tool, (tool) => tool.category)
  tools!: Relation<Tool[]>;

  // 過去の日別表ではカテゴリ名の当時値を保存しつつ、元マスターへの参照も保持する。
  @OneToMany(
    () => DailyChecklistPeriodCategory,
    (periodCategory) => periodCategory.sourceCategory,
  )
  periodCategories!: Relation<DailyChecklistPeriodCategory[]>;
}
