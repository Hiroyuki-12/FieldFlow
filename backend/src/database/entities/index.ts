import { Category } from './category.entity';
import { DailyChecklistItem } from './daily-checklist-item.entity';
import { DailyChecklistPeriodCategory } from './daily-checklist-period-category.entity';
import { DailyChecklistPeriod } from './daily-checklist-period.entity';
import { DailyChecklist } from './daily-checklist.entity';
import { RefreshSession } from './refresh-session.entity';
import { Tool } from './tool.entity';
import { User } from './user.entity';

/**
 * NestJS、Migration CLI、Seed、結合テストで共有するEntity一覧。
 * 新しいEntityを追加したらここにも登録する。1か所に集約することで、実行方法によって
 * 読み込まれるEntityが異なり、Relationやスキーマ比較が失敗する状態を防ぐ。
 */
export const DATABASE_ENTITIES = [
  User,
  RefreshSession,
  Category,
  Tool,
  DailyChecklist,
  DailyChecklistPeriod,
  DailyChecklistPeriodCategory,
  DailyChecklistItem,
];

export {
  Category,
  DailyChecklist,
  DailyChecklistItem,
  DailyChecklistPeriod,
  DailyChecklistPeriodCategory,
  RefreshSession,
  Tool,
  User,
};
export * from './database.enums';
