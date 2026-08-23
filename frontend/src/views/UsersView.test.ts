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

  it('ダイアログを固定ヘッダー・スクロール本文・固定フッターへ分離する', async () => {
    // stickyや重ね配置へ戻り、最後の権限入力が小画面で操作ボタンに隠れる回帰を防ぐ。
    server.use(
      http.get('*/api/v1/users', () =>
        HttpResponse.json({ items: [worker], page: 1, pageSize: 20, total: 1 }),
      ),
    );

    render(UsersView);
    await screen.findAllByText('作業 太郎');
    await fireEvent.click(
      screen.getByRole('button', { name: 'ユーザーを作成' }),
    );

    const dialog = screen.getByRole('dialog');
    const shell = dialog.firstElementChild;
    const header = dialog.querySelector('header');
    const body = dialog.querySelector<HTMLElement>(
      '[data-dialog-scroll-region]',
    );
    const footer = dialog.querySelector('footer');
    const form = dialog.querySelector<HTMLFormElement>('form')!;
    const saveButton = within(dialog).getByRole('button', { name: '保存' });

    expect(shell).toHaveClass('flex', 'min-h-0', 'flex-col', 'overflow-hidden');
    expect(header).toHaveClass('shrink-0');
    expect(body).toHaveClass(
      'min-h-0',
      'flex-1',
      'overflow-x-hidden',
      'overflow-y-auto',
    );
    expect(footer).toHaveClass('shrink-0', 'app-dialog-footer');
    expect(body).not.toContainElement(footer);
    expect(dialog.querySelector('.sticky')).not.toBeInTheDocument();
    expect(saveButton).toHaveAttribute('form', form.id);

    await fireEvent.update(within(dialog).getByLabelText('名前'), ' ');
    await fireEvent.update(
      within(dialog).getByLabelText('ログインID'),
      'valid.login',
    );
    await fireEvent.click(saveButton);
    const alert = within(dialog).getByRole('alert');
    expect(body).toContainElement(alert);
    expect(footer).not.toContainElement(alert);
  });

  it('Escapeとキャンセルを維持し、閉じた後は起点へフォーカスを戻す', async () => {
    // レイアウト分離でネイティブdialogの閉じ方とキーボード操作を壊さないための回帰テスト。
    server.use(
      http.get('*/api/v1/users', () =>
        HttpResponse.json({ items: [worker], page: 1, pageSize: 20, total: 1 }),
      ),
    );

    render(UsersView);
    await screen.findAllByText('作業 太郎');
    const trigger = screen.getByRole('button', { name: 'ユーザーを作成' });
    trigger.focus();
    await fireEvent.click(trigger);

    let dialog = screen.getByRole('dialog');
    await fireEvent.keyDown(within(dialog).getByLabelText('名前'), {
      key: 'Escape',
    });
    expect(dialog).not.toHaveAttribute('open');
    expect(trigger).toHaveFocus();

    await fireEvent.click(trigger);
    dialog = screen.getByRole('dialog');
    await fireEvent.click(
      within(dialog).getByRole('button', { name: 'キャンセル' }),
    );
    expect(dialog).not.toHaveAttribute('open');
    expect(trigger).toHaveFocus();
  });

  it('保存中は操作ボタンを無効化して二重送信を防ぐ', async () => {
    // フッターをform外へ移しても、連打でユーザーが重複作成されないことを保証する。
    let createRequestCount = 0;
    let releaseRequest: (() => void) | undefined;
    const requestGate = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    server.use(
      http.get('*/api/v1/users', () =>
        HttpResponse.json({ items: [worker], page: 1, pageSize: 20, total: 1 }),
      ),
      http.post('*/api/v1/users', async () => {
        createRequestCount += 1;
        await requestGate;
        return HttpResponse.json(
          {
            ...worker,
            id: 'worker-2',
            name: '新規 利用者',
            loginId: 'new.user',
            temporaryPassword: 'TempPass23456789',
          },
          { status: 201 },
        );
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
      'new.user',
    );
    const saveButton = within(dialog).getByRole('button', { name: '保存' });

    await fireEvent.click(saveButton);
    await vi.waitFor(() => expect(createRequestCount).toBe(1));
    const savingButton = within(dialog).getByRole('button', {
      name: '保存中…',
    });
    expect(savingButton).toBeDisabled();
    expect(
      within(dialog).getByRole('button', { name: 'キャンセル' }),
    ).toBeDisabled();
    await fireEvent.click(savingButton);
    expect(createRequestCount).toBe(1);

    releaseRequest?.();
    expect(
      await within(dialog).findByText('TempPass23456789'),
    ).toBeInTheDocument();
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
    const body = dialog.querySelector<HTMLElement>(
      '[data-dialog-scroll-region]',
    );
    const footer = dialog.querySelector('footer');
    expect(body).toContainElement(within(dialog).getByText('TempPass23456789'));
    expect(footer).toContainElement(
      within(dialog).getByRole('button', { name: '閉じる' }),
    );
    expect(body).not.toContainElement(footer);
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

  it('利用停止ユーザーには共通フッターで再有効化操作を表示する', async () => {
    // 利用停止側だけ古いダイアログ構造へ戻り、操作ボタンが本文へ重なる回帰を防ぐ。
    server.use(
      http.get('*/api/v1/users', () =>
        HttpResponse.json({
          items: [{ ...worker, status: 'INACTIVE' }],
          page: 1,
          pageSize: 20,
          total: 1,
        }),
      ),
    );

    render(UsersView);
    await screen.findAllByText('作業 太郎');
    await fireEvent.click(
      screen.getAllByRole('button', { name: '再有効化' })[0]!,
    );

    const dialog = screen.getByRole('dialog');
    const body = dialog.querySelector<HTMLElement>(
      '[data-dialog-scroll-region]',
    );
    const footer = dialog.querySelector('footer');
    expect(
      within(dialog).getByRole('heading', { name: '再有効化の確認' }),
    ).toBeInTheDocument();
    expect(footer).toContainElement(
      within(dialog).getByRole('button', { name: '再有効化する' }),
    );
    expect(body).not.toContainElement(footer);
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
