import { randomInt } from 'node:crypto';

// 見間違えやすい0/O/1/lを除き、安全な共有時の転記ミスも減らす。
const TEMPORARY_PASSWORD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-._~';
const TEMPORARY_PASSWORD_LENGTH = 16;

/** Math.randomではなくOS由来の暗号学的乱数から、一度限りの仮パスワードを作る。 */
export function createTemporaryPassword(): string {
  return Array.from({ length: TEMPORARY_PASSWORD_LENGTH }, () =>
    TEMPORARY_PASSWORD_ALPHABET.charAt(
      randomInt(TEMPORARY_PASSWORD_ALPHABET.length),
    ),
  ).join('');
}
