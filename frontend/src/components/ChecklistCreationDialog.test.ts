import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/vue';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import type { DailyChecklist } from '../api/daily-checklists';
import { server } from '../test/server';
import ChecklistCreationDialog from './ChecklistCreationDialog.vue';

const date = '2026-08-24';
const categories = [
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

const editingChecklist: DailyChecklist = {
  id: 'checklist-1',
  version: 1,
  workDate: date,
  scheduleMode: 'FULL_DAY',
  editable: true,
  periods: [
    {
      id: 'period-1',
      period: 'FULL_DAY',
      categories: [{ sourceCategoryId: 'category-1', categoryName: '清掃' }],
      items: [],
    },
  ],
};

function respondWithCategories(items = categories) {
  server.use(
    http.get('*/api/v1/tools', () =>
      HttpResponse.json({
        items: [],
        categories: items,
        page: 1,
        pageSize: 1,
        total: 0,
      }),
    ),
  );
}

async function openDialog(checklist?: DailyChecklist) {
  const view = render(ChecklistCreationDialog, {
    props: { open: false, date, checklist },
  });
  await view.rerender({ open: true, date, checklist });
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByLabelText('清掃');
  return { ...view, dialog };
}

describe('ChecklistCreationDialog', () => {
  it('1日通しは1カテゴリ選択するまで作成ボタンを無効にする', async () => {
    respondWithCategories();
    const { dialog } = await openDialog();
    const submitButton = within(dialog).getByRole('button', {
      name: 'チェック表を作成',
    });

    expect(submitButton).toBeDisabled();
    expect(submitButton).toHaveAttribute(
      'aria-describedby',
      'checklist-submit-disabled-reason',
    );
    expect(
      within(dialog).getByText(
        '作業カテゴリを1つ以上選択すると作成できます。',
      ),
    ).toHaveTextContent('作業カテゴリを1つ以上選択すると作成できます。');

    // 未選択のまま押せる回帰を防ぎ、1件選んだ時点で初めて通常操作を許可する。
    await fireEvent.click(within(dialog).getByLabelText('清掃'));
    expect(submitButton).toBeEnabled();
    expect(submitButton).not.toHaveAttribute('aria-describedby');
  });

  it('午前・午後は両方未選択と午前だけの選択を拒否し、両方の選択後に有効にする', async () => {
    respondWithCategories();
    const { dialog } = await openDialog();
    await fireEvent.click(within(dialog).getByLabelText(/午前・午後/));
    const submitButton = within(dialog).getByRole('button', {
      name: 'チェック表を作成',
    });

    // 両時間帯が空の初期状態を片方だけの入力完了と誤認しないことを確認する。
    expect(submitButton).toBeDisabled();
    expect(
      within(dialog).getByText(
        '午前と午後の作業カテゴリを1つ以上選択してください。',
      ),
    ).toBeInTheDocument();

    await fireEvent.click(within(dialog).getByLabelText('清掃'));
    expect(submitButton).toBeDisabled();
    expect(
      within(dialog).getByText('午後の作業カテゴリを1つ以上選択してください。'),
    ).toBeInTheDocument();

    await fireEvent.click(within(dialog).getByRole('button', { name: /午後/ }));
    await fireEvent.click(within(dialog).getByLabelText('洗車'));
    expect(submitButton).toBeEnabled();
    expect(
      within(dialog).getByRole('button', { name: /午前/ }),
    ).toHaveTextContent('(1)');
    expect(
      within(dialog).getByRole('button', { name: /午後/ }),
    ).toHaveTextContent('(1)');
  });

  it('午前・午後は午後だけ選択しても作成ボタンを有効にしない', async () => {
    respondWithCategories();
    const { dialog } = await openDialog();
    await fireEvent.click(within(dialog).getByLabelText(/午前・午後/));
    await fireEvent.click(within(dialog).getByRole('button', { name: /午後/ }));
    await fireEvent.click(within(dialog).getByLabelText('洗車'));

    // 午後から入力を始めた場合も、未入力の午前を見落として送信する事故を防ぐ。
    expect(
      within(dialog).getByRole('button', { name: 'チェック表を作成' }),
    ).toBeDisabled();
    expect(
      within(dialog).getByText('午前の作業カテゴリを1つ以上選択してください。'),
    ).toBeInTheDocument();
  });

  it('カテゴリ読み込み中と選択肢が0件の場合は作成ボタンを無効にする', async () => {
    let releaseRequest!: () => void;
    const pausedRequest = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    server.use(
      http.get('*/api/v1/tools', async () => {
        await pausedRequest;
        return HttpResponse.json({
          items: [],
          categories: [],
          page: 1,
          pageSize: 1,
          total: 0,
        });
      }),
    );
    const view = render(ChecklistCreationDialog, {
      props: { open: false, date },
    });
    void view.rerender({ open: true, date });
    const dialog = await screen.findByRole('dialog');
    const submitButton = within(dialog).getByRole('button', {
      name: 'チェック表を作成',
    });

    expect(submitButton).toBeDisabled();
    expect(
      await within(dialog).findByText('作業カテゴリを読み込み中…'),
    ).toBeInTheDocument();
    const form = view.container.querySelector('form');
    expect(form).not.toBeNull();
    // 読込中の強制submitでは選択エラーを重ねず、現在の処理状況だけを案内する。
    await fireEvent.submit(form!);
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    releaseRequest();

    expect(
      await within(dialog).findAllByText(
        '選択できる作業カテゴリがありません。管理者へカテゴリの登録・設定確認を依頼してください。',
      ),
    ).toHaveLength(2);
    expect(submitButton).toBeDisabled();
    expect(submitButton).toHaveAttribute(
      'aria-describedby',
      'checklist-submit-disabled-reason',
    );
  });

  it('編集時も作成方式ごとの選択条件を適用する', async () => {
    respondWithCategories();
    const { dialog } = await openDialog(editingChecklist);
    const submitButton = within(dialog).getByRole('button', {
      name: '変更を保存',
    });

    expect(within(dialog).getByLabelText('清掃')).toBeChecked();
    expect(submitButton).toBeEnabled();

    await fireEvent.click(within(dialog).getByLabelText(/午前・午後/));
    expect(submitButton).toBeDisabled();
    expect(
      within(dialog).getByText(
        '午前と午後の作業カテゴリを1つ以上選択してください。',
      ),
    ).toBeInTheDocument();

    await fireEvent.click(within(dialog).getByLabelText('清掃'));
    await fireEvent.click(within(dialog).getByRole('button', { name: /午後/ }));
    await fireEvent.click(within(dialog).getByLabelText('洗車'));
    expect(submitButton).toBeEnabled();
  });

  it('作成方式を往復しても、それぞれに保持した選択から有効状態を再計算する', async () => {
    respondWithCategories();
    const { dialog } = await openDialog();
    const submitButton = within(dialog).getByRole('button', {
      name: 'チェック表を作成',
    });

    await fireEvent.click(within(dialog).getByLabelText('清掃'));
    expect(submitButton).toBeEnabled();

    // 1日通しの選択を午前・午後の選択として流用しないことを確認する。
    await fireEvent.click(within(dialog).getByLabelText(/午前・午後/));
    expect(submitButton).toBeDisabled();
    await fireEvent.click(within(dialog).getByLabelText('清掃'));
    await fireEvent.click(within(dialog).getByRole('button', { name: /午後/ }));
    await fireEvent.click(within(dialog).getByLabelText('洗車'));
    expect(submitButton).toBeEnabled();

    await fireEvent.click(within(dialog).getByLabelText(/1日通し/));
    expect(submitButton).toBeEnabled();
    await fireEvent.click(within(dialog).getByLabelText('清掃'));
    expect(submitButton).toBeDisabled();
  });

  it('保存中はボタンとsubmitの両方で二重送信を防ぐ', async () => {
    let requestCount = 0;
    let releaseRequest!: () => void;
    const pausedRequest = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    respondWithCategories();
    server.use(
      http.put(
        `*/api/v1/daily-checklists/${date}`,
        async () => {
          requestCount += 1;
          await pausedRequest;
          return HttpResponse.json(editingChecklist);
        },
      ),
    );
    const { container, dialog, emitted } = await openDialog();
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    await fireEvent.click(within(dialog).getByLabelText('清掃'));
    await fireEvent.click(
      within(dialog).getByRole('button', { name: 'チェック表を作成' }),
    );

    // API応答待ちに強制submitされても、同じ日の日別表を重複作成しない。
    const savingButton = within(dialog).getByRole('button', { name: '作成中…' });
    expect(savingButton).toBeDisabled();
    expect(savingButton).toHaveAttribute(
      'aria-describedby',
      'checklist-submit-disabled-reason',
    );
    expect(
      within(dialog).getByText('作成処理中です。完了までお待ちください。'),
    ).toBeInTheDocument();
    await fireEvent.submit(form!);
    await waitFor(() => expect(requestCount).toBe(1));

    releaseRequest();
    await waitFor(() => expect(emitted().saved).toHaveLength(1));
  });

  it('submit側でも未選択を拒否し、エラーとカテゴリ選択欄を関連付けて入力へフォーカスする', async () => {
    respondWithCategories();
    const { container, dialog } = await openDialog();
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    const firstCheckbox = within(dialog).getByLabelText('清掃');

    // disabledボタンを迂回した送信でも、submit内の防御的バリデーションを必ず通す。
    await fireEvent.submit(form!);

    const alert = within(dialog).getByRole('alert');
    const categoryFieldset = within(dialog).getByRole('group', {
      name: '1日通しの作業カテゴリ',
    });
    expect(alert).toHaveAttribute('id', 'checklist-category-error');
    expect(categoryFieldset).toHaveAttribute('aria-invalid', 'true');
    expect(categoryFieldset).toHaveAttribute(
      'aria-describedby',
      expect.stringContaining('checklist-category-error'),
    );
    expect(firstCheckbox).toHaveFocus();
  });

  it('午前・午後のsubmitエラーは未選択時間帯へ切り替えてチェックボックスまで誘導する', async () => {
    respondWithCategories();
    const { container, dialog } = await openDialog();
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    await fireEvent.click(within(dialog).getByLabelText(/午前・午後/));
    await fireEvent.click(within(dialog).getByLabelText('清掃'));
    const afternoonButton = within(dialog).getByRole('button', { name: /午後/ });

    // 午前だけ入力済みなら、画面外になり得る未入力の午後へ自動で案内する。
    await fireEvent.submit(form!);

    expect(afternoonButton).toHaveAttribute('aria-pressed', 'true');
    const afternoonGroup = within(dialog).getByRole('group', {
      name: '午後の作業カテゴリ',
    });
    const firstAfternoonCheckbox = within(afternoonGroup).getByLabelText('清掃');
    expect(firstAfternoonCheckbox).toHaveFocus();
    expect(afternoonGroup).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      '午後の作業カテゴリを1つ以上選択してください。',
    );

    const scrollIntoView = vi.fn();
    firstAfternoonCheckbox.scrollIntoView = scrollIntoView;
    await fireEvent.submit(form!);
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    });
  });
});
