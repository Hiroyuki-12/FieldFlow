import { apiHttpClient } from './client';

export type CategoryStatus = 'ACTIVE' | 'INACTIVE';
export type CategoryType = 'WORK' | 'COMMON';

export interface ManagedCategory {
  id: string;
  name: string;
  displayOrder: number;
  categoryType: CategoryType;
  status: CategoryStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryListResponse {
  items: ManagedCategory[];
}

export interface CategoryFilters {
  search?: string;
  status?: CategoryStatus | '';
}

export interface SaveCategoryInput {
  name: string;
  displayOrder: number;
}

export interface UpdateCategoryInput extends SaveCategoryInput {
  version: number;
}

/** 空の絞り込みをQueryへ含めず、一覧URLを読みやすく保つ。 */
export async function listCategories(
  filters: CategoryFilters,
): Promise<CategoryListResponse> {
  const params = Object.fromEntries(
    Object.entries(filters).filter(
      ([, value]) => value !== undefined && value !== '',
    ),
  );
  const response = await apiHttpClient.get<CategoryListResponse>(
    '/categories',
    { params },
  );
  return response.data;
}

export async function createCategory(
  input: SaveCategoryInput,
): Promise<ManagedCategory> {
  const response = await apiHttpClient.post<ManagedCategory>(
    '/categories',
    input,
  );
  return response.data;
}

export async function updateCategory(
  id: string,
  input: UpdateCategoryInput,
): Promise<ManagedCategory> {
  const response = await apiHttpClient.patch<ManagedCategory>(
    '/categories/' + id,
    input,
  );
  return response.data;
}

export async function updateCategoryStatus(
  category: Pick<ManagedCategory, 'id' | 'version'>,
  status: CategoryStatus,
): Promise<ManagedCategory> {
  const response = await apiHttpClient.patch<ManagedCategory>(
    '/categories/' + category.id + '/status',
    { status, version: category.version },
  );
  return response.data;
}
