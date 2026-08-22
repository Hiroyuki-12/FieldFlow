import { render, screen } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';

import AppNotice from './AppNotice.vue';

describe('AppNotice', () => {
  it('成功を文字とpoliteなLive Regionで伝える', () => {
    // 色を判別できなくても、完了状態と本文を読み上げられることを守る。
    render(AppNotice, {
      props: { tone: 'success' },
      slots: { default: '保存しました。' },
    });

    const notice = screen.getByRole('status');
    expect(notice).toHaveAttribute('aria-live', 'polite');
    expect(notice).toHaveTextContent('完了');
    expect(notice).toHaveTextContent('保存しました。');
  });

  it('失敗をassertiveなAlertとして伝える', () => {
    // 通信失敗を次の操作より先に通知できない回帰を防ぐ。
    render(AppNotice, {
      props: { tone: 'error', title: '読み込めませんでした' },
      slots: { default: '再読み込みしてください。' },
    });

    const notice = screen.getByRole('alert');
    expect(notice).toHaveAttribute('aria-live', 'assertive');
    expect(notice).toHaveTextContent('読み込めませんでした');
  });
});
