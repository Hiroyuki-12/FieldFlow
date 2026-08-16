import type { UserRole } from './auth';
import { apiHttpClient } from './client';

export type UserStatus = 'ACTIVE' | 'INACTIVE';

export interface ManagedUser {
  id: string;
  name: string;
  loginId: string;
  role: UserRole;
  status: UserStatus;
  mustChangePassword: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserListResponse {
  items: ManagedUser[];
  page: number;
  pageSize: number;
  total: number;
}

export interface UserFilters {
  search?: string;
  role?: UserRole | '';
  status?: UserStatus | '';
  page?: number;
  pageSize?: number;
}

export interface SaveUserInput {
  name: string;
  loginId: string;
  role: UserRole;
}

export interface UpdateUserInput extends SaveUserInput {
  version: number;
}

export interface UserWithTemporaryPassword extends ManagedUser {
  temporaryPassword: string;
}

/** undefinedと空文字をQueryへ含めず、URLを読みやすく保つ。 */
export async function listUsers(
  filters: UserFilters,
): Promise<UserListResponse> {
  const params = Object.fromEntries(
    Object.entries(filters).filter(
      ([, value]) => value !== undefined && value !== '',
    ),
  );
  const response = await apiHttpClient.get<UserListResponse>('/users', {
    params,
  });
  return response.data;
}

export async function createUser(
  input: SaveUserInput,
): Promise<UserWithTemporaryPassword> {
  const response = await apiHttpClient.post<UserWithTemporaryPassword>(
    '/users',
    input,
  );
  return response.data;
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
): Promise<ManagedUser> {
  const response = await apiHttpClient.patch<ManagedUser>(
    `/users/${id}`,
    input,
  );
  return response.data;
}

export async function updateUserStatus(
  user: Pick<ManagedUser, 'id' | 'version'>,
  status: UserStatus,
): Promise<ManagedUser> {
  const response = await apiHttpClient.patch<ManagedUser>(
    `/users/${user.id}/status`,
    {
      status,
      version: user.version,
    },
  );
  return response.data;
}

export async function reissueTemporaryPassword(
  id: string,
): Promise<UserWithTemporaryPassword> {
  const response = await apiHttpClient.post<UserWithTemporaryPassword>(
    `/users/${id}/temporary-password`,
  );
  return response.data;
}
