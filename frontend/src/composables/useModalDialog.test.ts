import { fireEvent, render, screen } from '@testing-library/vue';
import { defineComponent } from 'vue';
import { describe, expect, it } from 'vitest';

import { useModalDialog } from './useModalDialog';

const DialogHarness = defineComponent({
  setup() {
    return useModalDialog();
  },
  template: `
    <button type="button" @click="openModal('input')">設定を開く</button>
    <dialog ref="dialog" aria-label="設定" @keydown="trapFocus">
      <input aria-label="名前" />
      <button type="button" @click="closeModal">閉じる</button>
    </dialog>
  `,
});

describe('useModalDialog', () => {
  it('初期フォーカスを設定し、閉じた後は起点へ戻す', async () => {
    // ダイアログを閉じた直後にフォーカスが本文先頭へ飛ぶ回帰を防ぐ。
    render(DialogHarness);
    const trigger = screen.getByRole('button', { name: '設定を開く' });
    trigger.focus();

    await fireEvent.click(trigger);
    expect(screen.getByLabelText('名前')).toHaveFocus();

    await fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(trigger).toHaveFocus();
  });

  it('TabとShift+Tabでフォーカスをダイアログ内に保つ', async () => {
    // キーボード操作中に背面画面へ抜けて、意図しない操作を行う事故を防ぐ。
    render(DialogHarness);
    const trigger = screen.getByRole('button', { name: '設定を開く' });
    trigger.focus();
    await fireEvent.click(trigger);

    const input = screen.getByLabelText('名前');
    const closeButton = screen.getByRole('button', { name: '閉じる' });
    closeButton.focus();
    await fireEvent.keyDown(closeButton, { key: 'Tab' });
    expect(input).toHaveFocus();

    await fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
    expect(closeButton).toHaveFocus();
  });
});
