import { createPinia, setActivePinia } from 'pinia';
import { fireEvent, render, screen, within } from '@testing-library/vue';
import { nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../stores/auth';
import AppLayout from './AppLayout.vue';

type UserRole = 'ADMIN' | 'WORKER';

function createLayoutRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        name: 'home',
        component: {
          template: '<h1 data-page-heading tabindex="-1">ホーム本文</h1>',
        },
      },
      {
        path: '/daily-checklists/:date',
        name: 'daily-checklist',
        component: {
          template: '<h1 data-page-heading tabindex="-1">日別チェック本文</h1>',
        },
      },
      {
        path: '/tools',
        name: 'tools',
        component: {
          template: '<h1 data-page-heading tabindex="-1">道具本文</h1>',
        },
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

  router.afterEach(async () => {
    await nextTick();
    document.querySelector<HTMLElement>('[data-page-heading]')?.focus();
  });
  return router;
}

async function renderLayout(
  role: UserRole = 'ADMIN',
  path = '/',
  name = role === 'ADMIN' ? '管理者' : '作業者',
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const authStore = useAuthStore(pinia);
  authStore.applySession({
    accessToken: `${role.toLowerCase()}-token`,
    expiresIn: 900,
    user: {
      id: `${role.toLowerCase()}-1`,
      name,
      loginId: `${role.toLowerCase()}01`,
      role,
      mustChangePassword: false,
    },
  });
  const router = createLayoutRouter();
  await router.push(path);
  render(AppLayout, { global: { plugins: [pinia, router] } });
  return { authStore, router };
}

function accountButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /アカウントメニューを開く/ });
}

