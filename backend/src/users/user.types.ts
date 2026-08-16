import { RecordStatus, User, UserRole } from '../database/entities';

/** 管理画面へ公開してよいユーザー情報。認証用の内部列は含めない。 */
export interface UserResponse {
  id: string;
  name: string;
  loginId: string;
  role: UserRole;
  status: RecordStatus;
  mustChangePassword: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserListResponse {
  items: UserResponse[];
  page: number;
  pageSize: number;
  total: number;
}

/** 平文の仮パスワードは作成・再発行直後のレスポンスだけへ追加する。 */
export interface UserWithTemporaryPasswordResponse extends UserResponse {
  temporaryPassword: string;
}

export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    name: user.name,
    loginId: user.loginId,
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    version: user.version,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
