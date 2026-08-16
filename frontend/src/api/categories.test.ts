import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '../test/server';
import {
  createCategory,
  listCategories,
  updateCategory,
  updateCategoryStatus,
} from './categories';

describe('作業カテゴリAPI', () => {
  it('空の絞り込みを除外して検索条件だけをQueryへ送る', async () => {
    server.use(
      http.get('*/api/v1/categories', ({ request }) => {
        expect(Object.fromEntries(new URL(request.url).searchParams)).toEqual({
          search: '清掃',
        });
        return HttpResponse.json({ items: [] });
      }),
    );

    await expect(
      listCategories({ search: '清掃', status: '' }),
    ).resolves.toEqual({ items: [] });
  });

  it('名前と表示順だけを作成APIへPOSTする', async () => {
    server.use(
      http.post('*/api/v1/categories', async ({ request }) => {
        expect(await request.json()).toEqual({
          name: '洗車',
          displayOrder: 20,
        });
        return HttpResponse.json(
          { id: 'category-2', name: '洗車', categoryType: 'WORK' },
          { status: 201 },
        );
      }),
    );

    await expect(
      createCategory({ name: '洗車', displayOrder: 20 }),
    ).resolves.toMatchObject({ categoryType: 'WORK' });
  });

  it('編集内容とversionをPATCHへ送る', async () => {
    server.use(
      http.patch('*/api/v1/categories/category-2', async ({ request }) => {
        expect(await request.json()).toEqual({
          name: '車両洗浄',
          displayOrder: 25,
          version: 3,
        });
        return HttpResponse.json({
          id: 'category-2',
          name: '車両洗浄',
          version: 4,
        });
      }),
    );

    await expect(
      updateCategory('category-2', {
        name: '車両洗浄',
        displayOrder: 25,
        version: 3,
      }),
    ).resolves.toMatchObject({ version: 4 });
  });

  it('状態変更で対象versionを専用URLへ送る', async () => {
    server.use(
      http.patch(
        '*/api/v1/categories/category-2/status',
        async ({ request }) => {
          expect(await request.json()).toEqual({
            status: 'INACTIVE',
            version: 4,
          });
          return HttpResponse.json({
            id: 'category-2',
            status: 'INACTIVE',
            version: 5,
          });
        },
      ),
    );

    await expect(
      updateCategoryStatus({ id: 'category-2', version: 4 }, 'INACTIVE'),
    ).resolves.toMatchObject({ status: 'INACTIVE', version: 5 });
  });
});
