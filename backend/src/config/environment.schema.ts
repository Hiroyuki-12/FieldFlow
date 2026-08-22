import Joi from 'joi';

/**
 * 起動時に環境変数を検証し、誤った接続先や未設定の秘密値で動き続けることを防ぐ。
 * portはローカル・CI・本番の構成を揃えるため、FieldFlowの標準値へ固定する。
 */
export const environmentValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').required(),
  LOG_LEVEL: Joi.string()
    .valid('debug', 'info', 'warn', 'error', 'fatal')
    .default('info'),
  PORT: Joi.number().integer().valid(8080).required(),
  CORS_ORIGIN: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required(),
  DB_HOST: Joi.string().hostname().required(),
  // 開発・本番は標準3306へ固定する。Testcontainersだけは隔離用の動的host portを許可する。
  DB_PORT: Joi.number()
    .integer()
    .when('NODE_ENV', {
      is: 'test',
      then: Joi.number().integer().min(1).max(65535).required(),
      otherwise: Joi.valid(3306).required(),
    }),
  DB_NAME: Joi.string().min(1).required(),
  DB_USER: Joi.string().min(1).required(),
  DB_PASSWORD: Joi.string().min(1).required(),
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
  // ローカル直結は0。CloudFront→ALB→ECSでは2を指定し、req.ipの信頼範囲を固定する。
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).max(2).default(0),
});
