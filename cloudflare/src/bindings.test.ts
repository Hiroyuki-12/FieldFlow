import { describe, expect, it } from 'vitest';

import {
  parseRenderBackendOrigin,
  parseRenderProxySecret,
} from './bindings';

describe('Render backend binding', () => {
  it('HTTPSのOriginだけを接続先として受け付ける', () => {
    expect(
      parseRenderBackendOrigin('https://fieldflow-api.onrender.com').origin,
    ).toBe('https://fieldflow-api.onrender.com');
  });

  it.each([
    'http://fieldflow-api.onrender.com',
    'https://user:password@fieldflow-api.onrender.com',
    'https://fieldflow-api.onrender.com/api',
  ])('危険または曖昧な接続先%sを拒否する', (origin) => {
    expect(() => parseRenderBackendOrigin(origin)).toThrow(
      'RENDER_BACKEND_ORIGIN must be an HTTPS origin.',
    );
  });

  it('32文字未満のproxy共有鍵を拒否する', () => {
    expect(() => parseRenderProxySecret('too-short')).toThrow(
      'RENDER_PROXY_SECRET must be at least 32 characters.',
    );
  });
});
