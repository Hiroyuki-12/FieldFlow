import {
  ChecklistPeriodType,
  DailyChecklist,
  DailyChecklistItem,
  DailyChecklistPeriod,
  DailyChecklistPeriodCategory,
  ScheduleMode,
} from '../database/entities';

export interface DailyChecklistCategoryResponse {
  sourceCategoryId: string;
  categoryName: string;
}

export interface DailyChecklistItemResponse {
  id: string;
  sourceToolId: string;
  toolName: string;
  categoryName: string;
  stockQuantity: number;
  takeoutQuantity: number;
  checked: boolean;
  version: number;
  updatedAt: Date;
}

export interface DailyChecklistPeriodResponse {
  id: string;
  period: ChecklistPeriodType;
  categories: DailyChecklistCategoryResponse[];
  items: DailyChecklistItemResponse[];
}

/** 画面へ返す日別表。作成者など表示不要な内部Relationは公開しない。 */
export interface DailyChecklistResponse {
  id: string;
  workDate: string;
  scheduleMode: ScheduleMode;
  editable: boolean;
  periods: DailyChecklistPeriodResponse[];
}

export type DailyChecklistGraph = DailyChecklist & {
  periods: Array<
    DailyChecklistPeriod & {
      categories: DailyChecklistPeriodCategory[];
      items: DailyChecklistItem[];
    }
  >;
};

const PERIOD_ORDER: Record<ChecklistPeriodType, number> = {
  [ChecklistPeriodType.FULL_DAY]: 0,
  [ChecklistPeriodType.MORNING]: 1,
  [ChecklistPeriodType.AFTERNOON]: 2,
};

/** Entityを並び順が安定した公開レスポンスへ変換する。 */
export function toDailyChecklistResponse(
  checklist: DailyChecklistGraph,
  today: string,
): DailyChecklistResponse {
  return {
    id: checklist.id,
    workDate: checklist.workDate,
    scheduleMode: checklist.scheduleMode,
    editable: checklist.workDate >= today,
    periods: [...checklist.periods]
      .sort(
        (left, right) => PERIOD_ORDER[left.period] - PERIOD_ORDER[right.period],
      )
      .map((period) => ({
        id: period.id,
        period: period.period,
        categories: [...period.categories]
          .sort(
            (left, right) =>
              left.displayOrderSnapshot - right.displayOrderSnapshot ||
              compareText(
                left.categoryNameSnapshot,
                right.categoryNameSnapshot,
              ) ||
              compareText(left.id, right.id),
          )
          .map((category) => ({
            sourceCategoryId: category.sourceCategoryId,
            categoryName: category.categoryNameSnapshot,
          })),
        items: [...period.items]
          .sort(
            (left, right) =>
              compareText(
                left.categoryNameSnapshot,
                right.categoryNameSnapshot,
              ) ||
              left.displayOrderSnapshot - right.displayOrderSnapshot ||
              compareText(left.toolNameSnapshot, right.toolNameSnapshot) ||
              compareText(left.id, right.id),
          )
          .map((item) => ({
            id: item.id,
            sourceToolId: item.sourceToolId,
            toolName: item.toolNameSnapshot,
            categoryName: item.categoryNameSnapshot,
            stockQuantity: item.stockQuantitySnapshot,
            takeoutQuantity: item.takeoutQuantity,
            checked: item.checked,
            version: item.version,
            updatedAt: item.updatedAt,
          })),
      })),
  };
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
