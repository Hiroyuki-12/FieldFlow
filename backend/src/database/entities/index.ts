import { Category } from './category.entity';
import { DailyChecklistItem } from './daily-checklist-item.entity';
import { DailyChecklistPeriodCategory } from './daily-checklist-period-category.entity';
import { DailyChecklistPeriod } from './daily-checklist-period.entity';
import { DailyChecklist } from './daily-checklist.entity';
import { RefreshSession } from './refresh-session.entity';
import { Tool } from './tool.entity';
import { User } from './user.entity';

/** NestJSとCLIで同じEntity一覧を使い、登録漏れによる環境差を防ぐ。 */
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
