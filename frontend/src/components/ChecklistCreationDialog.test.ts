import { fireEvent, render, screen, within } from '@testing-library/vue';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

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
        '作業カテゴリを1つ以上選択すると作成・保存できます。',
      ),
    ).toHaveTextContent('作業カテゴリを1つ以上選択すると作成・保存できます。');

    await fireEvent.click(within(dialog).getByLabelText('清掃'));
    expect(submitButton).toBeEnabled();
    expect(submitButton).not.toHaveAttribute('aria-describedby');
  });

  it('午前だけ選択した状態では無効、午前・午後の両方を選択すると有効にする', async () => {
    respondWithCategories();
    const { dialog } = await openDialog();
    await fireEvent.click(within(dialog).getByLabelText(/午前・午後/));
    await fireEvent.click(within(dialog).getByLabelText('清掃'));
    const submitButton = within(dialog).getByRole('button', {
      name: 'チェック表を作成',
    });

    expect(submitButton).toBeDisabled();
    expect(
      within(dialog).getByText('午後の作業カテゴリを1つ以上選択してください。'),
    ).toBeInTheDocument();

    await fireEvent.click(within(dialog).getByRole('button', { name: /午後/ }));
    await fireEvent.click(within(dialog).getByLabelText('洗車'));
    expect(submitButton).toBeEnabled();
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
    releaseRequest();

    expect(
      await within(dialog).findAllByText(
        '選択できる作業カテゴリがありません。',
      ),
    ).toHaveLength(2);
    expect(submitButton).toBeDisabled();
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
        '午前と午後の両方で、作業カテゴリを1つ以上選択してください。',
      ),
    ).toBeInTheDocument();

    await fireEvent.click(within(dialog).getByLabelText('清掃'));
    await fireEvent.click(within(dialog).getByRole('button', { name: /午後/ }));
    await fireEvent.click(within(dialog).getByLabelText('洗車'));
    expect(submitButton).toBeEnabled();
  });

  it('submit側でも未選択を拒否し、エラーとカテゴリ選択欄を関連付けてフォーカスする', async () => {
    respondWithCategories();
    const { container, dialog } = await openDialog();
    const form = container.querySelector('form');
    expect(form).not.toBeNull();

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
    expect(categoryFieldset).toHaveFocus();
  });
});