describe('AppLayout', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('左サイドバーを置かず、デスクトップの主要ナビゲーションをヘッダーに集約する', async () => {
    // 同じリンクが二重表示され、一覧画面の横幅まで狭くなる回帰を防ぐ。
    await renderLayout('ADMIN');

    const navigation = screen.getByRole('navigation', {
      name: 'メインナビゲーション',
    });
    expect(document.querySelector('aside')).not.toBeInTheDocument();
    expect(navigation).toHaveClass(
      'xl:flex',
      'flex-nowrap',
      'whitespace-nowrap',
    );
    for (const linkName of ['ホーム', '日別チェック', '道具管理']) {
      expect(
        within(navigation).getByRole('link', { name: linkName }),
      ).toBeInTheDocument();
    }
    expect(document.querySelector('#main-content')).toHaveClass(
      'mx-auto',
      'w-full',
      'max-w-7xl',
    );
  });

  it('管理者にだけカテゴリ管理とユーザー管理を表示する', async () => {
    // 権限のない作業者を、利用できない管理画面へ誘導する回帰を防ぐ。
    await renderLayout('ADMIN');
    const navigation = screen.getByRole('navigation', {
      name: 'メインナビゲーション',
    });
    expect(
      within(navigation).getByRole('link', { name: '作業カテゴリ管理' }),
    ).toBeInTheDocument();
    expect(
      within(navigation).getByRole('link', { name: 'ユーザー管理' }),
    ).toBeInTheDocument();
  });

  it('作業者には管理者専用リンクを表示しない', async () => {
    await renderLayout('WORKER');

    expect(
      screen.queryByRole('link', { name: '作業カテゴリ管理' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'ユーザー管理' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '道具管理' })).toBeInTheDocument();

    await fireEvent.click(
      screen.getByRole('button', { name: 'メニューを開く' }),
    );
    const mobileNavigation = screen.getByRole('navigation', {
      name: 'モバイルナビゲーション',
    });
    expect(
      within(mobileNavigation).queryByRole('link', {
        name: '作業カテゴリ管理',
      }),
    ).not.toBeInTheDocument();
    expect(
      within(mobileNavigation).queryByRole('link', { name: 'ユーザー管理' }),
    ).not.toBeInTheDocument();
  });

  it('現在ページをaria-currentで示し、ロゴからホームへ戻れる', async () => {
    // 色を認識できない利用者にも現在地を伝えられる状態を固定する。
    const { router } = await renderLayout('WORKER', '/tools');
    expect(screen.getByRole('link', { name: '道具管理' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await fireEvent.click(screen.getByRole('link', { name: 'FieldFlow' }));
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('home'));
  });

  it('ユーザー情報ボタンからアカウント操作を開き、先頭項目へフォーカスする', async () => {
    // 標準buttonを使い、開いた後の操作位置をキーボード利用者へ明確にする。
    await renderLayout('ADMIN');
    const trigger = accountButton();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute(
      'aria-controls',
      'desktop-account-navigation',
    );

    await fireEvent.click(trigger);

    const accountNavigation = screen.getByRole('navigation', {
      name: 'アカウント操作',
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(
      within(accountNavigation).getByRole('link', { name: 'パスワード変更' }),
    ).toHaveFocus();
    expect(
      within(accountNavigation).getByRole('button', { name: 'ログアウト' }),
    ).toBeInTheDocument();
    expect(accountNavigation).toHaveClass('right-0', 'z-50');
  });

  it('アカウント操作はEscapeで閉じ、ユーザー情報ボタンへフォーカスを戻す', async () => {
    // メニューを閉じた後にキーボード操作の起点を見失う回帰を防ぐ。
    await renderLayout('ADMIN');
    const trigger = accountButton();
    trigger.focus();
    await fireEvent.click(trigger);

    await fireEvent.keyDown(
      screen.getByRole('navigation', { name: 'アカウント操作' }),
      { key: 'Escape' },
    );
    expect(
      screen.queryByRole('navigation', { name: 'アカウント操作' }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('アカウント操作は外側クリックとルート変更で閉じる', async () => {
    // 別の場所を操作した後もメニューだけが残り、本文を覆う回帰を防ぐ。
    const { router } = await renderLayout('ADMIN');
    await fireEvent.click(accountButton());
    await fireEvent.pointerDown(document.body);
    expect(
      screen.queryByRole('navigation', { name: 'アカウント操作' }),
    ).not.toBeInTheDocument();

    await fireEvent.click(accountButton());
    await router.push('/tools');
    expect(
      screen.queryByRole('navigation', { name: 'アカウント操作' }),
    ).not.toBeInTheDocument();
  });

  it('アカウント項目の選択後に閉じ、パスワード変更へ移動する', async () => {
    const { router } = await renderLayout('ADMIN');
    await fireEvent.click(accountButton());
    await fireEvent.click(screen.getByRole('link', { name: 'パスワード変更' }));

    await vi.waitFor(() =>
      expect(router.currentRoute.value.name).toBe('password-change'),
    );
    expect(
      screen.queryByRole('navigation', { name: 'アカウント操作' }),
    ).not.toBeInTheDocument();
  });

  it('ログアウトを一度だけ実行し、成功後はログイン画面へ移動する', async () => {
    // 連打によるログアウトAPIの二重実行と、成功時の遷移回帰を防ぐ。
    const { authStore, router } = await renderLayout('ADMIN');
    const logout = vi.spyOn(authStore, 'logout').mockResolvedValue();
    await fireEvent.click(accountButton());
    const logoutButton = screen.getByRole('button', { name: 'ログアウト' });
    await Promise.all([
      fireEvent.click(logoutButton),
      fireEvent.click(logoutButton),
    ]);

    expect(logout).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(router.currentRoute.value.name).toBe('login'),
    );
    expect(router.currentRoute.value.query.loggedOut).toBe('true');
  });

  it('ログアウト失敗時も既存の未完了通知付きログイン遷移を維持する', async () => {
    // 通信失敗を成功扱いして利用者へ隠す回帰を防ぐ。
    const { authStore, router } = await renderLayout('ADMIN');
    vi.spyOn(authStore, 'logout').mockRejectedValue(new Error('network error'));
    await fireEvent.click(accountButton());
    await fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }));

    await vi.waitFor(() =>
      expect(router.currentRoute.value.name).toBe('login'),
    );
    expect(router.currentRoute.value.query.logoutIncomplete).toBe('true');
  });

  it('モバイルメニューにユーザー情報と必要な操作をまとめ、Escで起点へ戻す', async () => {
    // 狭い画面でも主要操作が欠けず、デスクトップ操作と二重表示されない構造を固定する。
    await renderLayout('ADMIN');
    const menuButton = screen.getByRole('button', { name: 'メニューを開く' });
    expect(menuButton).toHaveClass('xl:hidden', 'ml-auto');
    menuButton.focus();
    await fireEvent.click(menuButton);

    const navigation = screen.getByRole('navigation', {
      name: 'モバイルナビゲーション',
    });
    expect(navigation).toHaveClass('xl:hidden');
    expect(
      within(navigation).getByLabelText('メニュー内のユーザー情報'),
    ).toBeVisible();
    for (const linkName of [
      'ホーム',
      '日別チェック',
      '道具管理',
      '作業カテゴリ管理',
      'ユーザー管理',
      'パスワード変更',
    ]) {
      expect(
        within(navigation).getByRole('link', { name: linkName }),
      ).toBeInTheDocument();
    }
    expect(
      within(navigation).getByRole('button', { name: 'ログアウト' }),
    ).toBeInTheDocument();
    expect(navigation.querySelector('a')).toHaveFocus();

    await fireEvent.keyDown(navigation, { key: 'Escape' });
    expect(
      screen.queryByLabelText('モバイルナビゲーション'),
    ).not.toBeInTheDocument();
    expect(menuButton).toHaveFocus();
  });

  it('スキップリンク、main-content、ページ遷移後の見出しフォーカスを維持する', async () => {
    // キーボードやスクリーンリーダー利用者が本文へ移動し、遷移を認識できる状態を守る。
    const { router } = await renderLayout('WORKER');
    expect(screen.getByRole('link', { name: '本文へ移動' })).toHaveAttribute(
      'href',
      '#main-content',
    );
    expect(document.querySelector('#main-content')).toBeInTheDocument();

    await router.push('/tools');
    await vi.waitFor(() =>
      expect(screen.getByRole('heading', { name: '道具本文' })).toHaveFocus(),
    );
  });
});
