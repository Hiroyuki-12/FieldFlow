import { check } from 'k6';
import type { Response } from 'k6/http';
import { Counter, Rate } from 'k6/metrics';

const unexpectedErrorRate = new Rate('unexpected_error_rate');
const expectedBusinessResponses = new Counter('expected_business_responses');

/**
 * 成功Status、意図した業務4xx、想定外エラーを分離する。
 * 409競合を意図的に測る将来シナリオでも、性能障害率へ混ぜず比較できるようにするため。
 */
export function observeResponse(
  response: Response,
  operation: string,
  successStatuses: number[],
  expectedBusinessStatuses: number[] = [],
): boolean {
  const success = successStatuses.includes(response.status);
  const expectedBusinessResponse = expectedBusinessStatuses.includes(
    response.status,
  );
  expectedBusinessResponses.add(expectedBusinessResponse, { operation });
  unexpectedErrorRate.add(!(success || expectedBusinessResponse), {
    operation,
  });

  return check(
    response,
    { [`${operation}: expected status`]: () => success || expectedBusinessResponse },
    { operation },
  );
}
