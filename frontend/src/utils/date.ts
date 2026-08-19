/** Backendと同じAsia/Tokyo基準で「今日」を求め、日付境界の画面/API不一致を防ぐ。 */
export function todayInTokyo(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/** YYYY-MM-DDを端末のタイムゾーンで前日へずらさず、日本語の業務日として表示する。 */
export function formatJapaneseDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const weekday = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'UTC',
    weekday: 'short',
  }).format(date);
  return `${Number(month)}月${Number(day)}日（${weekday}）`;
}
