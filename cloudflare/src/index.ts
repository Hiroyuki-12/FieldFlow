import type { FieldFlowBindings } from './bindings';
import { proxyRenderRequest, routeFieldFlowRequest } from './router';

/**
 * Cloudflareを画面とAPIの単一公開OriginにするWorker。
 * `/api/*`だけをRenderへ転送し、Refresh Cookieを別Originへ露出させない。
 */
export default {
  async fetch(request: Request, env: FieldFlowBindings): Promise<Response> {
    return routeFieldFlowRequest(request, {
      fetchBackend: (backendRequest) =>
        proxyRenderRequest(backendRequest, env),
      fetchAsset: (assetRequest) => env.ASSETS.fetch(assetRequest),
    });
  },
};
