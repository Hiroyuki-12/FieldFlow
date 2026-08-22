import { requiredK6EnvironmentValue } from './config.ts';

interface K6SummaryData {
  metrics: Record<string, unknown>;
  root_group: unknown;
}

interface K6Metric {
  values?: Record<string, number>;
}

function metricValue(
  data: K6SummaryData,
  metricName: string,
  valueName: string,
): number | undefined {
  const metric = data.metrics[metricName] as K6Metric | undefined;
  return metric?.values?.[valueName];
}

function safeConsoleSummary(data: K6SummaryData): string {
  const p95 = metricValue(data, 'http_req_duration', 'p(95)');
  const maximum = metricValue(data, 'http_req_duration', 'max');
  const unexpectedErrorRate = metricValue(
    data,
    'unexpected_error_rate',
    'rate',
  );
  const checkRate = metricValue(data, 'checks', 'rate');
  const requestCount = metricValue(data, 'http_reqs', 'count');
  return [
    '',
    'FieldFlow sanitized performance summary',
    `requests: ${requestCount ?? 'n/a'}`,
    `http_req_duration p(95): ${p95 === undefined ? 'n/a' : `${p95.toFixed(2)}ms`}`,
    `http_req_duration max: ${maximum === undefined ? 'n/a' : `${maximum.toFixed(2)}ms`}`,
    `unexpected_error_rate: ${unexpectedErrorRate === undefined ? 'n/a' : `${(unexpectedErrorRate * 100).toFixed(2)}%`}`,
    `checks: ${checkRate === undefined ? 'n/a' : `${(checkRate * 100).toFixed(2)}%`}`,
    '',
  ].join('\n');
}

/**
 * 標準summary-exportはSetup戻り値も保存するため使用しない。
 * Access Tokenを除外し、比較に必要なMetricとcheck構造だけをJSONへ残す。
 */
export function createSanitizedSummary(
  data: K6SummaryData,
): Record<string, string> {
  const outputPath = requiredK6EnvironmentValue('PERF_SUMMARY_PATH');
  return {
    stdout: safeConsoleSummary(data),
    [outputPath]: JSON.stringify(
      { metrics: data.metrics, root_group: data.root_group },
      null,
      2,
    ),
  };
}
