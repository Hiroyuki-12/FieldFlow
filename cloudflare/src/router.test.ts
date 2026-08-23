import { describe, expect, it, vi } from 'vitest';

import {
  createRenderBackendRequest,
  isBackendPath,
  proxyRenderRequest,
  routeFieldFlowRequest,
} from './router';

const bindings = {
  RENDER_BACKEND_ORIGIN: 'https://fieldflow-api.onrender.com',
  RENDER_PROXY_SECRET: 'worker-to-render-secret-at-least-32-bytes',
};

describe('Cloudflare Worker routing', () => {
  it.each([
    ['/api', true],
    ['/api/health', true],
    ['/api/v1/auth/login', true],
    ['/api-example', false],
    ['/', false],
  ])('%sのBackend routing判定は%s', (pathname, expected) => {
    expect(isBackendPath(pathname)).toBe(expected);
  });

  it('APIはRenderへ送り、それ以外はStatic Assetsへ送る', async () => {
    const fetchBackend = vi.fn().mockResolvedValue(new Response('backend'));
    const fetchAsset = vi.fn().mockResolvedValue(new Response('asset'));

    const apiResponse = await routeFieldFlowRequest(
      new Request('https://fieldflow.example/api/health'),
      { fetchBackend, fetchAsset },
    );
    const assetResponse = await routeFieldFlowRequest(
      new Request('https://fieldflow.example/tools'),
      { fetchBackend, fetchAsset },
    );

    expect(await apiResponse.text()).toBe('backend');
    expect(await assetResponse.text()).toBe('asset');
    expect(fetchBackend).toHaveBeenCalledTimes(1);
    expect(fetchAsset).toHaveBeenCalledTimes(1);
  });

  it('path・queryをRenderへ保ち、Proxy Headerと共有鍵を安全な値へ置き換える', () => {
    const request = new Request(
      'https://fieldflow.example/api/v1/tools?page=2',
      {
        headers: {
          'cf-connecting-ip': '203.0.113.10',
          forwarded: 'for=attacker.example',
          'x-forwarded-for': '198.51.100.99',
          'x-forwarded-host': 'attacker.example',
          'x-forwarded-proto': 'http',
          'x-fieldflow-proxy-secret': 'attacker-secret',
        },
      },
    );

    const forwardedRequest = createRenderBackendRequest(
      request,
      bindings.RENDER_BACKEND_ORIGIN,
      bindings.RENDER_PROXY_SECRET,
    );

    expect(forwardedRequest.url).toBe(
      'https://fieldflow-api.onrender.com/api/v1/tools?page=2',
    );
    expect(forwardedRequest.headers.get('forwarded')).toBeNull();
    expect(forwardedRequest.headers.get('x-forwarded-for')).toBe(
      '203.0.113.10',
    );
    expect(forwardedRequest.headers.get('x-forwarded-host')).toBe(
      'fieldflow.example',
    );
    expect(forwardedRequest.headers.get('x-forwarded-proto')).toBe('https');
    expect(forwardedRequest.headers.get('x-fieldflow-proxy-secret')).toBe(
      'worker-to-render-secret-at-least-32-bytes',
    );
  });

  it.each([502, 503, 504])(
    'Renderが%sの場合はFrontend用の起動待ち503へ統一する',
    async (status) => {
      const response = await proxyRenderRequest(
        new Request('https://fieldflow.example/api/health'),
        bindings,
        vi.fn().mockResolvedValue(new Response(null, { status })),
      );

      expect(response.status).toBe(503);
      expect(response.headers.get('x-fieldflow-backend-state')).toBe(
        'starting',
      );
      expect(response.headers.get('retry-after')).toBe('5');
      await expect(response.json()).resolves.toMatchObject({
        code: 'BACKEND_STARTING',
      });
    },
  );

  it('Renderへの接続例外も秘密情報を含まない起動待ち503へ変換する', async () => {
    const response = await proxyRenderRequest(
      new Request('https://fieldflow.example/api/health'),
      bindings,
      vi.fn().mockRejectedValue(new Error('internal render detail')),
    );

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('internal render detail');
  });

  it('正常なRender responseのSet-Cookieを変更せず返す', async () => {
    const upstream = new Response('{}', {
      status: 200,
      headers: {
        'Set-Cookie':
          'fieldflowRefreshToken=value; Path=/api/v1/auth; HttpOnly; Secure; SameSite=Lax',
      },
    });

    const response = await proxyRenderRequest(
      new Request('https://fieldflow.example/api/v1/auth/login'),
      bindings,
      vi.fn().mockResolvedValue(upstream),
    );

    expect(response).toBe(upstream);
    expect(response.headers.get('set-cookie')).toContain(
      'Path=/api/v1/auth',
    );
  });
});
