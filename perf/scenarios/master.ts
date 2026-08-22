import { check, sleep } from 'k6';
import http from 'k6/http';

import { authenticatedParams, loginAsPerformanceWorker } from '../support/auth.ts';
import { loadOptions, performanceBaseUrl } from '../support/config.ts';
import { observeResponse } from '../support/metrics.ts';
export { createSanitizedSummary as handleSummary } from '../support/summary.ts';

interface ToolListResponseBody {
  items?: unknown[];
  total?: number;
}

interface MasterSetupData {
  accessToken: string;
}

export const options = loadOptions();

export function setup(): MasterSetupData {
  return { accessToken: loginAsPerformanceWorker() };
}

/** PERF-MASTER: 200件の道具マスターを、画面の最大ページサイズで検索する。 */
export default function runMasterLoad(data: MasterSetupData): void {
  const response = http.get(
    `${performanceBaseUrl()}/api/v1/tools?page=1&pageSize=100&status=ACTIVE`,
    authenticatedParams(data.accessToken, 'GET /api/v1/tools'),
  );
  if (observeResponse(response, 'tool_list', [200])) {
    const body = response.json() as ToolListResponseBody;
    check(body, {
      'tool_list: seeded total is returned': (value) =>
        typeof value.total === 'number' && value.total >= 200,
      'tool_list: first page contains 100 items': (value) =>
        Array.isArray(value.items) && value.items.length === 100,
    });
  }

  // 20 VUでもレート制限以下の現実的な一覧再読込頻度へ保つ。
  sleep(5);
}
