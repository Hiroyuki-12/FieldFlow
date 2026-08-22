import Joi from 'joi';

export const E2E_DATABASE_NAME = 'fieldflow_e2e';

export interface E2ESeedConfig {
  adminPassword: string;
  workerPassword: string;
  firstLoginPassword: string;
}

export interface E2EDatabaseAdminConfig {
  host: string;
  port: number;
  adminUser: string;
  adminPassword: string;
  appUser: string;
}

/** E2E専用DB以外へ初期化処理を向けた場合、接続より前に停止させる。 */
export class E2ESeedConfigValidationError extends Error {}

const commonGuardSchema = {
  NODE_ENV: Joi.string().valid('test').required(),
  DB_NAME: Joi.string().valid(E2E_DATABASE_NAME).required(),
};

interface E2ESeedEnvironment {
  NODE_ENV: 'test';
  DB_NAME: typeof E2E_DATABASE_NAME;
  E2E_ADMIN_PASSWORD: string;
  E2E_WORKER_PASSWORD: string;
  E2E_FIRST_LOGIN_PASSWORD: string;
}

interface E2EDatabaseAdminEnvironment {
  NODE_ENV: 'test';
  DB_NAME: typeof E2E_DATABASE_NAME;
  DB_HOST: string;
  DB_PORT: number;
  E2E_DB_ADMIN_USER: string;
  E2E_DB_ADMIN_PASSWORD: string;
  DB_USER: string;
}

const e2eSeedEnvironmentSchema = Joi.object<E2ESeedEnvironment>({
  ...commonGuardSchema,
  E2E_ADMIN_PASSWORD: Joi.string().min(12).max(128).required(),
  E2E_WORKER_PASSWORD: Joi.string().min(12).max(128).required(),
  E2E_FIRST_LOGIN_PASSWORD: Joi.string().min(12).max(128).required(),
}).unknown(true);

const e2eDatabaseAdminEnvironmentSchema =
  Joi.object<E2EDatabaseAdminEnvironment>({
    ...commonGuardSchema,
    DB_HOST: Joi.string().hostname().required(),
    DB_PORT: Joi.number().integer().min(1).max(65535).required(),
    E2E_DB_ADMIN_USER: Joi.string().min(1).required(),
    E2E_DB_ADMIN_PASSWORD: Joi.string().min(1).required(),
    DB_USER: Joi.string().min(1).required(),
  }).unknown(true);

function throwConfigurationError(error: Joi.ValidationError): never {
  // 値は出力せず、修正すべき環境変数名と検証理由だけを呼び出し元へ伝える。
  throw new E2ESeedConfigValidationError(
    `E2E database configuration is invalid: ${error.message}`,
  );
}

/** Playwrightが使う3利用者のパスワードをSeed実行時だけ読み込む。 */
export function readE2ESeedConfig(
  environment: NodeJS.ProcessEnv,
): E2ESeedConfig {
  const result = e2eSeedEnvironmentSchema.validate(environment, {
    abortEarly: false,
  });
  if (result.error) throwConfigurationError(result.error);

  return {
    adminPassword: result.value.E2E_ADMIN_PASSWORD,
    workerPassword: result.value.E2E_WORKER_PASSWORD,
    firstLoginPassword: result.value.E2E_FIRST_LOGIN_PASSWORD,
  };
}

/** ローカルMySQLへE2E専用DBを追加するときだけ使う管理接続設定。 */
export function readE2EDatabaseAdminConfig(
  environment: NodeJS.ProcessEnv,
): E2EDatabaseAdminConfig {
  const result = e2eDatabaseAdminEnvironmentSchema.validate(environment, {
    abortEarly: false,
  });
  if (result.error) throwConfigurationError(result.error);

  return {
    host: result.value.DB_HOST,
    port: result.value.DB_PORT,
    adminUser: result.value.E2E_DB_ADMIN_USER,
    adminPassword: result.value.E2E_DB_ADMIN_PASSWORD,
    appUser: result.value.DB_USER,
  };
}
