import Joi from 'joi';

export interface InitialAdminSeedConfig {
  name: string;
  loginId: string;
  password: string;
}

/** 秘密値を含めず、どのSeed設定を直すべきかだけをCLIへ伝える。 */
export class SeedConfigValidationError extends Error {}

interface InitialAdminSeedEnvironment {
  INITIAL_ADMIN_NAME: string;
  INITIAL_ADMIN_LOGIN_ID: string;
  INITIAL_ADMIN_PASSWORD: string;
}

const initialAdminEnvironmentSchema = Joi.object<InitialAdminSeedEnvironment>({
  INITIAL_ADMIN_NAME: Joi.string().trim().min(1).max(100).required(),
  INITIAL_ADMIN_LOGIN_ID: Joi.string()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9._-]{4,50}$/)
    .required(),
  // 空白やUnicodeを許可し、文字種の形式的な強制より十分な長さを優先する。
  INITIAL_ADMIN_PASSWORD: Joi.string().min(12).max(128).required(),
}).unknown(true);

/**
 * Seed専用の環境変数を検証し、アプリ通常起動とは分離する。
 * 初期管理者パスワードは通常のNestJS起動には不要なので、Seed実行時だけメモリへ読み込む。
 */
export function readInitialAdminSeedConfig(
  environment: NodeJS.ProcessEnv,
): InitialAdminSeedConfig {
  const validationResult = initialAdminEnvironmentSchema.validate(environment, {
    abortEarly: false,
  });

  if (validationResult.error) {
    // Joiは値を表示せずキーと理由だけを返すため、秘密の平文パスワードをログへ出さない。
    throw new SeedConfigValidationError(
      `Initial admin seed configuration is invalid: ${validationResult.error.message}`,
    );
  }

  return {
    name: validationResult.value.INITIAL_ADMIN_NAME,
    loginId: validationResult.value.INITIAL_ADMIN_LOGIN_ID,
    password: validationResult.value.INITIAL_ADMIN_PASSWORD,
  };
}
