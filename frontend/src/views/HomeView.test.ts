import { createPinia, setActivePinia } from 'pinia';
import { fireEvent, render, screen, within } from '@testing-library/vue';
import { http, HttpResponse } from 'msw';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '../test/server';
import { todayInTokyo } from '../utils/date';
import { useAuthStore } from '../stores/auth';
import HomeView from './HomeView.vue';

const today = todayInTokyo();
const workCategories = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: '清掃',
    categoryType: 'WORK',
    status: 'ACTIVE',
    displayOrder: 10,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: '洗車',
    categoryType: 'WORK',
    status: 'ACTIVE',
    displayOrder: 20,
  },
];

function dailyChecklist(scheduleMode: 'FULL_DAY' | 'SPLIT' = 'SPLIT') {
  return {
    id: 'checklist-1',
    version: 1,
    workDate: today,
    scheduleMode,
    editable: true,
    periods: [
      {
        id: 'period-1',
        period: scheduleMode === 'SPLIT' ? 'MORNING' : 'FULL_DAY',
        categories: [
          {
            sourceCategoryId: workCategories[0].id,
            categoryName: '清掃',
          },
        ],
        items: [
          {
            id: 'item-1',
            sourceToolId: 'tool-1',
            toolName: 'ほうき',
            categoryName: '清掃',
            stockQuantity: 3,
            takeoutQuantity: 1,
            checked: true,
            version: 1,
            updatedAt: '2026-08-17T00:00:00.000Z',
          },
        ],
      },
      ...(scheduleMode === 'SPLIT'
        ? [
            {
              id: 'period-2',
              period: 'AFTERNOON',
              categories: [
                {
                  sourceCategoryId: workCategories[1].id,
                  categoryName: '洗車',
                },
              ],
              items: [],
            },
          ]
        : []),
    ],
  };
}

async function renderHome() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const authStore = useAuthStore(pinia);
  authStore.applySession({
    accessToken: 'access-token',
    expiresIn: 900,
    user: {
      id: 'user-1',
      name: '山田 太郎',
      loginId: 'worker.one',
      role: 'WORKER',
      mustChangePassword: false,
    },
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: HomeView },
      {
        path: '/daily-checklists/:date',
        name: 'daily-checklist',
        component: { template: '<p>日別表</p>' },
      },
      { path: '/tools', name: 'tools', component: { template: '<p>道具</p>' } },
      {
        path: '/categories',
        name: 'categories',
        component: { template: '<p>カテゴリ</p>' },
      },
      { path: '/users', name: 'users', component: { template: '<p>ユーザー</p>' } },
    ],
  });
  await router.push('/');
  render(HomeView, { global: { plugins: [pinia, router] } });
  return router;
}

describe('HomeView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('今日の作成済み時間帯と準備進捗を表示する', async () => {
    server.use(
      http.get(`*/api/v1/daily-checklists/${today}`, () =>
        HttpResponse.json(dailyChecklist()),
      ),
    );

    await renderHome();

    expect(
      screen.getByRole('heading', { name: 'おはようございます、山田 太郎さん' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('午前・チェック表あり')).toBeInTheDocument();
    expect(screen.getByText('午後・チェック表あり')).toBeInTheDocument();
    expect(screen.getByText('準備 1 / 1')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /今日のチェックを開く/ }),
    ).toBeInTheDocument();
  });

  it('午前・午後の選択を保持し、全時間帯を1回のPUTで作成する', async () => {
    let receivedBody: unknown;
    server.use(
      http.get(`*/api/v1/daily-checklists/${today}`, () =>
        HttpResponse.json(
          { statusCode: 404, code: 'CHECKLIST_NOT_FOUND', message: 'not found' },
          { status: 404 },
        ),
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
      http.put(`*/api/v1/daily-checklists/${today}`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json(dailyChecklist());
      }),
    );
    const router = await renderHome();

    await fireEvent.click(
      await screen.findByRole('button', { name: /今日のチェックを作成/ }),
    );
    const dialog = screen.getByRole('dialog');
    await fireEvent.click(within(dialog).getByLabelText(/午前・午後/));
    await fireEvent.click(await within(dialog).findByLabelText('清掃'));
    await fireEvent.click(within(dialog).getByRole('button', { name: /午後/ }));
    await fireEvent.click(within(dialog).getByLabelText('洗車'));
    await fireEvent.click(
      within(dialog).getByRole('button', { name: 'チェック表を作成' }),
    );

    await vi.waitFor(() =>
      expect(receivedBody).toEqual({
        scheduleMode: 'SPLIT',
        periods: [
          { period: 'MORNING', categoryIds: [workCategories[0].id] },
          { period: 'AFTERNOON', categoryIds: [workCategories[1].id] },
        ],
      }),
    );
    await vi.waitFor(() =>
      expect(router.currentRoute.value.params.date).toBe(today),
    );
  });

  it('選択した別日の日別チェックへ移動する', async () => {
    server.use(
      http.get(`*/api/v1/daily-checklists/${today}`, () =>
        HttpResponse.json(dailyChecklist('FULL_DAY')),
      ),
    );
    const router = await renderHome();

    await screen.findByText('1日通し・チェック表あり');
    await fireEvent.update(screen.getByLabelText('作業日'), '2026-09-01');
    await fireEvent.click(screen.getByRole('button', { name: 'この日を開く' }));

    await vi.waitFor(() =>
      expect(router.currentRoute.value.fullPath).toBe(
        '/daily-checklists/2026-09-01',
      ),
    );
  });
});
