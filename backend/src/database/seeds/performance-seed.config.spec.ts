import {
  PERFORMANCE_DATABASE_NAME,
  PerformanceSeedConfigValidationError,
  readPerformanceDatabaseAdminConfig,
  readPerformanceSeedConfig,
} from './performance-seed.config';

describe('Performance seed configuration', () => {
  const seedEnvironment = {
    NODE_ENV: 'test',
    DB_NAME: PERFORMANCE_DATABASE_NAME,
    PERF_WORKER_PASSWORD: 'worker-password-for-performance',
  };

  it('性能試験専用DBと架空パスワードを受け入れる', () => {
    expect(readPerformanceSeedConfig(seedEnvironment)).toEqual({
      workerPassword: seedEnvironment.PERF_WORKER_PASSWORD,
    });
  });

  it.each([
    { NODE_ENV: 'development', DB_NAME: PERFORMANCE_DATABASE_NAME },
    { NODE_ENV: 'test', DB_NAME: 'fieldflow' },
    { NODE_ENV: 'test', DB_NAME: 'fieldflow_e2e' },
    { NODE_ENV: 'production', DB_NAME: 'fieldflow' },
  ])('通常・E2E・本番DBへのSeedを接続前に拒否する: %o', (override) => {
    // 性能Seedは識別可能な前回データを整えるため、DB名の完全一致で誤接続を防ぐ。
    expect(() =>
      readPerformanceSeedConfig({ ...seedEnvironment, ...override }),
    ).toThrow(PerformanceSeedConfigValidationError);
  });

  it('性能DB作成用の管理接続設定を検証する', () => {
    expect(
      readPerformanceDatabaseAdminConfig({
        NODE_ENV: 'test',
        DB_NAME: PERFORMANCE_DATABASE_NAME,
        DB_HOST: '127.0.0.1',
        DB_PORT: '3306',
        DB_USER: 'fieldflow',
        PERF_DB_ADMIN_USER: 'root',
        PERF_DB_ADMIN_PASSWORD: 'local-root-password',
      }),
    ).toEqual({
      host: '127.0.0.1',
      port: 3306,
      adminUser: 'root',
      adminPassword: 'local-root-password',
      appUser: 'fieldflow',
    });
  });
});
