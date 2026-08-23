import { createPinia, setActivePinia } from 'pinia';
import { fireEvent, render, screen, waitFor } from '@testing-library/vue';
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
        categories: [{ sourceCategoryId: 'category-1', categoryName: '清掃' }],
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
        categories: [{ sourceCategoryId: 'category-2', categoryName: '洗車' }],
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

  it('モバイル用の日付・時間帯設定を開閉状態付きで提供する', async () => {
    server.use(
      http.get('*/api/v1/daily-checklists/2026-08-18', () =>
        HttpResponse.json(splitChecklist('2026-08-18')),
      ),
    );
    await renderChecklist('2026-08-18');
    await screen.findByText('ほうき');

    const toggle = screen.getByRole('button', { name: '変更する' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute(
      'aria-controls',
      'date-period-settings-content',
    );

    await fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: '閉じる' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('通常の保存完了は画面全体へ1件だけ表示し、数量0を持ち出し対象外として示す', async () => {
    server.use(
      http.get('*/api/v1/daily-checklists/2026-08-18', () =>
        HttpResponse.json(splitChecklist('2026-08-18')),
      ),
    );
    await renderChecklist('2026-08-18');

    await screen.findByText('ほうき');
    // 各行から同じ「保存済み」を除き、一覧とスクリーンリーダーの反復通知を防ぐ。
    expect(screen.getAllByText('すべて保存済み')).toHaveLength(1);
    expect(
      screen.queryByText('保存済み', { exact: true }),
    ).not.toBeInTheDocument();

    const excludedCheckbox = screen.getByRole('checkbox', {
      name: '手袋は持ち出し対象外',
    });
    expect(excludedCheckbox).toBeDisabled();
    expect(screen.getByText('持ち出し対象外')).toBeInTheDocument();
    expect(screen.getByText('準備済み')).toBeInTheDocument();
    expect(screen.queryByText('未準備')).not.toBeInTheDocument();
  });

  it('数量の0と1を行き来すると、対象外・未準備を切り替えて準備済みを解除する', async () => {
    server.use(
      http.get(`*/api/v1/daily-checklists/${today}`, () =>
        HttpResponse.json(splitChecklist(today)),
      ),
      http.patch(
        `*/api/v1/daily-checklists/${today}/periods/MORNING/items/common-item`,
        async ({ request }) => {
          const body = (await request.json()) as {
            takeoutQuantity: number;
            checked: boolean;
            version: number;
          };
          return HttpResponse.json({
            ...splitChecklist(today).periods[0].items[1],
            ...body,
            version: body.version + 1,
            updatedAt: '2026-08-19T00:00:00.000Z',
          });
        },
      ),
    );
    await renderChecklist(today);

    await fireEvent.click(
      await screen.findByRole('button', { name: '手袋を1増やす' }),
    );
    expect(
      screen.getByRole('checkbox', { name: '手袋を準備済みにする' }),
    ).toBeEnabled();
    expect(screen.getByText('未準備')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText('自動保存の状態')).toHaveTextContent(
        'すべて保存済み',
      ),
    );

    await fireEvent.click(
      screen.getByRole('checkbox', { name: '手袋を準備済みにする' }),
    );
    await waitFor(() =>
      expect(screen.getAllByText('準備済み')).toHaveLength(2),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('自動保存の状態')).toHaveTextContent(
        'すべて保存済み',
      ),
    );

    await fireEvent.change(screen.getByLabelText('手袋の持ち出し数'), {
      target: { value: '0' },
    });
    const excludedCheckbox = screen.getByRole('checkbox', {
      name: '手袋は持ち出し対象外',
    });
    expect(excludedCheckbox).toBeDisabled();
    expect(excludedCheckbox).not.toBeChecked();
    expect(screen.getByText('持ち出し対象外')).toBeInTheDocument();
  });

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
    expect(
      screen.getByRole('region', { name: '確認が必要' }),
    ).toHaveTextContent(/持ち出し対象の準備\s+1 \/ 1/);

    await fireEvent.click(screen.getByRole('button', { name: '午後' }));

    expect(screen.getByText('スポンジ')).toBeInTheDocument();
    expect(screen.queryByText('ほうき')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '準備中' })).toHaveTextContent(
      /持ち出し対象の準備\s+0 \/ 1/,
    );
  });

  it('カテゴリ別進捗を表示し、時間帯ごとの開閉状態を維持する', async () => {
    server.use(
      http.get('*/api/v1/daily-checklists/2026-08-18', () =>
        HttpResponse.json(splitChecklist('2026-08-18')),
      ),
    );
    await renderChecklist('2026-08-18');

    const morningCategory = await screen.findByRole('button', { name: /清掃/ });
    const commonCategory = screen.getByRole('button', { name: /共通/ });
    expect(morningCategory).toHaveAttribute('aria-expanded', 'true');
    expect(morningCategory).toHaveTextContent('準備 1 / 1・100%');
    expect(commonCategory).toHaveTextContent('持ち出し未設定');

    await fireEvent.click(screen.getByRole('button', { name: 'すべて閉じる' }));
    expect(morningCategory).toHaveAttribute('aria-expanded', 'false');
    expect(commonCategory).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByLabelText('ほうきの持ち出し数')).not.toBeVisible();

    await fireEvent.click(screen.getByRole('button', { name: '午後' }));
    const afternoonCategory = screen.getByRole('button', { name: /洗車/ });
    expect(afternoonCategory).toHaveAttribute('aria-expanded', 'true');
    await fireEvent.click(afternoonCategory);
    expect(afternoonCategory).toHaveAttribute('aria-expanded', 'false');

    await fireEvent.click(screen.getByRole('button', { name: '午前' }));
    expect(screen.getByRole('button', { name: /清掃/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await fireEvent.click(screen.getByRole('button', { name: 'すべて開く' }));
    expect(screen.getByRole('button', { name: /清掃/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('持ち出し対象が全て準備済みでも、数量未設定カテゴリがあれば確認必要と表示する', async () => {
    server.use(
      http.get('*/api/v1/daily-checklists/2026-08-18', () =>
        HttpResponse.json(splitChecklist('2026-08-18')),
      ),
    );
    await renderChecklist('2026-08-18');

    const summary = await screen.findByRole('region', { name: '確認が必要' });
    expect(summary).toHaveTextContent(/持ち出し対象の準備\s+1 \/ 1/);
    expect(summary).toHaveTextContent(/数量未設定\s+1カテゴリ/);
    expect(summary).not.toHaveTextContent('準備完了');
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      '持ち出し対象の準備 1 / 1、数量未設定 1カテゴリ、確認が必要',
    );
  });

  it('数量未設定カテゴリ数を、作業カテゴリと道具のある共通カテゴリから集計する', async () => {
    const checklist = splitChecklist('2026-08-18');
    checklist.periods[0].categories.push({
      sourceCategoryId: 'category-2',
      categoryName: '設営',
    });
    server.use(
      http.get('*/api/v1/daily-checklists/2026-08-18', () =>
        HttpResponse.json(checklist),
      ),
    );
    await renderChecklist('2026-08-18');

    const summary = await screen.findByRole('region', { name: '確認が必要' });
    expect(summary).toHaveTextContent(/数量未設定\s+2カテゴリ/);
    expect(screen.getByRole('button', { name: /設営/ })).toHaveTextContent(
      '持ち出し未設定',
    );
    expect(screen.getByRole('button', { name: /共通/ })).toHaveTextContent(
      '持ち出し未設定',
    );
  });

  it('数量未設定がなく、持ち出し対象が全て準備済みの場合だけ準備完了と表示する', async () => {
    const checklist = splitChecklist('2026-08-18');
    checklist.periods[0].items[1].takeoutQuantity = 1;
    checklist.periods[0].items[1].checked = true;
    server.use(
      http.get('*/api/v1/daily-checklists/2026-08-18', () =>
        HttpResponse.json(checklist),
      ),
    );
    await renderChecklist('2026-08-18');

    const summary = await screen.findByRole('region', { name: '準備完了' });
    expect(summary).toHaveTextContent(/持ち出し対象の準備\s+2 \/ 2/);
    expect(summary).toHaveTextContent(/数量未設定\s+0カテゴリ/);
    expect(summary).toHaveTextContent('持ち出し対象内 100%');
  });

  it('持ち出し対象に未準備がある場合は準備中と表示する', async () => {
    const checklist = splitChecklist('2026-08-18');
    checklist.periods[0].items[1].takeoutQuantity = 1;
    checklist.periods[0].items[1].checked = false;
    server.use(
      http.get('*/api/v1/daily-checklists/2026-08-18', () =>
        HttpResponse.json(checklist),
      ),
    );
    await renderChecklist('2026-08-18');

    const summary = await screen.findByRole('region', { name: '準備中' });
    expect(summary).toHaveTextContent(/持ち出し対象の準備\s+1 \/ 2/);
    expect(summary).not.toHaveTextContent('準備完了');
  });

  it('持ち出し対象0件でNaNや100%を表示せず、長いカテゴリ名を折り返せる', async () => {
    const checklist = splitChecklist('2026-08-18');
    const longCategoryName =
      'VeryLongCategoryNameWithoutSpacesForResponsiveLayoutCheck1234567890';
    checklist.periods[0].categories[0].categoryName = longCategoryName;
    checklist.periods[0].items = [];
    server.use(
      http.get('*/api/v1/daily-checklists/2026-08-18', () =>
        HttpResponse.json(checklist),
      ),
    );
    await renderChecklist('2026-08-18');

    const summary = await screen.findByRole('region', { name: '確認が必要' });
    expect(summary).toHaveTextContent(/持ち出し対象の準備\s+0 \/ 0/);
    expect(summary).not.toHaveTextContent('NaN');
    expect(summary).not.toHaveTextContent('100%');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getAllByText(longCategoryName)).toHaveLength(2);
    for (const categoryName of screen.getAllByText(longCategoryName)) {
      expect(categoryName).toHaveClass('break-words');
    }
  });

  it('未作成の過去日は表なしを表示し、作成操作を出さない', async () => {
    server.use(
      http.get('*/api/v1/daily-checklists/2000-01-01', () =>
        HttpResponse.json(
          {
            statusCode: 404,
            code: 'CHECKLIST_NOT_FOUND',
            message: 'not found',
          },
          { status: 404 },
        ),
      ),
    );
    await renderChecklist('2000-01-01');

    expect(
      await screen.findByRole('heading', {
        name: 'この日のチェック表はありません',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/過去日は記録を閲覧できます/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'この日のチェック表を作成' }),
    ).not.toBeInTheDocument();
  });

  it('新規作成では作成時点のマスター内容を保存することを説明する', async () => {
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
    );
    await renderChecklist(today);

    await fireEvent.click(
      await screen.findByRole('button', { name: 'この日のチェック表を作成' }),
    );
    expect(
      screen.getByRole('heading', { name: '作成時に保存される内容' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/作成後のマスター変更は自動では反映されません/),
    ).toBeInTheDocument();
  });

  it('作成済みの過去日はスナップショットを閲覧専用で表示する', async () => {
    server.use(
      http.get('*/api/v1/daily-checklists/2000-01-01', () =>
        HttpResponse.json(splitChecklist('2000-01-01', false)),
      ),
    );
    await renderChecklist('2000-01-01');

    expect(
      await screen.findByText('過去日のため閲覧のみです。'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'このチェック表は作成時点の内容を保存しています',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/マスターへ追加・変更した内容は自動反映されません/),
    ).toBeInTheDocument();
    expect(screen.getByText('ほうき')).toBeInTheDocument();
    expect(screen.getByText('在庫 3')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '時間帯・作業内容を変更する' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'この日のチェック表を削除する' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'ほうきを1増やす' }),
    ).not.toBeInTheDocument();
  });

  it('数量変更を自動保存し、完了後も利用者が選んだ開閉状態を維持する', async () => {
    let receivedBody: unknown;
    let releaseSaveRequest!: () => void;
    const saveRequestPaused = new Promise<void>((resolve) => {
      releaseSaveRequest = resolve;
    });
    server.use(
      http.get(`*/api/v1/daily-checklists/${today}`, () =>
        HttpResponse.json(splitChecklist(today)),
      ),
      http.patch(
        `*/api/v1/daily-checklists/${today}/periods/MORNING/items/morning-item`,
        async ({ request }) => {
          receivedBody = await request.json();
          await saveRequestPaused;
          return HttpResponse.json({
            ...splitChecklist(today).periods[0].items[0],
            takeoutQuantity: 3,
            checked: true,
            version: 3,
            updatedAt: '2026-08-19T00:00:00.000Z',
          });
        },
      ),
    );
    await renderChecklist(today);

    // 左右の±を主操作にするため、重複するブラウザ標準スピナーを隠すclassを維持する。
    expect(await screen.findByLabelText('ほうきの持ち出し数')).toHaveClass(
      'quantity-stepper-input',
    );

    await fireEvent.click(
      await screen.findByRole('button', { name: 'ほうきを1増やす' }),
    );

    // 通信中だけ行へ状態を出し、正常時の反復表示へ戻らないことを固定する。
    expect(screen.getByLabelText('自動保存の状態')).toHaveTextContent(
      '変更を保存中…',
    );
    expect(screen.getByText('保存中…')).toBeInTheDocument();

    await waitFor(() =>
      expect(receivedBody).toEqual({
        takeoutQuantity: 3,
        checked: true,
        version: 2,
      }),
    );
    const categoryButton = screen.getByRole('button', { name: /清掃/ });
    await fireEvent.click(categoryButton);
    expect(categoryButton).toHaveAttribute('aria-expanded', 'false');
    releaseSaveRequest();

    expect(screen.getByLabelText('ほうきの持ち出し数')).toHaveValue(3);
    await waitFor(() =>
      expect(screen.getByLabelText('自動保存の状態')).toHaveTextContent(
        'すべて保存済み',
      ),
    );
    expect(
      screen.queryByText('保存済み', { exact: true }),
    ).not.toBeInTheDocument();
    expect(categoryButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('保存失敗を保存済み扱いにせず、同じ値を再試行できる', async () => {
    let requestCount = 0;
    let releaseFailedRequest!: () => void;
    const failedRequestPaused = new Promise<void>((resolve) => {
      releaseFailedRequest = resolve;
    });
    server.use(
      http.get(`*/api/v1/daily-checklists/${today}`, () =>
        HttpResponse.json(splitChecklist(today)),
      ),
      http.patch(
        `*/api/v1/daily-checklists/${today}/periods/MORNING/items/morning-item`,
        async ({ request }) => {
          requestCount += 1;
          const body = (await request.json()) as {
            takeoutQuantity: number;
            checked: boolean;
            version: number;
          };
          if (requestCount === 1) {
            await failedRequestPaused;
            return HttpResponse.json({ message: 'failed' }, { status: 500 });
          }
          return HttpResponse.json({
            ...splitChecklist(today).periods[0].items[0],
            takeoutQuantity: body.takeoutQuantity,
            checked: body.checked,
            version: body.version + 1,
            updatedAt: '2026-08-19T00:00:00.000Z',
          });
        },
      ),
    );
    await renderChecklist(today);

    await fireEvent.click(
      await screen.findByRole('button', { name: 'ほうきを1増やす' }),
    );
    await waitFor(() => expect(requestCount).toBe(1));
    const categoryButton = screen.getByRole('button', { name: /清掃/ });
    await fireEvent.click(categoryButton);
    expect(categoryButton).toHaveAttribute('aria-expanded', 'false');
    releaseFailedRequest();

    expect(
      await screen.findByText('保存できていない変更があります'),
    ).toBeInTheDocument();
    expect(screen.getByText('保存失敗：')).toBeInTheDocument();
    expect(categoryButton).toHaveAttribute('aria-expanded', 'true');
    expect(categoryButton).toHaveTextContent('保存失敗あり');
    await fireEvent.click(screen.getByRole('button', { name: '再試行' }));

    await waitFor(() => expect(requestCount).toBe(2));
    expect(screen.getByLabelText('ほうきの持ち出し数')).toHaveValue(3);
    expect(
      screen.queryByRole('button', { name: '再試行' }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText('自動保存の状態')).toHaveTextContent(
        'すべて保存済み',
      ),
    );
  });

  it('同じ行への連続変更を直列化し、先の応答versionで次を保存する', async () => {
    const receivedBodies: unknown[] = [];
    let releaseFirstRequest!: () => void;
    const firstRequestPaused = new Promise<void>((resolve) => {
      releaseFirstRequest = resolve;
    });
    server.use(
      http.get(`*/api/v1/daily-checklists/${today}`, () =>
        HttpResponse.json(splitChecklist(today)),
      ),
      http.patch(
        `*/api/v1/daily-checklists/${today}/periods/MORNING/items/common-item`,
        async ({ request }) => {
          const body = (await request.json()) as {
            takeoutQuantity: number;
            checked: boolean;
            version: number;
          };
          receivedBodies.push(body);
          if (receivedBodies.length === 1) await firstRequestPaused;
          return HttpResponse.json({
            ...splitChecklist(today).periods[0].items[1],
            takeoutQuantity: body.takeoutQuantity,
            checked: body.checked,
            version: body.version + 1,
            updatedAt: '2026-08-19T00:00:00.000Z',
          });
        },
      ),
    );
    await renderChecklist(today);
    const increase = await screen.findByRole('button', {
      name: '手袋を1増やす',
    });

    await fireEvent.click(increase);
    await fireEvent.click(increase);
    await waitFor(() => expect(receivedBodies).toHaveLength(1));
    releaseFirstRequest();

    await waitFor(() => expect(receivedBodies).toHaveLength(2));
    expect(receivedBodies).toEqual([
      { takeoutQuantity: 1, checked: false, version: 1 },
      { takeoutQuantity: 2, checked: false, version: 2 },
    ]);
    expect(screen.getByLabelText('手袋の持ち出し数')).toHaveValue(2);
  });

  it('409競合では最新行へ戻し、再操作できることを通知する', async () => {
    let requestCount = 0;
    const receivedVersions: number[] = [];
    let releaseConflictRequest!: () => void;
    const conflictRequestPaused = new Promise<void>((resolve) => {
      releaseConflictRequest = resolve;
    });
    server.use(
      http.get(`*/api/v1/daily-checklists/${today}`, () =>
        HttpResponse.json(splitChecklist(today)),
      ),
      http.patch(
        `*/api/v1/daily-checklists/${today}/periods/MORNING/items/morning-item`,
        async ({ request }) => {
          requestCount += 1;
          const body = (await request.json()) as {
            takeoutQuantity: number;
            checked: boolean;
            version: number;
          };
          receivedVersions.push(body.version);
          if (requestCount === 1) {
            await conflictRequestPaused;
            return HttpResponse.json(
              {
                statusCode: 409,
                code: 'CHECKLIST_ITEM_UPDATE_CONFLICT',
                message: 'conflict',
                details: {
                  currentItem: {
                    ...splitChecklist(today).periods[0].items[0],
                    takeoutQuantity: 1,
                    checked: false,
                    version: 5,
                    updatedAt: '2026-08-19T00:00:00.000Z',
                  },
                },
              },
              { status: 409 },
            );
          }
          return HttpResponse.json({
            ...splitChecklist(today).periods[0].items[0],
            takeoutQuantity: body.takeoutQuantity,
            checked: body.checked,
            version: body.version + 1,
            updatedAt: '2026-08-19T01:00:00.000Z',
          });
        },
      ),
    );
    await renderChecklist(today);

    // 別道具の入力エラーを残し、競合が保存失敗より優先されることを確認する。
    await fireEvent.change(await screen.findByLabelText('手袋の持ち出し数'), {
      target: { value: '11' },
    });
    expect(screen.getByLabelText('自動保存の状態')).toHaveTextContent(
      '保存できていない変更があります',
    );

    await fireEvent.click(
      await screen.findByRole('button', { name: 'ほうきを1増やす' }),
    );
    await waitFor(() => expect(requestCount).toBe(1));
    const categoryButton = screen.getByRole('button', { name: /清掃/ });
    await fireEvent.click(categoryButton);
    expect(categoryButton).toHaveAttribute('aria-expanded', 'false');
    releaseConflictRequest();

    expect(
      await screen.findByText('他のユーザーによる更新を確認してください'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('⚠ 他のユーザーが更新したため、最新値へ戻しました。'),
    ).toBeInTheDocument();
    expect(screen.getByText('最新値: 数量1・未準備')).toBeInTheDocument();
    expect(categoryButton).toHaveAttribute('aria-expanded', 'true');
    expect(categoryButton).toHaveTextContent('競合あり');
    expect(screen.getByLabelText('ほうきの持ち出し数')).toHaveValue(1);
    expect(screen.getByLabelText('手袋の持ち出し数')).toHaveValue(0);

    await fireEvent.click(
      screen.getByRole('button', { name: 'ほうきの競合メッセージを閉じる' }),
    );
    expect(screen.queryByText('最新値: 数量1・未準備')).not.toBeInTheDocument();
    expect(categoryButton).not.toHaveTextContent('競合あり');

    await fireEvent.click(
      screen.getByRole('button', { name: 'ほうきを1増やす' }),
    );
    await waitFor(() => expect(requestCount).toBe(2));
    expect(receivedVersions).toEqual([2, 5]);
    expect(screen.getByLabelText('ほうきの持ち出し数')).toHaveValue(2);
  });

  it('現在の時間帯へ未選択の作業カテゴリを追加する', async () => {
    let receivedBody: unknown;
    const addedChecklist = splitChecklist(today);
    addedChecklist.periods[0].categories.push({
      sourceCategoryId: 'category-2',
      categoryName: '洗車',
    });
    addedChecklist.periods[0].items.push({
      ...addedChecklist.periods[1].items[0],
      id: 'added-item',
    });
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
      http.post(
        `*/api/v1/daily-checklists/${today}/periods/MORNING/categories`,
        async ({ request }) => {
          receivedBody = await request.json();
          return HttpResponse.json(addedChecklist, { status: 201 });
        },
      ),
    );
    await renderChecklist(today);

    await fireEvent.click(
      await screen.findByRole('button', { name: '作業カテゴリを追加' }),
    );
    expect(screen.getByText(/共通道具は再取得しないため/)).toBeInTheDocument();
    expect(screen.queryByLabelText('清掃')).not.toBeInTheDocument();
    await fireEvent.click(await screen.findByLabelText('洗車'));
    await fireEvent.click(
      screen.getByRole('button', { name: '選択したカテゴリを追加' }),
    );

    expect(
      await screen.findByText('午前へ作業カテゴリを追加しました。'),
    ).toBeInTheDocument();
    expect(receivedBody).toEqual({ categoryIds: ['category-2'] });
    expect(screen.getByText('スポンジ')).toBeInTheDocument();
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
    expect(
      screen.getByText('最新の作業カテゴリ・共通道具から新版を作成します。'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/午前・午後から1日通しへ変更するなど/),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText('清掃')).toBeChecked();
    await fireEvent.click(screen.getByRole('button', { name: '変更を保存' }));

    expect(screen.getByText('入力済みの内容があります')).toBeInTheDocument();
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
      http.delete(`*/api/v1/daily-checklists/${today}`, async ({ request }) => {
        receivedBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await renderChecklist(today);

    const settings = await screen.findByRole('region', {
      name: 'チェック表の設定',
    });
    expect(
      screen.getByRole('button', { name: '作業カテゴリを追加' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: '時間帯・作業内容を変更する' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'この日のチェック表を削除する' }),
    ).not.toBeInTheDocument();

    // 破壊的操作を通常操作から分け、開いたときだけ到達できる構造を固定する。
    const otherActions = screen.getByRole('button', { name: 'その他の操作' });
    expect(otherActions).toHaveAttribute('aria-expanded', 'false');
    expect(otherActions).toHaveAttribute(
      'aria-controls',
      'daily-checklist-danger-actions',
    );
    await fireEvent.click(otherActions);
    expect(otherActions).toHaveAttribute('aria-expanded', 'true');
    expect(settings).toHaveTextContent('危険な操作');

    await fireEvent.click(
      screen.getByRole('button', {
        name: 'この日のチェック表を削除する',
      }),
    );
    const deleteDialog = screen.getByRole('dialog', {
      name: 'この日のチェック表を削除しますか？',
    });
    expect(
      screen.getByRole('heading', {
        name: 'この日のチェック表を削除しますか？',
      }),
    ).toBeInTheDocument();
    expect(deleteDialog).toHaveTextContent(
      `${Number(today.slice(5, 7))}月${Number(today.slice(8, 10))}日`,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'キャンセル' })).toHaveFocus(),
    );
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

  it('削除のキャンセルとEscapeを受け付け、失敗時は二重送信せず確認画面を残す', async () => {
    let requestCount = 0;
    let releaseDelete!: () => void;
    const deletePaused = new Promise<void>((resolve) => {
      releaseDelete = resolve;
    });
    server.use(
      http.get(`*/api/v1/daily-checklists/${today}`, () =>
        HttpResponse.json(splitChecklist(today)),
      ),
      http.delete(`*/api/v1/daily-checklists/${today}`, async () => {
        requestCount += 1;
        await deletePaused;
        return HttpResponse.json({ message: 'delete failed' }, { status: 500 });
      }),
    );
    await renderChecklist(today);

    await fireEvent.click(
      await screen.findByRole('button', { name: 'その他の操作' }),
    );
    const openDelete = screen.getByRole('button', {
      name: 'この日のチェック表を削除する',
    });
    await fireEvent.click(openDelete);
    await fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(requestCount).toBe(0);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await fireEvent.click(openDelete);
    let dialog = screen.getByRole('dialog');
    await fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await fireEvent.click(openDelete);
    dialog = screen.getByRole('dialog');
    const deleteButton = screen.getByRole('button', { name: '削除する' });
    await fireEvent.click(deleteButton);
    await waitFor(() => expect(requestCount).toBe(1));
    expect(deleteButton).toBeDisabled();
    await fireEvent.click(deleteButton);
    expect(requestCount).toBe(1);
    releaseDelete();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '処理を完了できませんでした。もう一度お試しください。',
    );
    expect(dialog).toHaveAttribute('open');
  });
});
