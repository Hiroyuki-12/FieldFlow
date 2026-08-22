import type { NextFunction, Request, Response } from 'express';

import { getRequestId } from './request-context';
import {
  REQUEST_ID_HEADER,
  requestIdMiddleware,
} from './request-id.middleware';

describe('requestIdMiddleware', () => {
  it('外部のrequestIdを採用せずUUIDを生成してHeaderとContextへ設定する', () => {
    const setHeader = jest.fn();
    let contextRequestId: string | undefined;
    const next = jest.fn(() => {
      contextRequestId = getRequestId();
    });
    const request = {
      headers: { 'x-request-id': 'attacker-controlled-id' },
    } as unknown as Request;
    const response = { setHeader } as unknown as Response;

    requestIdMiddleware(request, response, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect(contextRequestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(contextRequestId).not.toBe('attacker-controlled-id');
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, contextRequestId);
  });
});
