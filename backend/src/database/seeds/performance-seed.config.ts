import Joi from 'joi';

export const PERFORMANCE_DATABASE_NAME = 'fieldflow_perf';

export interface PerformanceSeedConfig {
  workerPassword: string;
}

export interface PerformanceDatabaseAdminConfig {
  host: string;
  port: number;
  adminUser: string;
  adminPassword: string;
  appUser: string;
}

/** 性能試験専用DB以外へ初期化処理を向けた場合、接続より前に停止させる。 */
export class PerformanceSeedConfigValidationError extends Error {}

const commonGuardSchema = {
  NODE_ENV: Joi.string().valid('test').required(),
  DB_NAME: Joi.string().valid(PERFORMANCE_DATABASE_NAME).required(),
};

interface PerformanceSeedEnvironment {
  NODE_ENV: 'test';
  DB_NAME: typeof PERFORMANCE_DATABASE_NAME;
  PERF_WORKER_PASSWORD: string;
}

interface PerformanceDatabaseAdminEnvironment {
  NODE_ENV: 'test';
  DB_NAME: typeof PERFORMANCE_DATABASE_NAME;
  DB_HOST: string;
  DB_PORT: number;
  PERF_DB_ADMIN_USER: string;
  PERF_DB_ADMIN_PASSWORD: string;
  DB_USER: string;
}

const seedEnvironmentSchema = Joi.object<PerformanceSeedEnvironment>({
  ...commonGuardSchema,
  PERF_WORKER_PASSWORD: Joi.string().min(12).max(128).required(),
}).unknown(true);

const databaseAdminEnvironmentSchema =
  Joi.object<PerformanceDatabaseAdminEnvironment>({
    ...commonGuardSchema,
    DB_HOST: Joi.string().hostname().required(),
    DB_PORT: Joi.number().integer().min(1).max(65535).required(),
    PERF_DB_ADMIN_USER: Joi.string().min(1).required(),
    PERF_DB_ADMIN_PASSWORD: Joi.string().min(1).required(),
    DB_USER: Joi.string().min(1).required(),
  }).unknown(true);

function throwConfigurationError(error: Joi.ValidationError): never {
  // 秘密値は出さず、修正対象の環境変数名と検証理由だけを利用者へ伝える。
  throw new PerformanceSeedConfigValidationError(
    `Performance database configuration is invalid: ${error.message}`,
  );
}

/** k6ログイン用パスワードをSeed実行時だけ読み込む。 */
export function readPerformanceSeedConfig(
  environment: NodeJS.ProcessEnv,
): PerformanceSeedConfig {
  const result = seedEnvironmentSchema.validate(environment, {
    abortEarly: false,
  });
  if (result.error) throwConfigurationError(result.error);

  return { workerPassword: result.value.PERF_WORKER_PASSWORD };
}

/** ローカルMySQLへ性能試験専用DBを追加するときだけ使う管理接続設定。 */
export function readPerformanceDatabaseAdminConfig(
  environment: NodeJS.ProcessEnv,
): PerformanceDatabaseAdminConfig {
  const result = databaseAdminEnvironmentSchema.validate(environment, {
    abortEarly: false,
  });
  if (result.error) throwConfigurationError(result.error);

  return {
    host: result.value.DB_HOST,
    port: result.value.DB_PORT,
    adminUser: result.value.PERF_DB_ADMIN_USER,
    adminPassword: result.value.PERF_DB_ADMIN_PASSWORD,
    appUser: result.value.DB_USER,
  };
}
