import { createPinia, setActivePinia } from 'pinia';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../stores/auth';
import { server } from '../test/server';
import { apiHttpClient, configureAuthSessionBridge } from './client';

const user = {
  id: 'user-1',
  name: '認証 太郎',
  loginId: 'auth.user',
  role: 'WORKER' as const,
  mustChangePassword: false,
};

function session(accessToken: string) {
  return { accessToken, expiresIn: 900, user };
}

describe('認証StoreとAxios Client', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    sessionStorage.clear();
  });

  it('ログイン結果をメモリだけに保持する', async () => {
    server.use(
      http.post('*/api/v1/auth/login', async ({ request }) => {
        expect(await request.json()).toEqual({ loginId: 'auth.user', password: 'temporary-pass' });
        return HttpResponse.json(session('login-token'));
      }),
    );

    const authStore = useAuthStore();
    await authStore.login({ loginId: 'auth.user', password: 'temporary-pass' });

    expect(authStore.accessToken).toBe('login-token');
    expect(authStore.user).toEqual(user);
    expect(authStore.isAuthenticated).toBe(true);
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
  });

  it('起動時にHttpOnly Cookie前提のRefreshでSessionを復元する', async () => {
    server.use(
      http.post('*/api/v1/auth/refresh', () => HttpResponse.json(session('restored-token'))),
    );

    const authStore = useAuthStore();
    await authStore.restoreSession();

    expect(authStore.status).toBe('authenticated');
    expect(authStore.accessToken).toBe('restored-token');
  });

  it('複数の401が同時発生してもRefreshを1回だけ行い、新Tokenで各APIを再試行する', async () => {
    let refreshCount = 0;
    let protectedRequestCount = 0;

    server.use(
      http.post('*/api/v1/auth/refresh', async () => {
        refreshCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return HttpResponse.json(session('new-token'));
      }),
      http.get('*/api/v1/protected/:id', ({ request, params }) => {
        protectedRequestCount += 1;
        if (request.headers.get('authorization') !== 'Bearer new-token') {
          return new HttpResponse(null, { status: 401 });
        }
        return HttpResponse.json({ id: params.id });
      }),
    );

    const authStore = useAuthStore();
    authStore.applySession(session('expired-token'));
    const onSessionExpired = vi.fn();
    configureAuthSessionBridge({
      getAccessToken: () => authStore.accessToken,
      refreshAccessToken: () => authStore.refreshAccessToken(),
      onSessionExpired,
    });

    const [first, second] = await Promise.all([
      apiHttpClient.get('/protected/one'),
      apiHttpClient.get('/protected/two'),
    ]);

    expect(first.data).toEqual({ id: 'one' });
    expect(second.data).toEqual({ id: 'two' });
    expect(refreshCount).toBe(1);
    expect(protectedRequestCount).toBe(4);
    expect(authStore.accessToken).toBe('new-token');
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('同時Refresh失敗時も認証情報を破棄し、Session切れを1回だけ通知する', async () => {
    server.use(
      http.get('*/api/v1/protected/:id', () => new HttpResponse(null, { status: 401 })),
      http.post('*/api/v1/auth/refresh', async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return new HttpResponse(null, { status: 401 });
      }),
    );

    const authStore = useAuthStore();
    authStore.applySession(session('expired-token'));
    const onSessionExpired = vi.fn(() => authStore.clearSession());
    configureAuthSessionBridge({
      getAccessToken: () => authStore.accessToken,
      refreshAccessToken: () => authStore.refreshAccessToken(),
      onSessionExpired,
    });

    const results = await Promise.allSettled([
      apiHttpClient.get('/protected/one'),
      apiHttpClient.get('/protected/two'),
    ]);

    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(authStore.isAuthenticated).toBe(false);
    expect(authStore.accessToken).toBeNull();
  });
});
