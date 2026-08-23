import { createPinia, setActivePinia } from 'pinia';
import { fireEvent, render, screen } from '@testing-library/vue';
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
        path: '/daily-checklists/:date',
        name: 'daily-checklist',
        component: { template: '<p>日別チェック本文</p>' },
      },
      {
        path: '/tools',
        name: 'tools',
        component: { template: '<p>道具本文</p>' },
      },
      {
        path: '/categories',
        name: 'categories',
        component: { template: '<p>カテゴリ本文</p>' },
      },
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

  it('管理者だけに管理ナビゲーションを表示する', async () => {
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
    expect(
      screen.getAllByRole('link', { name: '作業カテゴリ管理' }),
    ).not.toHaveLength(0);
    expect(screen.getAllByRole('link', { name: '道具管理' })).not.toHaveLength(
      0,
    );
    expect(
      screen.getAllByRole('link', { name: '日別チェック' }),
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
    expect(
      screen.queryByRole('link', { name: '作業カテゴリ管理' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '道具管理' })).not.toHaveLength(
      0,
    );
    expect(
      screen.getAllByRole('link', { name: '日別チェック' }),
    ).not.toHaveLength(0);
  });

  it('モバイルメニューは初期フォーカスを移し、Escで起点へ戻す', async () => {
    // メニューを閉じたあとキーボード利用者が操作位置を見失う回帰を防ぐ。
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

    const menuButton = screen.getByRole('button', { name: 'メニューを開く' });
    menuButton.focus();
    await fireEvent.click(menuButton);

    const mobileNavigation = document.querySelector('#mobile-navigation');
    expect(mobileNavigation).toBeInTheDocument();
    expect(mobileNavigation?.querySelector('a')).toHaveFocus();

    await fireEvent.keyDown(mobileNavigation as HTMLElement, { key: 'Escape' });
    expect(screen.queryByLabelText('モバイルナビゲーション')).not.toBeInTheDocument();
    expect(menuButton).toHaveFocus();
  });

  it('xl未満をハンバーガーへ統一し、sm未満のユーザー情報をメニューへ移す', async () => {
    // 中間幅で管理者ナビゲーションが折り返し、ヘッダーが二段になる回帰を防ぐ。
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

    const desktopNavigation = screen.getByRole('navigation', {
      name: 'メインナビゲーション',
    });
    const menuButton = screen.getByRole('button', { name: 'メニューを開く' });
    const accountMenu = screen.getByRole('navigation', {
      name: 'アカウントメニュー',
    });

    expect(desktopNavigation).toHaveClass('xl:flex');
    expect(desktopNavigation).toHaveClass('flex-nowrap', 'whitespace-nowrap');
    expect(desktopNavigation).not.toHaveClass('md:flex');
    expect(accountMenu.closest('aside')).toHaveClass('xl:block');
    expect(accountMenu.closest('aside')).not.toHaveClass('md:block');
    expect(menuButton).toHaveClass('ml-auto', 'sm:ml-0', 'xl:hidden');

    await fireEvent.click(menuButton);
    expect(screen.getByLabelText('モバイルナビゲーション')).toHaveClass(
      'xl:hidden',
    );
    expect(screen.getByLabelText('メニュー内のユーザー情報')).toHaveClass(
      'sm:hidden',
    );
  });

  it('現在のナビゲーション項目をaria-currentで示す', async () => {
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
    await router.push('/tools');
    render(AppLayout, { global: { plugins: [router] } });

    expect(
      screen
        .getAllByRole('link', { name: '道具管理' })
        .some((link) => link.getAttribute('aria-current') === 'page'),
    ).toBe(true);
  });
});
