/** Refresh Tokenを保存するHttpOnly Cookie名。FrontendのJavaScriptからは読み取らない。 */
export const REFRESH_TOKEN_COOKIE_NAME = 'fieldflowRefreshToken';

/** Refresh Cookieを認証API以外へ送信せず、漏洩する経路を狭める。 */
export const REFRESH_TOKEN_COOKIE_PATH = '/api/v1/auth';

/** 連続失敗によるアカウントロックの基準。 */
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
// JavaScriptの時刻計算はミリ秒なので、15分を「分×秒×ミリ秒」で表す。
export const ACCOUNT_LOCK_DURATION_MS = 15 * 60 * 1000;

/** 1つのIPからの大量試行を抑える。アカウントロックとは別の防御層として使う。 */
export const LOGIN_IP_RATE_LIMIT = 20;
export const LOGIN_IP_RATE_TTL_MS = 15 * 60 * 1000;
