import {
  Category,
  CategoryType,
  RecordStatus,
} from '../database/entities';

/** 管理画面へ公開するカテゴリ情報。Relationは意図せず巨大化しないよう含めない。 */
export interface CategoryResponse {
  id: string;
  name: string;
  displayOrder: number;
  categoryType: CategoryType;
  status: RecordStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryListResponse {
  items: CategoryResponse[];
}

export function toCategoryResponse(category: Category): CategoryResponse {
  return {
    id: category.id,
    name: category.name,
    displayOrder: category.displayOrder,
    categoryType: category.categoryType,
    status: category.status,
    version: category.version,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}
