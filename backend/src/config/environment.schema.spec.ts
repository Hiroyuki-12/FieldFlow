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

const testCaBase64 = Buffer.from(
  '-----BEGIN CERTIFICATE-----\ntest-ca\n-----END CERTIFICATE-----\n',
).toString('base64');

describe('environmentValidationSchema', () => {
  it('標準portと必須DB設定を受け入れる', () => {
    const result = environmentValidationSchema.validate(validEnvironment, {
      abortEarly: false,
    });

    expect(result.error).toBeUndefined();
    expect(result.value).toMatchObject({
      LOG_LEVEL: 'info',
      TRUST_PROXY_HOPS: 0,
      DB_POOL_LIMIT: 5,
      DB_CONNECT_TIMEOUT_MS: 10000,
      DB_TLS_ENABLED: false,
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

  it('Renderが割り当てる本番portを受け入れる', () => {
    const result = environmentValidationSchema.validate({
      ...validEnvironment,
      NODE_ENV: 'production',
      PORT: 10000,
      DB_TLS_ENABLED: true,
      DB_TLS_CA_BASE64: testCaBase64,
      COOKIE_SECURE: true,
      INGRESS_PROXY_SECRET: 'render-proxy-secret-at-least-32-bytes',
    });

    expect(result.error).toBeUndefined();
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

  it('Aivenが割り当てる本番DB portとTLS CAを受け入れる', () => {
    const result = environmentValidationSchema.validate({
      ...validEnvironment,
      NODE_ENV: 'production',
      DB_PORT: 12345,
      DB_TLS_ENABLED: true,
      DB_TLS_CA_BASE64: testCaBase64,
      COOKIE_SECURE: true,
    });

    expect(result.error).toBeUndefined();
  });

  it('本番でTLSを無効にする設定を拒否する', () => {
    // 公開ネットワーク上のDB通信が平文または未検証になる前に起動を止める。
    const result = environmentValidationSchema.validate({
      ...validEnvironment,
      NODE_ENV: 'production',
      DB_TLS_ENABLED: false,
      COOKIE_SECURE: true,
    });

    expect(result.error?.message).toContain('DB_TLS_ENABLED');
  });

  it('TLS有効時にCA不足または不正なCAを拒否する', () => {
    const missingCa = environmentValidationSchema.validate({
      ...validEnvironment,
      DB_TLS_ENABLED: true,
    });
    const invalidCa = environmentValidationSchema.validate({
      ...validEnvironment,
      DB_TLS_ENABLED: true,
      DB_TLS_CA_BASE64: Buffer.from('not-a-certificate').toString('base64'),
    });

    expect(missingCa.error?.message).toContain('DB_TLS_CA_BASE64');
    expect(invalidCa.error?.message).toContain('DB_TLS_CA_BASE64');
  });

  it('過剰なDB poolと接続timeoutを拒否する', () => {
    const result = environmentValidationSchema.validate(
      {
        ...validEnvironment,
        DB_POOL_LIMIT: 11,
        DB_CONNECT_TIMEOUT_MS: 30001,
      },
      { abortEarly: false },
    );

    expect(result.error?.message).toContain('DB_POOL_LIMIT');
    expect(result.error?.message).toContain('DB_CONNECT_TIMEOUT_MS');
  });

  it('短いJWT署名鍵を拒否する', () => {
    // 推測しやすい短い鍵でAccess Tokenが署名される前に、起動時検証で停止させる。
    const result = environmentValidationSchema.validate({
      ...validEnvironment,
      JWT_ACCESS_SECRET: 'too-short',
    });

    expect(result.error?.message).toContain('JWT_ACCESS_SECRET');
  });

  it('短いIngress共有鍵を拒否する', () => {
    const result = environmentValidationSchema.validate({
      ...validEnvironment,
      INGRESS_PROXY_SECRET: 'too-short',
    });

    expect(result.error?.message).toContain('INGRESS_PROXY_SECRET');
  });

  it('本番でSecure Cookieを無効にする設定を拒否する', () => {
    // HTTPS本番環境でRefresh Cookieが平文通信へ送られる設定事故を防ぐ。
    const result = environmentValidationSchema.validate({
      ...validEnvironment,
      NODE_ENV: 'production',
      DB_TLS_ENABLED: true,
      DB_TLS_CA_BASE64: testCaBase64,
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
