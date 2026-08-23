import { render, screen } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';

import BackendStartupView from './BackendStartupView.vue';

describe('BackendStartupView', () => {
  it('Render起動中の理由と自動再試行をLive Regionで伝える', () => {
    render(BackendStartupView, {
      props: { status: 'waiting', attempt: 2, nextRetrySeconds: 5 },
    });

    expect(
      screen.getByRole('heading', { name: 'バックエンドを起動しています' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/アクセスがない時間が続くと自動停止/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      '自動で再試行します（確認 2 回目・次回まで最大 5 秒）',
    );
  });
});
