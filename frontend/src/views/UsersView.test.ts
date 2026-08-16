import { createPinia, setActivePinia } from 'pinia';
import { fireEvent, render, screen, within } from '@testing-library/vue';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { configureAuthSessionBridge } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { server } from '../test/server';
import UsersView from './UsersView.vue';

const admin = {
  id: 'admin-1',
  name: '管理者',
  loginId: 'admin01',
  role: 'ADMIN' as const,
  mustChangePassword: false,
};

const worker = {
  id: 'worker-1',
  name: '作業 太郎',
  loginId: 'worker01',
  role: 'WORKER' as const,
  status: 'ACTIVE' as const,
  mustChangePassword: false,
  version: 1,
  createdAt: '2026-08-16T00:00:00.000Z',
  updatedAt: '2026-08-16T00:00:00.000Z',
};

describe('UsersView', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    const pinia = createPinia();
    setActivePinia(pinia);
    const authStore = useAuthStore();
    authStore.applySession({
      accessToken: 'admin-token',
      expiresIn: 900,
      user: admin,
    });
    configureAuthSessionBridge({
      getAccessToken: () => authStore.accessToken,
      refreshAccessToken: () => authStore.refreshAccessToken(),
      onSessionExpired: () => authStore.clearSession(),
    });
  });

  it('一覧を表示し、検索条件をAPIへ送る', async () => {
    let requestedSearch = '';
    server.use(
      http.get('*/api/v1/users', ({ request }) => {
        requestedSearch = new URL(request.url).searchParams.get('search') ?? '';
        return HttpResponse.json({
          items: [worker],
          page: 1,
          pageSize: 20,
          total: 1,
        });
      }),
    );

    render(UsersView);
    expect(await screen.findAllByText('作業 太郎')).not.toHaveLength(0);
    await fireEvent.update(screen.getByLabelText('名前・ログインID'), 'worker');
    await fireEvent.click(screen.getByRole('button', { name: '検索' }));

    await vi.waitFor(() => expect(requestedSearch).toBe('worker'));
  });

  it('ユーザー作成後だけ仮パスワードと共有上の注意を表示する', async () => {
    let users = [worker];
    server.use(
      http.get('*/api/v1/users', () =>
        HttpResponse.json({
          items: users,
          page: 1,
          pageSize: 20,
          total: users.length,
        }),
      ),
      http.post('*/api/v1/users', async ({ request }) => {
        expect(await request.json()).toEqual({
          name: '新規 利用者',
          loginId: 'new.user',
          role: 'WORKER',
        });
        const created = {
          ...worker,
          id: 'worker-2',
          name: '新規 利用者',
          loginId: 'new.user',
          temporaryPassword: 'TempPass23456789',
        };
        users = [...users, created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    render(UsersView);
    await screen.findAllByText('作業 太郎');
    await fireEvent.click(
      screen.getByRole('button', { name: 'ユーザーを作成' }),
    );
    const dialog = screen.getByRole('dialog');
    await fireEvent.update(
      within(dialog).getByLabelText('名前'),
      '新規 利用者',
    );
    await fireEvent.update(
      within(dialog).getByLabelText('ログインID'),
      'NEW.USER',
    );
    await fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(
      await within(dialog).findByText('TempPass23456789'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'この画面を閉じると再表示できません。安全な方法で本人へ伝えてください。',
      ),
    ).toBeInTheDocument();
    expect(localStorage).toHaveLength(0);
  });

  it('業務エラーコードを利用者向けの説明へ変換する', async () => {
    server.use(
      http.get('*/api/v1/users', () =>
        HttpResponse.json({ items: [worker], page: 1, pageSize: 20, total: 1 }),
      ),
      http.patch('*/api/v1/users/worker-1/status', () =>
        HttpResponse.json(
          {
            statusCode: 409,
            code: 'LAST_ACTIVE_ADMIN_REQUIRED',
            message: 'conflict',
          },
          { status: 409 },
        ),
      ),
    );

    render(UsersView);
    await screen.findAllByText('作業 太郎');
    await fireEvent.click(
      screen.getAllByRole('button', { name: '利用停止' })[0]!,
    );
    expect(
      screen.getByText(
        '利用停止すると、すべての端末で操作できなくなり、再有効化するまでログインできません。過去の記録は削除されません。',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Access Token|Refresh Session/),
    ).not.toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: '利用停止する' }));

    expect(
      await screen.findByText('最後の有効な管理者は停止・降格できません。'),
    ).toBeInTheDocument();
  });

  it('次のページへ移動し、ページ番号をAPIへ送る', async () => {
    const requestedPages: string[] = [];
    server.use(
      http.get('*/api/v1/users', ({ request }) => {
        const requestedPage =
          new URL(request.url).searchParams.get('page') ?? '';
        requestedPages.push(requestedPage);
        return HttpResponse.json({
          items: [{ ...worker, id: `worker-${requestedPage}` }],
          page: Number(requestedPage),
          pageSize: 20,
          total: 21,
        });
      }),
    );

    render(UsersView);
    await screen.findByText('1 / 2');
    await fireEvent.click(screen.getByRole('button', { name: '次へ' }));

    await vi.waitFor(() => expect(requestedPages).toEqual(['1', '2']));
    expect(await screen.findByText('2 / 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '次へ' })).toBeDisabled();
  });

  it('仮パスワード再発行の影響を内部用語なしで説明する', async () => {
    server.use(
      http.get('*/api/v1/users', () =>
        HttpResponse.json({ items: [worker], page: 1, pageSize: 20, total: 1 }),
      ),
    );

    render(UsersView);
    await screen.findAllByText('作業 太郎');
    await fireEvent.click(
      screen.getAllByRole('button', { name: '仮パスワード再発行' })[0]!,
    );

    expect(
      screen.getByText(
        '現在のパスワードではログインできなくなり、すべての端末からログアウトされます。',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Session/)).not.toBeInTheDocument();
  });
});
