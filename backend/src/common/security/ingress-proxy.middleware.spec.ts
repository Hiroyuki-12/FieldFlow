import type { NextFunction, Request, Response } from 'express';

import { createIngressProxyMiddleware } from './ingress-proxy.middleware';

describe('Ingress proxy middleware', () => {
  const expectedSecret = 'render-proxy-secret-at-least-32-bytes';

  function execute(
    path: string,
    providedSecret?: string,
  ): { next: NextFunction; status: jest.Mock; json: jest.Mock } {
    const next = jest.fn() as NextFunction;
    const status = jest.fn();
    const json = jest.fn();
    status.mockReturnValue({ json });
    const request = {
      path,
      get: jest.fn((name: string) =>
        name === 'x-fieldflow-proxy-secret' ? providedSecret : undefined,
      ),
    } as unknown as Request;
    const response = { status } as unknown as Response;

    createIngressProxyMiddleware(expectedSecret)(request, response, next);
    return { next, status, json };
  }

  it('共有鍵が一致するWorker経由のAPIを通す', () => {
    const result = execute('/api/v1/tools', expectedSecret);

    expect(result.next).toHaveBeenCalledTimes(1);
    expect(result.status).not.toHaveBeenCalled();
  });

  it('共有鍵がないRender直アクセスを403で拒否する', () => {
    const result = execute('/api/v1/tools');

    expect(result.next).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(403);
    expect(result.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INGRESS_PROXY_REQUIRED' }),
    );
  });

  it('Render自身が使うhealth checkは共有鍵なしで通す', () => {
    const result = execute('/api/health');

    expect(result.next).toHaveBeenCalledTimes(1);
  });
});
