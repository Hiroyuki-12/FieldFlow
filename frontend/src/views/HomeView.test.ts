import { render, screen } from '@testing-library/vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import HomeView from './HomeView.vue';

const getHealthMock = vi.fn();

vi.mock('../api/health', () => ({
  getHealth: () => getHealthMock(),
}));

describe('HomeView', () => {
  beforeEach(() => {
    getHealthMock.mockReset();
  });

  it('BackendとDBへ接続できたことを表示する', async () => {
    getHealthMock.mockResolvedValue({ status: 'ok' });

    render(HomeView);

    expect(await screen.findByText('接続できました')).toBeInTheDocument();
  });

  it('接続失敗時は確認方法が分かるメッセージを表示する', async () => {
    getHealthMock.mockRejectedValue(new Error('connection failed'));

    render(HomeView);

    expect(
      await screen.findByText('接続できません。BackendとMySQLの起動状態を確認してください。'),
    ).toBeInTheDocument();
  });
});
