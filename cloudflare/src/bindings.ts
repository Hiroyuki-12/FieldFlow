/** Workerが利用するStatic Assets、Render接続先、Proxy共有鍵のbinding一覧。 */
export interface FieldFlowBindings {
  ASSETS: Fetcher;
  RENDER_BACKEND_ORIGIN: string;
  RENDER_PROXY_SECRET: string;
}

/**
 * Render接続先をHTTPS Originだけに制限する。
 * パスや認証情報を許すとAPI pathの欠落や秘密値漏洩につながるため、起動前提を狭く保つ。
 */
export function parseRenderBackendOrigin(value: string): URL {
  const origin = new URL(value);
  const hasOnlyOrigin =
    origin.protocol === 'https:' &&
    origin.username === '' &&
    origin.password === '' &&
    origin.pathname === '/' &&
    origin.search === '' &&
    origin.hash === '';

  if (!hasOnlyOrigin) {
    throw new Error('RENDER_BACKEND_ORIGIN must be an HTTPS origin.');
  }

  return origin;
}

/** Render側と同じ最低長をWorkerでも検証し、未設定や弱い共有鍵でproxyしない。 */
export function parseRenderProxySecret(value: string): string {
  if (typeof value !== 'string' || value.length < 32) {
    throw new Error('RENDER_PROXY_SECRET must be at least 32 characters.');
  }
  return value;
}
