import type { Options } from 'k6/options';

const LOCAL_TARGET = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** 末尾slashを除いた負荷対象。localhost以外は明示許可なしで開始させない。 */
export function performanceBaseUrl(): string {
  const value = (__ENV.PERF_BASE_URL ?? 'http://localhost:8080').replace(
    /\/+$/,
    '',
  );
  if (
    !LOCAL_TARGET.test(value) &&
    __ENV.PERF_ALLOW_REMOTE_TARGET !== 'true'
  ) {
    throw new Error(
      'Remote performance target requires PERF_ALLOW_REMOTE_TARGET=true',
    );
  }
  return value;
}

export function requiredK6EnvironmentValue(name: string): string {
  const value = __ENV[name];
  if (!value) throw new Error(`${name} is required for performance tests`);
  return value;
}

function performanceVus(defaultValue: number): number {
  const value = Number(__ENV.VUS ?? defaultValue);
  if (!Number.isInteger(value) || value < 1 || value > 20) {
    throw new Error('VUS must be an integer between 1 and 20');
  }
  return value;
}

export const performanceThresholds: Options['thresholds'] = {
  // MVPの利用者体験目標。全主要APIの95%が500ms未満で応答することを要求する。
  http_req_duration: ['p(95)<500'],
  // 意図した業務4xxは別Metricへ分離し、通信失敗や想定外Statusだけを数える。
  unexpected_error_rate: ['rate<0.01'],
  checks: ['rate>0.99'],
};

/** Smokeはログインを含む基本疎通を1 VU・1分で繰り返す。 */
export function smokeOptions(): Options {
  return {
    vus: 1,
    duration: __ENV.DURATION ?? '1m',
    thresholds: performanceThresholds,
    noConnectionReuse: false,
    userAgent: 'FieldFlow-k6/2.0',
  };
}

/** 負荷試験は30秒で最大VUへ上げ、2分維持し、30秒で下げる。 */
export function loadOptions(): Options {
  const vus = performanceVus(20);
  const duration = __ENV.DURATION;
  return {
    ...(duration
      ? { vus, duration }
      : {
          stages: [
            { duration: '30s', target: vus },
            { duration: '2m', target: vus },
            { duration: '30s', target: 0 },
          ],
        }),
    thresholds: performanceThresholds,
    noConnectionReuse: false,
    userAgent: 'FieldFlow-k6/2.0',
  };
}
