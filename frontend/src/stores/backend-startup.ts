import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import { getHealth } from '../api/health';

export type BackendStartupStatus = 'checking' | 'waiting' | 'ready';

// 短い間隔から始めて最大10秒へ抑え、起動を検知しつつ無料サービスへ過剰なpingを送らない。
export const BACKEND_RETRY_DELAYS_MS = [3_000, 5_000, 8_000, 10_000] as const;

/** Render Free Web Serviceのhealthを確認し、利用可能になるまで1本の再試行Loopへ集約する。 */
export const useBackendStartupStore = defineStore('backend-startup', () => {
  const status = ref<BackendStartupStatus>('checking');
  const attempt = ref(0);
  const nextRetrySeconds = ref(0);
  let readinessPromise: Promise<void> | null = null;

  const isReady = computed(() => status.value === 'ready');

  async function waitBeforeRetry(delayMs: number): Promise<void> {
    nextRetrySeconds.value = Math.ceil(delayMs / 1_000);
    await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
  }

  async function runHealthChecks(): Promise<void> {
    for (;;) {
      attempt.value += 1;
      try {
        await getHealth();
        status.value = 'ready';
        nextRetrySeconds.value = 0;
        return;
      } catch {
        // 通信例外の内部詳細は画面へ出さず、Render起動または通信回復を同じ手順で待つ。
        status.value = 'waiting';
        const retryIndex = Math.min(
          attempt.value - 1,
          BACKEND_RETRY_DELAYS_MS.length - 1,
        );
        await waitBeforeRetry(BACKEND_RETRY_DELAYS_MS[retryIndex]);
      }
    }
  }

  function waitUntilReady(): Promise<void> {
    if (status.value === 'ready') return Promise.resolve();
    if (readinessPromise) return readinessPromise;

    readinessPromise = runHealthChecks().finally(() => {
      readinessPromise = null;
    });
    return readinessPromise;
  }

  function markUnavailable(): void {
    if (status.value === 'ready') {
      status.value = 'waiting';
      attempt.value = 0;
    }
    // 複数APIが同時に503でも、既存Promiseを再利用してhealthの集中を防ぐ。
    void waitUntilReady();
  }

  return {
    status,
    attempt,
    nextRetrySeconds,
    isReady,
    waitUntilReady,
    markUnavailable,
  };
});
