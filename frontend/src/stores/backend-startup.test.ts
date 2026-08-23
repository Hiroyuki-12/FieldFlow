import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getHealth } from '../api/health';
import {
  BACKEND_RETRY_DELAYS_MS,
  useBackendStartupStore,
} from './backend-startup';

vi.mock('../api/health', () => ({ getHealth: vi.fn() }));

const mockedGetHealth = vi.mocked(getHealth);

describe('Backend startup store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    mockedGetHealth.mockReset();
  });

  it('初回health成功時は再試行せずreadyになる', async () => {
    mockedGetHealth.mockResolvedValue({ status: 'ok' });
    const store = useBackendStartupStore();

    await store.waitUntilReady();

    expect(store.status).toBe('ready');
    expect(store.attempt).toBe(1);
    expect(mockedGetHealth).toHaveBeenCalledTimes(1);
  });

  it('Render起動中は待機表示へ移り、間隔後に自動再試行する', async () => {
    mockedGetHealth
      .mockRejectedValueOnce(new Error('starting'))
      .mockResolvedValueOnce({ status: 'ok' });
    const store = useBackendStartupStore();

    const readiness = store.waitUntilReady();
    await vi.waitFor(() => expect(store.status).toBe('waiting'));

    expect(store.nextRetrySeconds).toBe(3);
    await vi.advanceTimersByTimeAsync(BACKEND_RETRY_DELAYS_MS[0]);
    await readiness;

    expect(store.status).toBe('ready');
    expect(store.attempt).toBe(2);
    expect(mockedGetHealth).toHaveBeenCalledTimes(2);
  });

  it('同時に待機を開始してもhealth確認Loopは1本だけにする', async () => {
    mockedGetHealth.mockResolvedValue({ status: 'ok' });
    const store = useBackendStartupStore();

    const first = store.waitUntilReady();
    const second = store.waitUntilReady();
    await Promise.all([first, second]);

    expect(mockedGetHealth).toHaveBeenCalledTimes(1);
  });
});
