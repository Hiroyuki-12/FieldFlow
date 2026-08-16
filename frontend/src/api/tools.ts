import { apiHttpClient } from './client';

export type ToolStatus = 'ACTIVE' | 'INACTIVE';
export type ToolCategoryType = 'WORK' | 'COMMON';

export interface ToolCategoryOption {
  id: string;
  name: string;
  categoryType: ToolCategoryType;
  status: ToolStatus;
  displayOrder: number;
}

export interface ManagedTool {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  categoryType: ToolCategoryType;
  categoryStatus: ToolStatus;
  stockQuantity: number;
  displayOrder: number;
  status: ToolStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ToolListResponse {
  items: ManagedTool[];
  categories: ToolCategoryOption[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ToolFilters {
  search?: string;
  categoryId?: string;
  status?: ToolStatus | '';
  page: number;
  pageSize: number;
}

export interface SaveToolInput {
  name: string;
  categoryId: string;
  stockQuantity: number;
  displayOrder: number;
}

export interface UpdateToolInput extends SaveToolInput {
  version: number;
}

/** 空の絞り込みをQueryへ含めず、ページング値だけは必ずBackendへ渡す。 */
export async function listTools(
  filters: ToolFilters,
): Promise<ToolListResponse> {
  const params = Object.fromEntries(
    Object.entries(filters).filter(
      ([, value]) => value !== undefined && value !== '',
    ),
  );
  const response = await apiHttpClient.get<ToolListResponse>('/tools', {
    params,
  });
  return response.data;
}

export async function createTool(input: SaveToolInput): Promise<ManagedTool> {
  const response = await apiHttpClient.post<ManagedTool>('/tools', input);
  return response.data;
}

export async function updateTool(
  id: string,
  input: UpdateToolInput,
): Promise<ManagedTool> {
  const response = await apiHttpClient.patch<ManagedTool>(
    '/tools/' + id,
    input,
  );
  return response.data;
}

export async function updateToolStatus(
  tool: Pick<ManagedTool, 'id' | 'version'>,
  status: ToolStatus,
): Promise<ManagedTool> {
  const response = await apiHttpClient.patch<ManagedTool>(
    '/tools/' + tool.id + '/status',
    { status, version: tool.version },
  );
  return response.data;
}
