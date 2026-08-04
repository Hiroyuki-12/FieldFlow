import Joi from 'joi';

/**
 * 起動時に環境変数を検証し、誤った接続先や未設定の秘密値で動き続けることを防ぐ。
 * portはローカル・CI・本番の構成を揃えるため、FieldFlowの標準値へ固定する。
 */
export const environmentValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').required(),
  PORT: Joi.number().integer().valid(8080).required(),
  CORS_ORIGIN: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required(),
  DB_HOST: Joi.string().hostname().required(),
  DB_PORT: Joi.number().integer().valid(3306).required(),
  DB_NAME: Joi.string().min(1).required(),
  DB_USER: Joi.string().min(1).required(),
  DB_PASSWORD: Joi.string().min(1).required(),
});
