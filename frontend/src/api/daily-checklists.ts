import { apiHttpClient } from './client';
import { listTools } from './tools';

export type ScheduleMode = 'FULL_DAY' | 'SPLIT';
export type ChecklistPeriod = 'FULL_DAY' | 'MORNING' | 'AFTERNOON';

export interface DailyChecklistCategory {
  sourceCategoryId: string;
  categoryName: string;
}

export interface DailyChecklistItem {
  id: string;
  sourceToolId: string;
  toolName: string;
  categoryName: string;
  stockQuantity: number;
  takeoutQuantity: number;
  checked: boolean;
  version: number;
  updatedAt: string;
}

export interface DailyChecklistPeriod {
  id: string;
  period: ChecklistPeriod;
  categories: DailyChecklistCategory[];
  items: DailyChecklistItem[];
}

export interface DailyChecklist {
  id: string;
  version: number;
  workDate: string;
  scheduleMode: ScheduleMode;
  editable: boolean;
  periods: DailyChecklistPeriod[];
}

export interface CreateDailyChecklistInput {
  scheduleMode: ScheduleMode;
  periods: Array<{
    period: ChecklistPeriod;
    categoryIds: string[];
  }>;
}

export interface UpdateDailyChecklistConfigurationInput
  extends CreateDailyChecklistInput {
  checklistId: string;
  version: number;
  confirmDataLoss: boolean;
}

export interface CancelDailyChecklistInput {
  checklistId: string;
  version: number;
  confirmDataLoss: boolean;
}

export interface UpdateDailyChecklistItemInput {
  takeoutQuantity: number;
  checked: boolean;
  version: number;
}

export interface AddDailyChecklistCategoriesInput {
  categoryIds: string[];
}

export interface ChecklistCategoryOption {
  id: string;
  name: string;
  displayOrder: number;
}

export async function getDailyChecklist(date: string): Promise<DailyChecklist> {
  const response = await apiHttpClient.get<DailyChecklist>(
    `/daily-checklists/${date}`,
  );
  return response.data;
}

export async function createDailyChecklist(
  date: string,
  input: CreateDailyChecklistInput,
): Promise<DailyChecklist> {
  const response = await apiHttpClient.put<DailyChecklist>(
    `/daily-checklists/${date}`,
    input,
  );
  return response.data;
}

/** 道具1行だけを取得済みversionで更新し、成功後の新しいversionを受け取る。 */
export async function updateDailyChecklistItem(
  date: string,
  period: ChecklistPeriod,
  itemId: string,
  input: UpdateDailyChecklistItemInput,
): Promise<DailyChecklistItem> {
  const response = await apiHttpClient.patch<DailyChecklistItem>(
    `/daily-checklists/${date}/periods/${period}/items/${itemId}`,
    input,
  );
  return response.data;
}

/** 現在の時間帯へ作業カテゴリと有効な道具のスナップショットを一括追加する。 */
export async function addDailyChecklistCategories(
  date: string,
  period: ChecklistPeriod,
  input: AddDailyChecklistCategoriesInput,
): Promise<DailyChecklist> {
  const response = await apiHttpClient.post<DailyChecklist>(
    `/daily-checklists/${date}/periods/${period}/categories`,
    input,
  );
  return response.data;
}

/** 設定変更は旧版を履歴へ残し、新しい現行版を作成する。 */
export async function updateDailyChecklistConfiguration(
  date: string,
  input: UpdateDailyChecklistConfigurationInput,
): Promise<DailyChecklist> {
  const response = await apiHttpClient.patch<DailyChecklist>(
    `/daily-checklists/${date}/configuration`,
    input,
  );
  return response.data;
}

/** 画面上の削除は物理削除ではなく、現行版を取消済みにする。 */
export async function cancelDailyChecklist(
  date: string,
  input: CancelDailyChecklistInput,
): Promise<void> {
  await apiHttpClient.delete(`/daily-checklists/${date}`, { data: input });
}

/**
 * 道具一覧レスポンスに含まれる全カテゴリ選択肢を再利用する。
 * 新しい管理APIを作業者へ公開せず、既存の「全ユーザーが道具を閲覧可能」という権限境界を保つ。
 */
export async function listChecklistCategoryOptions(): Promise<
  ChecklistCategoryOption[]
> {
  const response = await listTools({ page: 1, pageSize: 1 });
  return response.categories
    .filter(
      (category) =>
        category.categoryType === 'WORK' && category.status === 'ACTIVE',
    )
    .map(({ id, name, displayOrder }) => ({ id, name, displayOrder }));
}
