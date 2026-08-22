import { environmentValidationSchema } from './environment.schema';

const validEnvironment = {
  NODE_ENV: 'development',
  PORT: 8080,
  CORS_ORIGIN: 'http://localhost:5173',
  DB_HOST: '127.0.0.1',
  DB_PORT: 3306,
  DB_NAME: 'fieldflow',
  DB_USER: 'fieldflow',
  DB_PASSWORD: 'fieldflow',
  JWT_ACCESS_SECRET: 'test-secret-with-at-least-32-characters',
  JWT_ACCESS_TTL_SECONDS: 900,
  REFRESH_TOKEN_TTL_SECONDS: 604800,
  COOKIE_SECURE: false,
};

describe('environmentValidationSchema', () => {
  it('標準portと必須DB設定を受け入れる', () => {
    const result = environmentValidationSchema.validate(validEnvironment, {
      abortEarly: false,
    });

    expect(result.error).toBeUndefined();
    expect(result.value).toMatchObject({
      LOG_LEVEL: 'info',
      TRUST_PROXY_HOPS: 0,
    });
  });

  it('必須値が不足している場合は起動前に検出する', () => {
    const result = environmentValidationSchema.validate(
      {
        ...validEnvironment,
        DB_PASSWORD: undefined,
      },
      {
        abortEarly: false,
      },
    );

    expect(result.error?.message).toContain('DB_PASSWORD');
  });

  it('規定外portへ逃げる設定を拒否する', () => {
    const result = environmentValidationSchema.validate({
      ...validEnvironment,
      PORT: 8081,
    });

    expect(result.error?.message).toContain('PORT');
  });

  it('Testcontainersの動的DB portはtest環境だけ受け入れる', () => {
    // 結合テストは開発用3306を使い回さず、隔離コンテナへ割り当てられたportへ接続する。
    const result = environmentValidationSchema.validate({
      ...validEnvironment,
      NODE_ENV: 'test',
      DB_PORT: 49152,
    });

    expect(result.error).toBeUndefined();
  });

  it('短いJWT署名鍵を拒否する', () => {
    // 推測しやすい短い鍵でAccess Tokenが署名される前に、起動時検証で停止させる。
    const result = environmentValidationSchema.validate({
      ...validEnvironment,
      JWT_ACCESS_SECRET: 'too-short',
    });

    expect(result.error?.message).toContain('JWT_ACCESS_SECRET');
  });

  it('本番でSecure Cookieを無効にする設定を拒否する', () => {
    // HTTPS本番環境でRefresh Cookieが平文通信へ送られる設定事故を防ぐ。
    const result = environmentValidationSchema.validate({
      ...validEnvironment,
      NODE_ENV: 'production',
      COOKIE_SECURE: false,
    });

    expect(result.error?.message).toContain('COOKIE_SECURE');
  });

  it('未対応のログレベルと過剰なProxy信頼段数を拒否する', () => {
    const result = environmentValidationSchema.validate(
      {
        ...validEnvironment,
        LOG_LEVEL: 'trace',
        TRUST_PROXY_HOPS: 3,
      },
      { abortEarly: false },
    );

    expect(result.error?.message).toContain('LOG_LEVEL');
    expect(result.error?.message).toContain('TRUST_PROXY_HOPS');
  });
});
