import { sleep } from 'k6';
import http from 'k6/http';

import { authenticatedParams, loginAsPerformanceWorker } from '../support/auth.ts';
import { performanceBaseUrl, smokeOptions } from '../support/config.ts';
import { todayInTokyo } from '../support/date.ts';
import { observeResponse } from '../support/metrics.ts';
export { createSanitizedSummary as handleSummary } from '../support/summary.ts';

interface SmokeSetupData {
  accessToken: string;
  workDate: string;
}

export const options = smokeOptions();

export function setup(): SmokeSetupData {
  return {
    accessToken: loginAsPerformanceWorker(),
    workDate: todayInTokyo(),
  };
}

/** PERF-SMOKE: 公開healthと認証済み日別表取得の最小経路を継続確認する。 */
export default function runSmoke(data: SmokeSetupData): void {
  const healthResponse = http.get(`${performanceBaseUrl()}/api/health`, {
    tags: { name: 'GET /api/health' },
  });
  observeResponse(healthResponse, 'health', [200]);

  const checklistResponse = http.get(
    `${performanceBaseUrl()}/api/v1/daily-checklists/${data.workDate}`,
    authenticatedParams(
      data.accessToken,
      'GET /api/v1/daily-checklists/:date',
    ),
  );
  observeResponse(checklistResponse, 'smoke_checklist_get', [200]);
  sleep(1);
}
