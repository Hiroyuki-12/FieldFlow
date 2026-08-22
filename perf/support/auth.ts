import { fail } from 'k6';
import http, { type Params } from 'k6/http';

import {
  performanceBaseUrl,
  requiredK6EnvironmentValue,
} from './config.ts';
import { observeResponse } from './metrics.ts';

interface LoginResponseBody {
  accessToken?: unknown;
}

/** Setupで1回だけログインし、IPログイン制限を負荷本体の結果へ混ぜない。 */
export function loginAsPerformanceWorker(): string {
  const response = http.post(
    `${performanceBaseUrl()}/api/v1/auth/login`,
    JSON.stringify({
      loginId: 'perf.worker',
      password: requiredK6EnvironmentValue('PERF_WORKER_PASSWORD'),
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'POST /api/v1/auth/login' },
    },
  );
  if (!observeResponse(response, 'login', [200])) {
    fail('Performance worker login failed');
  }

  const body = response.json() as LoginResponseBody;
  if (typeof body.accessToken !== 'string' || body.accessToken.length === 0) {
    fail('Login response did not contain an access token');
  }
  return body.accessToken as string;
}

/** 生Tokenを出力せず、認証済みAPIのHeaderへだけ渡す。 */
export function authenticatedParams(
  accessToken: string,
  requestName: string,
): Params {
  return {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    tags: { name: requestName },
  };
}
