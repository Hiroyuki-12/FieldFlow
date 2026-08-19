import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '../test/server';
import {
  cancelDailyChecklist,
  createDailyChecklist,
  getDailyChecklist,
  listChecklistCategoryOptions,
  updateDailyChecklistConfiguration,
} from './daily-checklists';

const checklist = {
  id: 'checklist-1',
  version: 1,
  workDate: '2026-08-18',
  scheduleMode: 'FULL_DAY' as const,
  editable: true,
  periods: [],
};

describe('daily-checklists API', () => {
  it('指定日の表をGETする', async () => {
    server.use(
      http.get('*/api/v1/daily-checklists/2026-08-18', () =>
        HttpResponse.json(checklist),
      ),
    );

    await expect(getDailyChecklist('2026-08-18')).resolves.toEqual(checklist);
  });

  it('方式と全時間帯をPUTで一括作成する', async () => {
    const input = {
      scheduleMode: 'SPLIT' as const,
      periods: [
        { period: 'MORNING' as const, categoryIds: ['category-1'] },
        { period: 'AFTERNOON' as const, categoryIds: ['category-2'] },
      ],
    };
    server.use(
      http.put(
        '*/api/v1/daily-checklists/2026-08-18',
        async ({ request }) => {
          expect(await request.json()).toEqual(input);
          return HttpResponse.json({ ...checklist, scheduleMode: 'SPLIT' });
        },
      ),
    );

    await expect(createDailyChecklist('2026-08-18', input)).resolves.toMatchObject(
      { scheduleMode: 'SPLIT' },
    );
  });

  it('現行版のIDと版番号を付けて時間帯・作業内容をPATCHする', async () => {
    const input = {
      checklistId: '11111111-1111-4111-8111-111111111111',
      version: 2,
      confirmDataLoss: true,
      scheduleMode: 'FULL_DAY' as const,
      periods: [
        { period: 'FULL_DAY' as const, categoryIds: ['category-1'] },
      ],
    };
    server.use(
      http.patch(
        '*/api/v1/daily-checklists/2026-08-18/configuration',
        async ({ request }) => {
          expect(await request.json()).toEqual(input);
          return HttpResponse.json({ ...checklist, version: 1 });
        },
      ),
    );

    await expect(
      updateDailyChecklistConfiguration('2026-08-18', input),
    ).resolves.toMatchObject({ id: 'checklist-1' });
  });

  it('現行版のIDと版番号をDELETE本文に付けてチェック表を削除する', async () => {
    const input = {
      checklistId: '11111111-1111-4111-8111-111111111111',
      version: 2,
      confirmDataLoss: true,
    };
    server.use(
      http.delete(
        '*/api/v1/daily-checklists/2026-08-18',
        async ({ request }) => {
          expect(await request.json()).toEqual(input);
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );

    await expect(
      cancelDailyChecklist('2026-08-18', input),
    ).resolves.toBeUndefined();
  });

  it('道具一覧の選択肢から利用中のWORKカテゴリだけを返す', async () => {
    server.use(
      http.get('*/api/v1/tools', ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('page')).toBe('1');
        expect(url.searchParams.get('pageSize')).toBe('1');
        return HttpResponse.json({
          items: [],
          categories: [
            {
              id: 'work-active',
              name: '清掃',
              categoryType: 'WORK',
              status: 'ACTIVE',
              displayOrder: 10,
            },
            {
              id: 'work-inactive',
              name: '洗車',
              categoryType: 'WORK',
              status: 'INACTIVE',
              displayOrder: 20,
            },
            {
              id: 'common',
              name: '共通',
              categoryType: 'COMMON',
              status: 'ACTIVE',
              displayOrder: 0,
            },
          ],
          page: 1,
          pageSize: 1,
          total: 0,
        });
      }),
    );

    await expect(listChecklistCategoryOptions()).resolves.toEqual([
      { id: 'work-active', name: '清掃', displayOrder: 10 },
    ]);
  });
});
