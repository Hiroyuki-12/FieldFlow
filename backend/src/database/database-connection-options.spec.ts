import {
  createDatabaseConnectionOptions,
  decodeDatabaseTlsCa,
} from './database-connection-options';

const TEST_CA = [
  '-----BEGIN CERTIFICATE-----',
  'ZmFrZS10ZXN0LWNlcnRpZmljYXRl',
  '-----END CERTIFICATE-----',
  '',
].join('\n');

describe('database connection options', () => {
  it('TLS無効時もpool上限と接続timeoutを設定する', () => {
    // Aivenの接続枯渇と、到達不能なDBを長時間待ち続ける障害を防ぐ回帰テスト。
    const options = createDatabaseConnectionOptions({
      poolLimit: 5,
      connectTimeoutMs: 10_000,
      tlsEnabled: false,
    });

    expect(options).toMatchObject({
      poolSize: 5,
      connectTimeout: 10_000,
      extra: {
        waitForConnections: true,
        queueLimit: 20,
        maxIdle: 5,
      },
    });
    expect(options.ssl).toBeUndefined();
  });

  it('Base64のCAを復元し、証明書検証を必須にする', () => {
    const options = createDatabaseConnectionOptions({
      poolLimit: 5,
      connectTimeoutMs: 10_000,
      tlsEnabled: true,
      tlsCaBase64: Buffer.from(TEST_CA).toString('base64'),
    });

    expect(options.ssl).toEqual({
      ca: TEST_CA,
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    });
  });

  it('TLS有効時にCAが不足していればDB接続前に拒否する', () => {
    expect(() =>
      createDatabaseConnectionOptions({
        poolLimit: 5,
        connectTimeoutMs: 10_000,
        tlsEnabled: true,
      }),
    ).toThrow('DB_TLS_CA_BASE64');
  });

  it('PEM証明書ではないBase64値を拒否する', () => {
    // Base64として読めるだけの文字列をCAとして信頼してしまう設定事故を防ぐ。
    expect(() =>
      decodeDatabaseTlsCa(Buffer.from('not-a-certificate').toString('base64')),
    ).toThrow('DB_TLS_CA_BASE64');
  });
});
