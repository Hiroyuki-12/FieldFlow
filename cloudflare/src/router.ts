import {
  type FieldFlowBindings,
  parseRenderBackendOrigin,
  parseRenderProxySecret,
} from './bindings';

const BACKEND_STARTING_STATUS = 503;
const BACKEND_RETRY_SECONDS = 5;
const RENDER_UNAVAILABLE_STATUSES = new Set([502, 503, 504]);

/** `/api`境界だけをBackendへ送り、`/api-example`などを誤転送しない。 */
export function isBackendPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

/**
 * 利用者が送ったProxy Headerと内部共有鍵を破棄し、Cloudflare確定値で作り直す。
 * Render側が偽装IPや利用者入力の共有鍵を信頼する事故を防ぐ。
 */
export function createRenderBackendRequest(
  request: Request,
  renderBackendOrigin: string,
  proxySecret: string,
): Request {
  const publicUrl = new URL(request.url);
  const renderOrigin = parseRenderBackendOrigin(renderBackendOrigin);
  const targetUrl = new URL(
    `${publicUrl.pathname}${publicUrl.search}`,
    renderOrigin,
  );
  const headers = new Headers(request.headers);

  headers.delete('forwarded');
  headers.delete('x-forwarded-for');
  headers.delete('x-forwarded-host');
  headers.delete('x-forwarded-proto');
  headers.delete('x-fieldflow-proxy-secret');

  const cloudflareClientIp = request.headers.get('cf-connecting-ip');
  if (cloudflareClientIp) {
    headers.set('x-forwarded-for', cloudflareClientIp);
  }
  headers.set('x-forwarded-host', publicUrl.host);
  headers.set('x-forwarded-proto', 'https');
  headers.set('x-fieldflow-proxy-secret', parseRenderProxySecret(proxySecret));

  return new Request(targetUrl, {
    method: request.method,
    headers,
    body: request.body,
    redirect: request.redirect,
    signal: request.signal,
  });
}

/** Renderの起動待ちをFrontendが安全に判別できる共通レスポンス。 */
export function createBackendStartingResponse(): Response {
  return Response.json(
    {
      statusCode: BACKEND_STARTING_STATUS,
      code: 'BACKEND_STARTING',
      message: 'Backend is starting.',
    },
    {
      status: BACKEND_STARTING_STATUS,
      headers: {
        'Cache-Control': 'no-store',
        'Retry-After': String(BACKEND_RETRY_SECONDS),
        'X-FieldFlow-Backend-State': 'starting',
      },
    },
  );
}

/**
 * RenderへAPIを転送する。Free Web Serviceの起動中やnetwork errorは、
 * HTMLのgateway responseをそのまま返さず、Frontendが再試行できる503へ統一する。
 */
export async function proxyRenderRequest(
  request: Request,
  bindings: Pick<
    FieldFlowBindings,
    'RENDER_BACKEND_ORIGIN' | 'RENDER_PROXY_SECRET'
  >,
  fetchBackend: typeof fetch = fetch,
): Promise<Response> {
  // 設定不備はcold startとして隠さずWorker errorにし、deploy直後に検知できるようにする。
  const backendRequest = createRenderBackendRequest(
    request,
    bindings.RENDER_BACKEND_ORIGIN,
    bindings.RENDER_PROXY_SECRET,
  );

  try {
    const response = await fetchBackend(backendRequest);

    if (RENDER_UNAVAILABLE_STATUSES.has(response.status)) {
      return createBackendStartingResponse();
    }

    return response;
  } catch {
    // 接続例外の詳細には内部host情報が含まれ得るため、応答やconsoleへ出さない。
    return createBackendStartingResponse();
  }
}

export interface FieldFlowRouteHandlers {
  fetchBackend(request: Request): Promise<Response>;
  fetchAsset(request: Request): Promise<Response>;
}

/** APIとStatic Assetsの振り分けを副作用のない関数にし、公開前に単体検証する。 */
export function routeFieldFlowRequest(
  request: Request,
  handlers: FieldFlowRouteHandlers,
): Promise<Response> {
  if (isBackendPath(new URL(request.url).pathname)) {
    return handlers.fetchBackend(request);
  }

  return handlers.fetchAsset(request);
}
