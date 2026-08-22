import {
  E2E_DATABASE_NAME,
  E2ESeedConfigValidationError,
  readE2EDatabaseAdminConfig,
  readE2ESeedConfig,
} from './e2e-seed.config';

describe('E2E seed configuration', () => {
  const seedEnvironment = {
    NODE_ENV: 'test',
    DB_NAME: E2E_DATABASE_NAME,
    E2E_ADMIN_PASSWORD: 'admin-password-for-e2e',
    E2E_WORKER_PASSWORD: 'worker-password-for-e2e',
    E2E_FIRST_LOGIN_PASSWORD: 'first-password-for-e2e',
  };

  it('E2E専用DBと検証用パスワードを受け入れる', () => {
    expect(readE2ESeedConfig(seedEnvironment)).toEqual({
      adminPassword: seedEnvironment.E2E_ADMIN_PASSWORD,
      workerPassword: seedEnvironment.E2E_WORKER_PASSWORD,
      firstLoginPassword: seedEnvironment.E2E_FIRST_LOGIN_PASSWORD,
    });
  });

  it.each([
    { NODE_ENV: 'development', DB_NAME: E2E_DATABASE_NAME },
    { NODE_ENV: 'test', DB_NAME: 'fieldflow' },
    { NODE_ENV: 'production', DB_NAME: 'fieldflow' },
  ])('通常DBや本番環境へのSeedを接続前に拒否する: %o', (override) => {
    // E2E Seedは既存データを整えるため、名前だけ似たDBも許可せず完全一致で防御する。
    expect(() =>
      readE2ESeedConfig({ ...seedEnvironment, ...override }),
    ).toThrow(E2ESeedConfigValidationError);
  });

  it('E2E DB作成用の管理接続設定を検証する', () => {
    expect(
      readE2EDatabaseAdminConfig({
        NODE_ENV: 'test',
        DB_NAME: E2E_DATABASE_NAME,
        DB_HOST: '127.0.0.1',
        DB_PORT: '3306',
        DB_USER: 'fieldflow',
        E2E_DB_ADMIN_USER: 'root',
        E2E_DB_ADMIN_PASSWORD: 'local-root-password',
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
