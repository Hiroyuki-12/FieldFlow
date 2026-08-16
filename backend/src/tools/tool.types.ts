import {
  Category,
  CategoryType,
  RecordStatus,
  Tool,
} from '../database/entities';

/** 一覧・詳細画面へ必要なカテゴリ表示情報だけを含める公開レスポンス。 */
export interface ToolResponse {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  categoryType: CategoryType;
  categoryStatus: RecordStatus;
  stockQuantity: number;
  displayOrder: number;
  status: RecordStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ToolListResponse {
  items: ToolResponse[];
  categories: ToolCategoryOption[];
  page: number;
  pageSize: number;
  total: number;
}

/** 絞り込みと管理フォームで共用するカテゴリ選択肢。 */
export interface ToolCategoryOption {
  id: string;
  name: string;
  categoryType: CategoryType;
  status: RecordStatus;
  displayOrder: number;
}

export type ToolWithCategory = Tool & { category: Category };

export function toToolResponse(tool: ToolWithCategory): ToolResponse {
  return {
    id: tool.id,
    name: tool.name,
    categoryId: tool.categoryId,
    categoryName: tool.category.name,
    categoryType: tool.category.categoryType,
    categoryStatus: tool.category.status,
    stockQuantity: tool.stockQuantity,
    displayOrder: tool.displayOrder,
    status: tool.status,
    version: tool.version,
    createdAt: tool.createdAt,
    updatedAt: tool.updatedAt,
  };
}

export function toToolCategoryOption(category: Category): ToolCategoryOption {
  return {
    id: category.id,
    name: category.name,
    categoryType: category.categoryType,
    status: category.status,
    displayOrder: category.displayOrder,
  };
}
