import { fail, sleep } from 'k6';
import http from 'k6/http';

import { authenticatedParams, loginAsPerformanceWorker } from '../support/auth.ts';
import { loadOptions, performanceBaseUrl } from '../support/config.ts';
import { addDays, todayInTokyo } from '../support/date.ts';
import { observeResponse } from '../support/metrics.ts';
export { createSanitizedSummary as handleSummary } from '../support/summary.ts';

interface ChecklistItem {
  id: string;
  takeoutQuantity: number;
  version: number;
}

interface ChecklistPeriod {
  period: string;
  items: ChecklistItem[];
}

interface ChecklistResponseBody {
  periods: ChecklistPeriod[];
}

interface ChecklistSetupData {
  accessToken: string;
  workDates: string[];
}

export const options = loadOptions();

export function setup(): ChecklistSetupData {
  const today = todayInTokyo();
  return {
    accessToken: loginAsPerformanceWorker(),
    // 最大20 VUそれぞれが別日を担当し、楽観ロック競合を通常性能へ混ぜない。
    workDates: Array.from({ length: 20 }, (_, index) => addDays(today, index)),
  };
}

/** PERF-CHECK: 各VUが専用日の日別表取得と1行更新を繰り返す。 */
export default function runChecklistLoad(data: ChecklistSetupData): void {
  const workDate = data.workDates[__VU - 1];
  if (!workDate) fail(`No performance fixture is assigned to VU ${__VU}`);

  const checklistResponse = http.get(
    `${performanceBaseUrl()}/api/v1/daily-checklists/${workDate}`,
    authenticatedParams(
      data.accessToken,
      'GET /api/v1/daily-checklists/:date',
    ),
  );
  if (!observeResponse(checklistResponse, 'checklist_get', [200])) {
    sleep(8);
    return;
  }

  const checklist = checklistResponse.json() as unknown as ChecklistResponseBody;
  const period = checklist.periods[0];
  const item = period?.items[0];
  if (!period || !item) fail(`Checklist fixture is incomplete for ${workDate}`);

  const nextQuantity = item.takeoutQuantity === 1 ? 2 : 1;
  const updateResponse = http.patch(
    `${performanceBaseUrl()}/api/v1/daily-checklists/${workDate}/periods/${period.period}/items/${item.id}`,
    JSON.stringify({
      takeoutQuantity: nextQuantity,
      checked: false,
      version: item.version,
    }),
    authenticatedParams(
      data.accessToken,
      'PATCH /api/v1/daily-checklists/:date/periods/:period/items/:itemId',
    ),
  );
  // この基準シナリオではVUごとに行を分けるため、409も想定外として扱う。
  observeResponse(updateResponse, 'checklist_item_update', [200]);

  // 実利用者の入力間隔を含め、一般API 600回/分の防御層を試験自身が踏み越えない。
  sleep(8);
}
