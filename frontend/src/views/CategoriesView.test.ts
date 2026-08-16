import { fireEvent, render, screen, within } from '@testing-library/vue';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { server } from '../test/server';
import CategoriesView from './CategoriesView.vue';

const commonCategory = {
  id: 'common-1',
  name: '共通',
  displayOrder: 0,
  categoryType: 'COMMON' as const,
  status: 'ACTIVE' as const,
  version: 1,
  createdAt: '2026-08-16T00:00:00.000Z',
  updatedAt: '2026-08-16T00:00:00.000Z',
};

const workCategory = {
  ...commonCategory,
  id: 'work-1',
  name: '清掃',
  displayOrder: 10,
  categoryType: 'WORK' as const,
};

describe('CategoriesView', () => {
  it('カード一覧を表示し、名前と状態の検索条件をAPIへ送る', async () => {
    const requests: Record<string, string>[] = [];
    server.use(
      http.get('*/api/v1/categories', ({ request }) => {
        requests.push(Object.fromEntries(new URL(request.url).searchParams));
        return HttpResponse.json({
          items: [commonCategory, workCategory],
        });
      }),
    );

    render(CategoriesView);
    expect(await screen.findByText('AUTO INCLUDE')).toBeInTheDocument();
    await fireEvent.update(screen.getByLabelText('作業カテゴリ名'), '清掃');
    await fireEvent.update(screen.getByLabelText('状態'), 'ACTIVE');
    await fireEvent.click(screen.getByRole('button', { name: '検索' }));

    await vi.waitFor(() =>
      expect(requests).toEqual([{}, { search: '清掃', status: 'ACTIVE' }]),
    );
  });

  it('作成入力を正規化して保存し、一覧を再取得する', async () => {
    let getCount = 0;
    server.use(
      http.get('*/api/v1/categories', () => {
        getCount += 1;
        return HttpResponse.json({ items: [workCategory] });
      }),
      http.post('*/api/v1/categories', async ({ request }) => {
        expect(await request.json()).toEqual({
          name: '洗車',
          displayOrder: 20,
        });
        return HttpResponse.json(
          {
            ...workCategory,
            id: 'work-2',
            name: '洗車',
            displayOrder: 20,
          },
          { status: 201 },
        );
      }),
    );

    render(CategoriesView);
    await screen.findByText('清掃');
    await fireEvent.click(
      screen.getByRole('button', { name: '作業カテゴリを作成' }),
    );
    const dialog = screen.getByRole('dialog');
    await fireEvent.update(within(dialog).getByLabelText('名前'), '  洗車  ');
    await fireEvent.update(within(dialog).getByLabelText('表示順'), '20');
    await fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(await screen.findByText('洗車を作成しました。')).toBeInTheDocument();
    await vi.waitFor(() => expect(getCount).toBe(2));
  });

  it('COMMONの用途を説明し、名前入力と利用停止操作を保護する', async () => {
    server.use(
      http.get('*/api/v1/categories', () =>
        HttpResponse.json({ items: [commonCategory] }),
      ),
    );

    render(CategoriesView);
    expect(
      await screen.findByText(
        '有効な道具をすべての日別チェックへ自動追加する特別なカテゴリです。名前変更と利用停止はできません。',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '利用停止' }),
    ).not.toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: '編集' }));

    expect(screen.getByLabelText('名前')).toBeDisabled();
    expect(
      screen.getByText(
        '共通カテゴリの名前は変更できません。表示順だけ変更できます。',
      ),
    ).toBeInTheDocument();
  });

  it('使用中エラーを次の対応が分かる説明へ変換する', async () => {
    server.use(
      http.get('*/api/v1/categories', () =>
        HttpResponse.json({ items: [workCategory] }),
      ),
      http.patch('*/api/v1/categories/work-1/status', () =>
        HttpResponse.json(
          {
            statusCode: 409,
            code: 'CATEGORY_IN_USE',
            message: 'conflict',
          },
          { status: 409 },
        ),
      ),
    );

    render(CategoriesView);
    await screen.findByText('清掃');
    await fireEvent.click(screen.getByRole('button', { name: '利用停止' }));
    expect(
      screen.getByText(
        '利用中の道具が紐づいている場合は停止できません。過去の日別チェックの記録は削除されません。',
      ),
    ).toBeInTheDocument();
    await fireEvent.click(
      screen.getByRole('button', { name: '利用停止する' }),
    );

    expect(
      await screen.findByText(
        '利用中の道具があるため停止できません。先に対象の道具を利用停止してください。',
      ),
    ).toBeInTheDocument();
  });
});
