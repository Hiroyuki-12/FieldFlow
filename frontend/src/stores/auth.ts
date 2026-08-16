import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import {
  changePassword as changePasswordRequest,
  login as loginRequest,
  logout as logoutRequest,
  refreshSession as refreshSessionRequest,
  type AuthSession,
  type AuthUser,
  type ChangePasswordInput,
  type LoginInput,
} from '../api/auth';

export type AuthStatus = 'checking' | 'anonymous' | 'authenticated';

/**
 * 認証状態は画面をまたいで使うためPiniaへ集約する。
 * Access Tokenはこのメモリ上のrefだけに置き、永続Storageへは保存しない。
 */
export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null);
  const user = ref<AuthUser | null>(null);
  const status = ref<AuthStatus>('checking');

  // 同時に複数APIが401になっても、全呼び出しが同じPromiseを待つことでRefreshを1回にする。
  let refreshPromise: Promise<string> | null = null;

  const isAuthenticated = computed(
    () => status.value === 'authenticated' && accessToken.value !== null && user.value !== null,
  );

  function applySession(session: AuthSession): void {
    accessToken.value = session.accessToken;
    user.value = session.user;
    status.value = 'authenticated';
  }

  function clearSession(): void {
    accessToken.value = null;
    user.value = null;
    status.value = 'anonymous';
  }

  async function login(input: LoginInput): Promise<AuthUser> {
    const session = await loginRequest(input);
    applySession(session);
    return session.user;
  }

  async function refreshAccessToken(): Promise<string> {
    if (refreshPromise) {
      return refreshPromise;
    }

    refreshPromise = (async () => {
      const session = await refreshSessionRequest();
      applySession(session);
      return session.accessToken;
    })().finally(() => {
      refreshPromise = null;
    });

    return refreshPromise;
  }

  async function restoreSession(): Promise<void> {
    status.value = 'checking';
    try {
      await refreshAccessToken();
    } catch {
      // Cookieがない初回アクセスの401は異常表示にせず、通常の未ログイン状態として扱う。
      clearSession();
    }
  }

  async function logout(): Promise<void> {
    try {
      await logoutRequest();
    } finally {
      // 通信失敗時も画面側のTokenを残さず、この端末からの操作継続を止める。
      clearSession();
    }
  }

  async function changePassword(input: ChangePasswordInput): Promise<void> {
    await changePasswordRequest(input);
    // Backendが全Sessionを失効するため、成功後はFrontendも必ず再ログイン状態へ戻す。
    clearSession();
  }

  return {
    accessToken,
    user,
    status,
    isAuthenticated,
    applySession,
    clearSession,
    login,
    refreshAccessToken,
    restoreSession,
    logout,
    changePassword,
  };
});
