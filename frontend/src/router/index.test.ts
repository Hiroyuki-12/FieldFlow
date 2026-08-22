import { createPinia, setActivePinia } from 'pinia';
import { render } from '@testing-library/vue';
import { createMemoryHistory } from 'vue-router';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '../stores/auth';
import { createAppRouter, sanitizeInternalRedirect } from '.';

const normalSession = {
  accessToken: 'access-token',
  expiresIn: 900,
  user: {
    id: 'worker-1',
    name: '作業 一郎',
    loginId: 'worker.one',
    role: 'WORKER' as const,
    mustChangePassword: false,
  },
};

describe('Router Guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('未認証ユーザーをLoginへ戻り先付きで案内する', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createAppRouter(pinia, createMemoryHistory());

    await router.push('/password');

    expect(router.currentRoute.value.name).toBe('login');
    expect(router.currentRoute.value.query.redirect).toBe('/password');
  });

  it('初回パスワード変更前は他の認証済み画面へ進ませない', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const authStore = useAuthStore(pinia);
    authStore.applySession({
      ...normalSession,
      user: { ...normalSession.user, mustChangePassword: true },
    });
    const router = createAppRouter(pinia, createMemoryHistory());

    await router.push('/');

    expect(router.currentRoute.value.name).toBe('initial-password-change');
  });

  it('Role不足の管理Routeは403へ案内する', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const authStore = useAuthStore(pinia);
    authStore.applySession(normalSession);
    const router = createAppRouter(pinia, createMemoryHistory());
    router.addRoute({
      path: '/admin-test',
      name: 'admin-test',
      component: { template: '<div>admin</div>' },
      meta: { requiresAuth: true, roles: ['ADMIN'] },
    });

    await router.push('/admin-test');

    expect(router.currentRoute.value.name).toBe('forbidden');
  });

  it('作業者が実際のユーザー管理Routeへ直アクセスしても403へ案内する', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const authStore = useAuthStore(pinia);
    authStore.applySession(normalSession);
    const router = createAppRouter(pinia, createMemoryHistory());

    await router.push('/users');

    expect(router.currentRoute.value.name).toBe('forbidden');
  });

  it('作業者が作業カテゴリ管理Routeへ直アクセスしても403へ案内する', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const authStore = useAuthStore(pinia);
    authStore.applySession(normalSession);
    const router = createAppRouter(pinia, createMemoryHistory());

    await router.push('/categories');

    expect(router.currentRoute.value.name).toBe('forbidden');
  });

  it('作業者も道具Routeを閲覧できる', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const authStore = useAuthStore(pinia);
    authStore.applySession(normalSession);
    const router = createAppRouter(pinia, createMemoryHistory());

    await router.push('/tools');

    expect(router.currentRoute.value.name).toBe('tools');
  });

  it('作業者も指定日の日別チェックRouteを閲覧できる', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const authStore = useAuthStore(pinia);
    authStore.applySession(normalSession);
    const router = createAppRouter(pinia, createMemoryHistory());

    await router.push('/daily-checklists/2026-08-18');

    expect(router.currentRoute.value.name).toBe('daily-checklist');
    expect(router.currentRoute.value.params.date).toBe('2026-08-18');
  });

  it('外部URL形式をログイン後の戻り先に採用しない', () => {
    expect(sanitizeInternalRedirect('/password')).toBe('/password');
    expect(sanitizeInternalRedirect('//attacker.example')).toBeNull();
    expect(sanitizeInternalRedirect('https://attacker.example')).toBeNull();
  });

  it('画面遷移後に新しい画面見出しへフォーカスを移す', async () => {
    // ルート変更後も前画面の操作位置へフォーカスが残る回帰を防ぐ。
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createAppRouter(pinia, createMemoryHistory());
    router.addRoute({
      path: '/focus-before',
      component: {
        template:
          '<h1 data-page-heading tabindex="-1">遷移前の見出し</h1>',
      },
    });
    router.addRoute({
      path: '/focus-after',
      component: {
        template:
          '<h1 data-page-heading tabindex="-1">遷移後の見出し</h1>',
      },
    });
    await router.push('/focus-before');
    render({ template: '<RouterView />' }, { global: { plugins: [pinia, router] } });

    await router.push('/focus-after');

    expect(document.activeElement).toHaveTextContent('遷移後の見出し');
  });
});
