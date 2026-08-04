export interface HealthResponse {
  status: 'ok';
}

/**
 * BackendとDBの疎通状態を取得する。
 * health APIは業務APIのバージョン配下ではなく、ALBからも利用する`/api/health`に固定する。
 */
export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health', {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Health APIの取得に失敗しました。');
  }

  return (await response.json()) as HealthResponse;
}
