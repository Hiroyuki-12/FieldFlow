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

/** 作業単位で道具をまとめるマスター。COMMONはSeedで作る特別な1件。 */
@Entity({ name: 'categories' })
@Index('idx_categories_status_display_order', ['status', 'displayOrder'])
@Index('uq_categories_name', ['name'], { unique: true })
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

  @OneToMany(
    () => DailyChecklistPeriodCategory,
    (periodCategory) => periodCategory.sourceCategory,
  )
  periodCategories!: Relation<DailyChecklistPeriodCategory[]>;
}
