export interface HealthResponse {
  status: 'ok';
}

const DEFAULT_HEALTH_TIMEOUT_MS = 4_000;

/**
 * BackendとDBの疎通状態を取得する。
 * health APIは業務APIのバージョン配下ではなく、ALBからも利用する`/api/health`に固定する。
 */
export async function getHealth(
  timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS,
): Promise<HealthResponse> {
  const abortController = new AbortController();
  // Renderのコールドスタート中に1リクエストを待ち続けず、画面表示と次のhealth再試行へ進む。
  const timeout = window.setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const response = await fetch('/api/health', {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new Error('Health APIの取得に失敗しました。');
    }

    return (await response.json()) as HealthResponse;
  } finally {
    window.clearTimeout(timeout);
  }
}
