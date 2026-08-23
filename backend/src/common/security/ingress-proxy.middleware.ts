import { timingSafeEqual } from 'node:crypto';

import type { RequestHandler } from 'express';

const PROXY_SECRET_HEADER = 'x-fieldflow-proxy-secret';

/** 秘密値を通常の文字列比較へ渡さず、長さが同じ場合は一定時間比較する。 */
function matchesProxySecret(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

/**
 * Renderの公開URLから業務APIを直接呼ばせず、共有鍵を持つCloudflare Workerだけを通す。
 * Render自身のhealth checkには独自Headerを付けられないため、`/api/health`だけは例外にする。
 */
export function createIngressProxyMiddleware(
  expectedSecret: string,
): RequestHandler {
  return (request, response, next) => {
    if (request.path === '/api/health') {
      next();
      return;
    }

    if (
      matchesProxySecret(request.get(PROXY_SECRET_HEADER), expectedSecret)
    ) {
      next();
      return;
    }

    response.status(403).json({
      statusCode: 403,
      code: 'INGRESS_PROXY_REQUIRED',
      message: 'Forbidden',
    });
  };
}
