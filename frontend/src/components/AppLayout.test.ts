import { createPinia, setActivePinia } from 'pinia';
import { render, screen } from '@testing-library/vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '../stores/auth';
import AppLayout from './AppLayout.vue';

function createLayoutRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<p>ホーム本文</p>' } },
      {
        path: '/users',
        name: 'users',
        component: { template: '<p>ユーザー本文</p>' },
      },
      {
        path: '/password',
        name: 'password-change',
        component: { template: '<p>変更本文</p>' },
      },
      {
        path: '/login',
        name: 'login',
        component: { template: '<p>ログイン本文</p>' },
      },
    ],
  });
}

describe('AppLayout', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('管理者だけにユーザー管理ナビゲーションを表示する', async () => {
    const authStore = useAuthStore();
    authStore.applySession({
      accessToken: 'admin-token',
      expiresIn: 900,
      user: {
        id: 'admin-1',
        name: '管理者',
        loginId: 'admin01',
        role: 'ADMIN',
        mustChangePassword: false,
      },
    });
    const router = createLayoutRouter();
    await router.push('/');

    render(AppLayout, { global: { plugins: [router] } });

    expect(
      screen.getAllByRole('link', { name: 'ユーザー管理' }),
    ).not.toHaveLength(0);
  });

  it('作業者へ管理ナビゲーションを表示しない', async () => {
    const authStore = useAuthStore();
    authStore.applySession({
      accessToken: 'worker-token',
      expiresIn: 900,
      user: {
        id: 'worker-1',
        name: '作業者',
        loginId: 'worker01',
        role: 'WORKER',
        mustChangePassword: false,
      },
    });
    const router = createLayoutRouter();
    await router.push('/');

    render(AppLayout, { global: { plugins: [router] } });

    expect(
      screen.queryByRole('link', { name: 'ユーザー管理' }),
    ).not.toBeInTheDocument();
  });
});
