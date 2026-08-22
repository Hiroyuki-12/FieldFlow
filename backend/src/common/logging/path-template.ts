import type { Request } from 'express';

const UUID_SEGMENT =
  /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi;
const DATE_SEGMENT = /\/\d{4}-\d{2}-\d{2}(?=\/|$)/g;
const NUMBER_SEGMENT = /\/\d+(?=\/|$)/g;

/** 実IDや日付をアクセスログへ残さず、同じAPIを同一Pathとして集計する。 */
export function getTemplatedPath(request: Request): string {
  const route = request.route as { path?: unknown } | undefined;
  if (typeof route?.path === 'string') {
    return route.path.startsWith('/') ? route.path : `/${route.path}`;
  }

  return request.path
    .replace(UUID_SEGMENT, '/:id')
    .replace(DATE_SEGMENT, '/:date')
    .replace(NUMBER_SEGMENT, '/:number');
}
