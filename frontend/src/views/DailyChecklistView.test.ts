import { createPinia, setActivePinia } from 'pinia';
import { fireEvent, render, screen } from '@testing-library/vue';
import { http, HttpResponse } from 'msw';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it } from 'vitest';

import { server } from '../test/server';
import { todayInTokyo } from '../utils/date';
import DailyChecklistView from './DailyChecklistView.vue';

const today = todayInTokyo();
const workCategories = [
  {
    id: 'category-1',
    name: '清掃',
    categoryType: 'WORK',
    status: 'ACTIVE',
    displayOrder: 10,
  },
  {
    id: 'category-2',
    name: '洗車',
    categoryType: 'WORK',
    status: 'ACTIVE',
    displayOrder: 20,
  },
];

function splitChecklist(date: string, editable = true) {
  return {
    id: 'checklist-1',
    version: 1,
    workDate: date,
    scheduleMode: 'SPLIT',
    editable,
    periods: [
      {
        id: 'morning-period',
        period: 'MORNING',
        categories: [
          { sourceCategoryId: 'category-1', categoryName: '清掃' },
        ],
        items: [
          {
            id: 'morning-item',
            sourceToolId: 'tool-1',
            toolName: 'ほうき',
            categoryName: '清掃',
            stockQuantity: 3,
            takeoutQuantity: 2,
            checked: true,
            version: 2,
            updatedAt: '2026-08-17T00:00:00.000Z',
          },
          {
            id: 'common-item',
            sourceToolId: 'tool-2',
            toolName: '手袋',
            categoryName: '共通',
            stockQuantity: 10,
            takeoutQuantity: 0,
            checked: false,
            version: 1,
            updatedAt: '2026-08-17T00:00:00.000Z',
          },
        ],
      },
      {
        id: 'afternoon-period',
        period: 'AFTERNOON',
        categories: [
          { sourceCategoryId: 'category-2', categoryName: '洗車' },
        ],
        items: [
          {
            id: 'afternoon-item',
            sourceToolId: 'tool-3',
            toolName: 'スポンジ',
            categoryName: '洗車',
            stockQuantity: 4,
            takeoutQuantity: 1,
            checked: false,
            version: 1,
            updatedAt: '2026-08-17T00:00:00.000Z',
          },
        ],
      },
    ],
  };
}

async function renderChecklist(date: string) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<p>ホーム</p>' } },
      {
        path: '/daily-checklists/:date',
        name: 'daily-checklist',
        component: DailyChecklistView,
      },
    ],
  });
  await router.push(`/daily-checklists/${date}`);
  render(DailyChecklistView, { global: { plugins: [pinia, router] } });
  return router;
}

describe('DailyChecklistView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('午前・午後を切り替えて独立したカテゴリと道具を表示する', async () => {
    server.use(
      http.get('*/api/v1/daily-checklists/2026-08-18', () =>
        HttpResponse.json(splitChecklist('2026-08-18')),
      ),
    );
    await renderChecklist('2026-08-18');

    expect(await screen.findByText('ほうき')).toBeInTheDocument();
    expect(screen.getByText('手袋')).toBeInTheDocument();
    expect(screen.queryByText('スポンジ')).not.toBeInTheDocument();
    expect(screen.getByText('準備 1 / 1')).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: '午後' }));

    expect(screen.getByText('スポンジ')).toBeInTheDocument();
    expect(screen.queryByText('ほうき')).not.toBeInTheDocument();
    expect(screen.getByText('準備 0 / 1')).toBeInTheDocument();
  });

  it('未作成の過去日は表なしを表示し、作成操作を出さない', async () => {
    server.use(
      http.get('*/api/v1/daily-checklists/2000-01-01', () =>
        HttpResponse.json(
          { statusCode: 404, code: 'CHECKLIST_NOT_FOUND', message: 'not found' },
          { status: 404 },
        ),
      ),
    );
    await renderChecklist('2000-01-01');

    expect(
      await screen.findByRole('heading', { name: 'この日のチェック表はありません' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/過去日は記録を閲覧できます/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'この日のチェック表を作成' }),
    ).not.toBeInTheDocument();
  });

  it('作成済みの過去日はスナップショットを閲覧専用で表示する', async () => {
    server.use(
      http.get('*/api/v1/daily-checklists/2000-01-01', () =>
        HttpResponse.json(splitChecklist('2000-01-01', false)),
      ),
    );
    await renderChecklist('2000-01-01');

    expect(await screen.findByText('過去日のため閲覧のみです。')).toBeInTheDocument();
    expect(screen.getByText('ほうき')).toBeInTheDocument();
    expect(screen.getByText('在庫 3')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '時間帯・作業内容を変更する' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'この日のチェック表を削除する' }),
    ).not.toBeInTheDocument();
  });

  it('現在の設定を初期表示し、入力済み内容を確認して変更する', async () => {
    let receivedBody: unknown;
    server.use(
      http.get(`*/api/v1/daily-checklists/${today}`, () =>
        HttpResponse.json(splitChecklist(today)),
      ),
      http.get('*/api/v1/tools', () =>
        HttpResponse.json({
          items: [],
          categories: workCategories,
          page: 1,
          pageSize: 1,
          total: 0,
        }),
      ),
      http.patch(
        `*/api/v1/daily-checklists/${today}/configuration`,
        async ({ request }) => {
          receivedBody = await request.json();
          return HttpResponse.json({ ...splitChecklist(today), version: 1 });
        },
      ),
    );
    await renderChecklist(today);

    await fireEvent.click(
      await screen.findByRole('button', {
        name: '時間帯・作業内容を変更する',
      }),
    );
    const dialog = screen.getByRole('dialog');
    expect(await screen.findByLabelText('清掃')).toBeChecked();
    await fireEvent.click(
      screen.getByRole('button', { name: '変更を保存' }),
    );

    expect(
      screen.getByText('入力済みの内容があります'),
    ).toBeInTheDocument();
    await fireEvent.click(
      screen.getByRole('button', { name: '変更を確定する' }),
    );

    expect(
      await screen.findByText('時間帯・作業内容を変更しました。'),
    ).toBeInTheDocument();
    expect(dialog).not.toHaveAttribute('open');
    expect(receivedBody).toEqual({
      checklistId: 'checklist-1',
      version: 1,
      confirmDataLoss: true,
      scheduleMode: 'SPLIT',
      periods: [
        { period: 'MORNING', categoryIds: ['category-1'] },
        { period: 'AFTERNOON', categoryIds: ['category-2'] },
      ],
    });
  });

  it('確認後にこの日の表を削除し、同日を再作成できる状態に戻す', async () => {
    let receivedBody: unknown;
    server.use(
      http.get(`*/api/v1/daily-checklists/${today}`, () =>
        HttpResponse.json(splitChecklist(today)),
      ),
      http.delete(
        `*/api/v1/daily-checklists/${today}`,
        async ({ request }) => {
          receivedBody = await request.json();
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );
    await renderChecklist(today);

    await fireEvent.click(
      await screen.findByRole('button', {
        name: 'この日のチェック表を削除する',
      }),
    );
    expect(
      screen.getByRole('heading', {
        name: 'この日のチェック表を削除しますか？',
      }),
    ).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: '削除する' }));

    expect(
      await screen.findByText(
        'この日のチェック表を削除しました。新しく作成できます。',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'この日のチェック表を作成' }),
    ).toBeInTheDocument();
    expect(receivedBody).toEqual({
      checklistId: 'checklist-1',
      version: 1,
      confirmDataLoss: true,
    });
  });
});
