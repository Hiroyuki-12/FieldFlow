import { createPinia, setActivePinia } from 'pinia';
import { fireEvent, render, screen, within } from '@testing-library/vue';
import { http, HttpResponse } from 'msw';
import type { Pinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../stores/auth';
import { server } from '../test/server';
import ToolsView from './ToolsView.vue';

const cleaningCategory = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '清掃',
  categoryType: 'WORK' as const,
  status: 'ACTIVE' as const,
  displayOrder: 10,
};

const inactiveCategory = {
  ...cleaningCategory,
  id: '22222222-2222-4222-8222-222222222222',
  name: '設備点検',
  status: 'INACTIVE' as const,
  displayOrder: 20,
};

const managedTool = {
  id: 'tool-1',
  name: 'モップ',
  categoryId: cleaningCategory.id,
  categoryName: cleaningCategory.name,
  categoryType: cleaningCategory.categoryType,
  categoryStatus: cleaningCategory.status,
  stockQuantity: 2,
  displayOrder: 10,
  status: 'ACTIVE' as const,
  version: 1,
  createdAt: '2026-08-16T00:00:00.000Z',
  updatedAt: '2026-08-16T00:00:00.000Z',
};

function listResponse(overrides: Record<string, unknown> = {}) {
  return {
    items: [managedTool],
    categories: [cleaningCategory, inactiveCategory],
    page: 1,
    pageSize: 20,
    total: 1,
    ...overrides,
  };
}

function renderView(role: 'ADMIN' | 'WORKER'): Pinia {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore(pinia).applySession({
    accessToken: role.toLowerCase() + '-token',
    expiresIn: 900,
    user: {
      id: role.toLowerCase() + '-1',
      name: role === 'ADMIN' ? '管理者' : '作業者',
      loginId: role.toLowerCase() + '01',
      role,
      mustChangePassword: false,
    },
  });
  render(ToolsView, { global: { plugins: [pinia] } });
  return pinia;
}

describe('ToolsView', () => {
  it('全ユーザー向け一覧を表示し、検索・カテゴリ・状態をAPIへ送る', async () => {
    const requests: Record<string, string>[] = [];
    server.use(
      http.get('*/api/v1/tools', ({ request }) => {
        requests.push(Object.fromEntries(new URL(request.url).searchParams));
        return HttpResponse.json(listResponse());
      }),
    );

    renderView('WORKER');
    expect(
      await screen.findByRole('heading', { name: 'モップ' }),
    ).toBeInTheDocument();
    expect(screen.getByText('保有数')).toBeInTheDocument();
    await fireEvent.update(screen.getByLabelText('道具名'), 'モップ');
    await fireEvent.update(
      screen.getByLabelText('作業カテゴリ', { selector: 'select' }),
      cleaningCategory.id,
    );
    await fireEvent.update(screen.getByLabelText('状態'), 'ACTIVE');
    await fireEvent.click(screen.getByRole('button', { name: '検索' }));

    await vi.waitFor(() =>
      expect(requests).toEqual([
        { page: '1', pageSize: '20' },
        {
          search: 'モップ',
          categoryId: cleaningCategory.id,
          status: 'ACTIVE',
          page: '1',
          pageSize: '20',
        },
      ]),
    );
  });

  it('作業者には作成・編集・状態変更操作を表示しない', async () => {
    server.use(
      http.get('*/api/v1/tools', () => HttpResponse.json(listResponse())),
    );

    renderView('WORKER');
    await screen.findByRole('heading', { name: 'モップ' });

    expect(
      screen.queryByRole('button', { name: '道具を作成' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '編集' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '利用停止' }),
    ).not.toBeInTheDocument();
  });

  it('管理者が入力を正規化して作成し、一覧を再取得する', async () => {
    let getCount = 0;
    server.use(
      http.get('*/api/v1/tools', () => {
        getCount += 1;
        return HttpResponse.json(listResponse());
      }),
      http.post('*/api/v1/tools', async ({ request }) => {
        expect(await request.json()).toEqual({
          name: '脚立',
          categoryId: cleaningCategory.id,
          stockQuantity: 3,
          displayOrder: 20,
        });
        return HttpResponse.json(
          { ...managedTool, id: 'tool-2', name: '脚立' },
          { status: 201 },
        );
      }),
    );

    renderView('ADMIN');
    await screen.findByRole('heading', { name: 'モップ' });
    await fireEvent.click(screen.getByRole('button', { name: '道具を作成' }));
    const dialog = screen.getByRole('dialog');
    await fireEvent.update(within(dialog).getByLabelText('名前'), '  脚立  ');
    await fireEvent.update(within(dialog).getByLabelText('保有数'), '3');
    await fireEvent.update(within(dialog).getByLabelText('表示順'), '20');
    await fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(await screen.findByText('脚立を作成しました。')).toBeInTheDocument();
    await vi.waitFor(() => expect(getCount).toBe(2));
  });

  it('利用停止中カテゴリを管理フォームで選択不可にする', async () => {
    server.use(
      http.get('*/api/v1/tools', () => HttpResponse.json(listResponse())),
    );

    renderView('ADMIN');
    await screen.findByRole('heading', { name: 'モップ' });
    await fireEvent.click(screen.getByRole('button', { name: '道具を作成' }));
    const dialog = screen.getByRole('dialog');

    expect(
      within(dialog).getByRole('option', { name: '設備点検（停止中）' }),
    ).toBeDisabled();
  });

  it('名称重複エラーを次の対応が分かる説明へ変換する', async () => {
    server.use(
      http.get('*/api/v1/tools', () => HttpResponse.json(listResponse())),
      http.post('*/api/v1/tools', () =>
        HttpResponse.json(
          {
            statusCode: 409,
            code: 'TOOL_NAME_DUPLICATED',
            message: 'conflict',
          },
          { status: 409 },
        ),
      ),
    );

    renderView('ADMIN');
    await screen.findByRole('heading', { name: 'モップ' });
    await fireEvent.click(screen.getByRole('button', { name: '道具を作成' }));
    const dialog = screen.getByRole('dialog');
    await fireEvent.update(within(dialog).getByLabelText('名前'), 'モップ');
    await fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(
      await within(dialog).findByText(
        '同じ名前の道具が既に存在します。別の名前を入力してください。',
      ),
    ).toBeInTheDocument();
  });
});
