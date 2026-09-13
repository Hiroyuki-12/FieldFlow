import { createDatabaseDataSource } from './data-source.factory';

const validEnvironment: NodeJS.ProcessEnv = {
  DB_HOST: '127.0.0.1',
  DB_PORT: '3306',
  DB_NAME: 'fieldflow',
  DB_USER: 'fieldflow',
  DB_PASSWORD: 'fieldflow',
};

describe('createDatabaseDataSource', () => {
  it('Migration専用かつ自動同期無効のDataSourceを作る', () => {
    // DBへ実接続せずoptionsだけを確認し、自動スキーマ変更が有効にならないことを固定する。
    const dataSource = createDatabaseDataSource(validEnvironment);

    expect(dataSource.options.type).toBe('mysql');
    expect(dataSource.options.synchronize).toBe(false);
    expect(dataSource.options.migrationsRun).toBe(false);
    expect(dataSource.options.entities).toHaveLength(8);
    expect(dataSource.options.migrations).toHaveLength(2);
    expect(dataSource.options).toMatchObject({
      poolSize: 5,
      connectTimeout: 10000,
    });
    expect(
      'ssl' in dataSource.options ? dataSource.options.ssl : undefined,
    ).toBeUndefined();
  });

  it('DB接続設定が不足している場合は実行前に拒否する', () => {
    // 接続開始後の分かりにくいエラーではなく、不足したキーを準備段階で通知する。
    expect(() =>
      createDatabaseDataSource({
        ...validEnvironment,
        DB_PASSWORD: undefined,
      }),
    ).toThrow('DB_PASSWORD');
  });

  it('Migration CLIでもAiven TLSとpool上限を適用する', () => {
    // 通常アプリだけでなく、一回限りのMigrationも同じ証明書検証を通ることを保証する。
    const ca =
      '-----BEGIN CERTIFICATE-----\ntest-ca\n-----END CERTIFICATE-----\n';
    const dataSource = createDatabaseDataSource({
      ...validEnvironment,
      DB_POOL_LIMIT: '3',
      DB_CONNECT_TIMEOUT_MS: '5000',
      DB_TLS_ENABLED: 'true',
      DB_TLS_CA_BASE64: Buffer.from(ca).toString('base64'),
    });

    expect(dataSource.options).toMatchObject({
      poolSize: 3,
      connectTimeout: 5000,
      ssl: {
        ca,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
      },
    });
  });

  it('Migration CLIでも不正なTLS設定をDB接続前に拒否する', () => {
    expect(() =>
      createDatabaseDataSource({
        ...validEnvironment,
        DB_TLS_ENABLED: 'true',
      }),
    ).toThrow('DB_TLS_CA_BASE64 or DB_TLS_CA_FILE');
  });
});
