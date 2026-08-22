import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

import { runWithRequestContext } from './request-context';

export const REQUEST_ID_HEADER = 'X-Request-Id';

/**
 * Backend自身がrequestIdを発行し、レスポンスと非同期Contextへ設定する。
 * 外部入力を採用しないことで、改行等を含む値によるログ汚染やID衝突を防ぐ。
 */
export function requestIdMiddleware(
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  const requestId = randomUUID();
  response.setHeader(REQUEST_ID_HEADER, requestId);
  runWithRequestContext({ requestId }, next);
}
