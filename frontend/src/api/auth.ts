import { apiHttpClient, authHttpClient } from './client';
import { toApiError } from './errors';

export type UserRole = 'ADMIN' | 'WORKER';

export interface AuthUser {
  id: string;
  name: string;
  loginId: string;
  role: UserRole;
  mustChangePassword: boolean;
}

export interface AuthSession {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
}

export interface LoginInput {
  loginId: string;
  password: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

/** 認証入口では401 Interceptorを通さず、認証失敗をそのままLogin画面へ返す。 */
export async function login(input: LoginInput): Promise<AuthSession> {
  try {
    const response = await authHttpClient.post<AuthSession>('/auth/login', input);
    return response.data;
  } catch (error) {
    throw toApiError(error);
  }
}

/** HttpOnly CookieはJavaScriptで読まず、ブラウザへ送信を任せる。 */
export async function refreshSession(): Promise<AuthSession> {
  try {
    const response = await authHttpClient.post<AuthSession>('/auth/refresh');
    return response.data;
  } catch (error) {
    throw toApiError(error);
  }
}

export async function logout(): Promise<void> {
  try {
    await authHttpClient.post('/auth/logout');
  } catch (error) {
    throw toApiError(error);
  }
}

export async function getCurrentUser(): Promise<AuthUser> {
  const response = await apiHttpClient.get<AuthUser>('/auth/me');
  return response.data;
}

export async function changePassword(input: ChangePasswordInput): Promise<void> {
  // 現在パスワード不一致も401のため、Refresh後も401ならSession切れにはせず入力エラーとして扱う。
  await apiHttpClient.patch('/auth/password', input, { keepSessionOnAuthFailure: true });
}
