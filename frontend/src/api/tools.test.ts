import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '../test/server';
import { createTool, listTools, updateTool, updateToolStatus } from './tools';

describe('道具API', () => {
  it('空の絞り込みを除外しページング条件をQueryへ送る', async () => {
    server.use(
      http.get('*/api/v1/tools', ({ request }) => {
        expect(Object.fromEntries(new URL(request.url).searchParams)).toEqual({
          search: 'モップ',
          page: '2',
          pageSize: '20',
        });
        return HttpResponse.json({
          items: [],
          categories: [],
          page: 2,
          pageSize: 20,
          total: 0,
        });
      }),
    );

    await expect(
      listTools({
        search: 'モップ',
        categoryId: '',
        status: '',
        page: 2,
        pageSize: 20,
      }),
    ).resolves.toMatchObject({ page: 2, items: [] });
  });

  it('名前・カテゴリ・在庫数・表示順を作成APIへPOSTする', async () => {
    server.use(
      http.post('*/api/v1/tools', async ({ request }) => {
        expect(await request.json()).toEqual({
          name: '脚立',
          categoryId: 'category-1',
          stockQuantity: 2,
          displayOrder: 10,
        });
        return HttpResponse.json(
          { id: 'tool-2', name: '脚立', status: 'ACTIVE' },
          { status: 201 },
        );
      }),
    );

    await expect(
      createTool({
        name: '脚立',
        categoryId: 'category-1',
        stockQuantity: 2,
        displayOrder: 10,
      }),
    ).resolves.toMatchObject({ name: '脚立' });
  });

  it('編集内容とversionをPATCHへ送る', async () => {
    server.use(
      http.patch('*/api/v1/tools/tool-2', async ({ request }) => {
        expect(await request.json()).toEqual({
          name: '業務用脚立',
          categoryId: 'category-2',
          stockQuantity: 3,
          displayOrder: 20,
          version: 4,
        });
        return HttpResponse.json({
          id: 'tool-2',
          name: '業務用脚立',
          version: 5,
        });
      }),
    );

    await expect(
      updateTool('tool-2', {
        name: '業務用脚立',
        categoryId: 'category-2',
        stockQuantity: 3,
        displayOrder: 20,
        version: 4,
      }),
    ).resolves.toMatchObject({ version: 5 });
  });

  it('状態変更で対象versionを専用URLへ送る', async () => {
    server.use(
      http.patch('*/api/v1/tools/tool-2/status', async ({ request }) => {
        expect(await request.json()).toEqual({
          status: 'INACTIVE',
          version: 5,
        });
        return HttpResponse.json({
          id: 'tool-2',
          status: 'INACTIVE',
          version: 6,
        });
      }),
    );

    await expect(
      updateToolStatus({ id: 'tool-2', version: 5 }, 'INACTIVE'),
    ).resolves.toMatchObject({ status: 'INACTIVE', version: 6 });
  });
});
