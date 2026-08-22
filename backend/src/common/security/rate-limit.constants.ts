/**
 * 一般APIのIP単位制限。現場の同一ネットワークから20人が利用しても通常操作を妨げず、
 * 明らかな短時間大量アクセスだけを抑える初期値として1分600回にする。
 */
export const GENERAL_API_RATE_LIMIT = 600;
export const GENERAL_API_RATE_TTL_MS = 60 * 1000;
