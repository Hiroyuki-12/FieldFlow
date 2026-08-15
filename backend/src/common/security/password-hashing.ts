import { argon2id, hash, verify } from 'argon2';

/**
 * Seedと通常の認証処理で共有するArgon2id設定。
 * 保存済みハッシュの強度が処理経路によって変わる事故を防ぐため、1か所で管理する。
 */
export const ARGON2_OPTIONS = {
  // Argon2の3方式のうち、パスワード保存向けのArgon2idを明示する。
  type: argon2id,
  // 1回の計算で約19MiBを使い、GPUによる大量試行のコストを上げる。
  memoryCost: 19 * 1024,
  // 同じ計算を2回反復する。
  timeCost: 2,
  // 1つの計算を1並列で実行し、FargateのCPU使用量を予測しやすくする。
  parallelism: 1,
} as const;

// 実在ユーザーとは無関係な検証専用ハッシュ。平文パスワードや利用可能な認証情報ではない。
// 存在しないloginIdでもArgon2id検証を行い、応答時間からユーザーの存在を推測されにくくする。
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$5Hme4AA8O+gNkun7SZ8S8Q$GrzthZfL10/jafNNGiKmAy/K00CHWnRc1AjwtWrXDqY';

/** 平文をDB保存用のArgon2idハッシュへ変換する。 */
export async function hashPassword(password: string): Promise<string> {
  // `await`は時間のかかるハッシュ計算完了を待ち、完成した文字列だけを呼び出し元へ返す。
  return hash(password, ARGON2_OPTIONS);
}

/**
 * パスワードをハッシュと照合する。
 * DB値が壊れていても内部エラーへせず認証失敗として扱い、ハッシュ文字列を例外へ露出させない。
 */
export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** ユーザー不存在時にも通常ログインと同程度のパスワード検証を行う。 */
export async function verifyDummyPassword(password: string): Promise<void> {
  await verifyPassword(DUMMY_PASSWORD_HASH, password);
}
