import Joi from 'joi';

import { decodeDatabaseTlsCa } from '../database/database-connection-options';

const databaseTlsCaSchema = Joi.string().custom((value: string, helpers) => {
  try {
    decodeDatabaseTlsCa(value);
    return value;
  } catch {
    // Joiのエラーへ秘密値を含めず、修正対象の環境変数名だけを通知する。
    return helpers.error('any.invalid');
  }
});

/**
 * 起動時に環境変数を検証し、誤った接続先や未設定の秘密値で動き続けることを防ぐ。
 * ローカル・CIは標準portへ固定し、本番はRenderが割り当てるportも受け入れる。
 */
export const environmentValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').required(),
  LOG_LEVEL: Joi.string()
    .valid('debug', 'info', 'warn', 'error', 'fatal')
    .default('info'),
  PORT: Joi.alternatives()
    .conditional('NODE_ENV', {
      is: 'production',
      then: Joi.number().integer().min(1).max(65535),
      otherwise: Joi.number().integer().valid(8080),
    })
    .required(),
  CORS_ORIGIN: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required(),
  DB_HOST: Joi.string().hostname().required(),
  // ローカル開発は標準3306へ固定する。Aiven本番とTestcontainersは割り当てられたportを使用する。
  DB_PORT: Joi.alternatives()
    .conditional('NODE_ENV', {
      is: 'development',
      then: Joi.number().integer().valid(3306),
      otherwise: Joi.number().integer().min(1).max(65535),
    })
    .required(),
  DB_NAME: Joi.string().min(1).required(),
  DB_USER: Joi.string().min(1).required(),
  DB_PASSWORD: Joi.string().min(1).required(),
  // 単一Backendのpoolを小さく保ち、Aiven無料枠の最大接続数を使い切らない。
  DB_POOL_LIMIT: Joi.number().integer().min(1).max(10).default(5),
  DB_CONNECT_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .max(30000)
    .default(10000),
  DB_TLS_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.valid(true).required(),
      otherwise: Joi.boolean().default(false),
    }),
  // 本番CAは平文ファイルへ置かず、Cloudflare SecretからBase64文字列として注入する。
  DB_TLS_CA_BASE64: databaseTlsCaSchema.when('DB_TLS_ENABLED', {
    is: true,
    then: databaseTlsCaSchema.required(),
    otherwise: Joi.forbidden(),
  }),
  // JWT鍵はソースへ直書きせず、推測困難な32byte以上の秘密値を環境から注入する。
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL_SECONDS: Joi.number().integer().min(60).required(),
  REFRESH_TOKEN_TTL_SECONDS: Joi.number().integer().min(60).required(),
  COOKIE_SECURE: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.valid(true).required(),
      otherwise: Joi.required(),
    }),
  // Render公開URLへの直アクセスを拒否し、Cloudflare Workerだけを入口にする共有鍵。
  // AWSではALB/CloudFront側の入口制御を使うため任意とし、Render環境で必ず設定する。
  INGRESS_PROXY_SECRET: Joi.string().min(32).optional(),
  // ローカル直結は0。CloudFront→ALB→ECSでは2を指定し、req.ipの信頼範囲を固定する。
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).max(2).default(0),
});
