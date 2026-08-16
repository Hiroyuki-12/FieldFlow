import axios, {
  AxiosHeaders,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios';

import { apiBaseUrl } from './config';
import { toApiError } from './errors';

/**
 * API通信層からPiniaへ必要な操作だけを受け取る境界。
 * Storeを直接importしないため、Store→認証API→Axios→Storeという循環依存を避けられる。
 */
export interface AuthSessionBridge {
  getAccessToken: () => string | null;
  refreshAccessToken: () => Promise<string>;
  onSessionExpired: () => void;
}

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _authRetry?: boolean;
  keepSessionOnAuthFailure?: boolean;
}

let authSessionBridge: AuthSessionBridge | null = null;
let sessionExpirationNotified = false;
let lastObservedAccessToken: string | null = null;

export function configureAuthSessionBridge(bridge: AuthSessionBridge): void {
  authSessionBridge = bridge;
  sessionExpirationNotified = false;
  lastObservedAccessToken = null;
}

function notifySessionExpiredOnce(): void {
  if (sessionExpirationNotified) return;

  sessionExpirationNotified = true;
  authSessionBridge?.onSessionExpired();
}

// Login・Refresh・Logoutは401の自動Refresh対象にしない。再帰的なRefreshを防ぐ専用Client。
export const authHttpClient = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  headers: { Accept: 'application/json' },
});

// 業務APIとAccess Tokenが必要な認証APIは、このClientを共通利用する。
export const apiHttpClient = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  headers: { Accept: 'application/json' },
});

apiHttpClient.interceptors.request.use((config) => {
  const accessToken = authSessionBridge?.getAccessToken();
  if (accessToken) {
    // LoginやRefreshでTokenが変わったら、新しいSessionで再び失効通知できる状態へ戻す。
    if (accessToken !== lastObservedAccessToken) {
      sessionExpirationNotified = false;
      lastObservedAccessToken = accessToken;
    }
    const headers = AxiosHeaders.from(config.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    config.headers = headers;
  }
  return config;
});

apiHttpClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;

    if (error.response?.status === 401 && originalRequest?._authRetry) {
      // パスワード不一致の401はSession失効ではない。それ以外は新Tokenでも拒否されたため終了する。
      if (!originalRequest.keepSessionOnAuthFailure) {
        notifySessionExpiredOnce();
      }
      return Promise.reject(toApiError(error));
    }

    if (
      error.response?.status !== 401 ||
      !originalRequest ||
      !authSessionBridge
    ) {
      return Promise.reject(toApiError(error));
    }

    // 元リクエストは最大1回だけ再送する。新しいTokenでも401ならSession切れとして終了する。
    originalRequest._authRetry = true;

    try {
      const newAccessToken = await authSessionBridge.refreshAccessToken();
      const headers = AxiosHeaders.from(originalRequest.headers);
      headers.set('Authorization', `Bearer ${newAccessToken}`);
      originalRequest.headers = headers;
      return await apiHttpClient.request(originalRequest);
    } catch (refreshError) {
      // 同じRefresh Promiseを待つ全リクエストが失敗しても、画面遷移とStore破棄は1回にまとめる。
      notifySessionExpiredOnce();
      return Promise.reject(toApiError(refreshError));
    }
  },
);
