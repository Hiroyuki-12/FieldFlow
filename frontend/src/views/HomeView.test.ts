import { createPinia, setActivePinia } from 'pinia';
import { fireEvent, render, screen, within } from '@testing-library/vue';
import { http, HttpResponse } from 'msw';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '../test/server';
import { formatJapaneseDate, todayInTokyo } from '../utils/date';
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

async function renderHome(
  options: {
    role?: 'ADMIN' | 'WORKER';
    name?: string;
  } = {},
) {
  const role = options.role ?? 'WORKER';
  const name = options.name ?? '山田 太郎';
  const pinia = createPinia();
  setActivePinia(pinia);
  const authStore = useAuthStore(pinia);
  authStore.applySession({
    accessToken: 'access-token',
    expiresIn: 900,
    user: {
      id: 'user-1',
      name,
      loginId: 'worker.one',
      role,
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
      {
        path: '/users',
        name: 'users',
        component: { template: '<p>ユーザー</p>' },
      },
    ],
  });
  await router.push('/');
  render(HomeView, { global: { plugins: [pinia, router] } });
  return router;
}

describe('HomeView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    server.use(
      http.get(`*/api/v1/daily-checklists/${today}`, () =>
        HttpResponse.json(dailyChecklist()),
      ),
    );
  });

  it('今日の作成済み時間帯と準備進捗を表示する', async () => {
    server.use(
      http.get(`*/api/v1/daily-checklists/${today}`, () =>
        HttpResponse.json(dailyChecklist()),
      ),
    );

    await renderHome();

    expect(
      screen.getByRole('heading', {
        name: '山田 太郎さん、準備を始めましょう。',
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText('午前・チェック表あり')).toBeInTheDocument();
    expect(screen.getByText('午後・チェック表あり')).toBeInTheDocument();
    expect(screen.getByText('準備 1 / 1')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /今日のチェックを開く/ }),
    ).toBeInTheDocument();
  });

  it('作業者へ時間帯に依存しない挨拶と持ち出し準備の説明を表示する', async () => {
    // 利用時刻によって不自然な朝の挨拶が表示される回帰を防ぐ。
    await renderHome();

    const heading = screen.getByRole('heading', {
      name: '山田 太郎さん、準備を始めましょう。',
    });
    expect(heading).toHaveAttribute('data-page-heading');
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(screen.queryByText(/おはようございます/)).not.toBeInTheDocument();
    expect(screen.queryByText(/こんにちは/)).not.toBeInTheDocument();
    expect(screen.queryByText(/こんばんは/)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        `${formatJapaneseDate(today)}。今日の持ち出し準備を確認しましょう。`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: '管理メニュー' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '準備の流れ' }),
    ).toBeInTheDocument();
  });

  it('管理者へ準備状況と管理情報の説明、管理ショートカットを表示する', async () => {
    // グローバルナビゲーションとは別の「よく使う機能への近道」だと伝える。
    await renderHome({ role: 'ADMIN', name: '管理 花子' });

    expect(
      screen.getByText(
        `${formatJapaneseDate(today)}。今日の準備状況と管理情報を確認できます。`,
      ),
    ).toBeInTheDocument();
    const adminMenu = screen
      .getByRole('heading', { name: '管理メニュー' })
      .closest('section');
    expect(adminMenu).not.toBeNull();
    expect(
      within(adminMenu as HTMLElement).getByText(
        'よく使う管理機能をすぐに開けます。',
      ),
    ).toBeInTheDocument();
    for (const linkName of ['道具', '作業カテゴリ', 'ユーザー']) {
      expect(
        within(adminMenu as HTMLElement).getByRole('link', { name: linkName }),
      ).toBeInTheDocument();
    }
  });

  it('長いユーザー名を文字列として安全に表示し、折り返し可能にする', async () => {
    // 長い名前による横スクロールと、名前をHTMLとして解釈する脆弱性の回帰を防ぐ。
    const longName =
      '非常に長い利用者名でも安全に折り返して表示する作業者<img src=x onerror=alert(1)>';
    await renderHome({ name: longName });

    const heading = screen.getByRole('heading', {
      name: `${longName}さん、準備を始めましょう。`,
    });
    expect(heading).toHaveClass('break-words');
    expect(heading.querySelector('img')).not.toBeInTheDocument();
  });

  it('午前・午後の選択を保持し、全時間帯を1回のPUTで作成する', async () => {
    let receivedBody: unknown;
    server.use(
      http.get(`*/api/v1/daily-checklists/${today}`, () =>
        HttpResponse.json(
          {
            statusCode: 404,
            code: 'CHECKLIST_NOT_FOUND',
            message: 'not found',
          },
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
