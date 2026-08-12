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
    const dataSource = createDatabaseDataSource(validEnvironment);

    expect(dataSource.options.type).toBe('mysql');
    expect(dataSource.options.synchronize).toBe(false);
    expect(dataSource.options.migrationsRun).toBe(false);
    expect(dataSource.options.entities).toHaveLength(8);
    expect(dataSource.options.migrations).toHaveLength(1);
  });

  it('DB接続設定が不足している場合は実行前に拒否する', () => {
    expect(() =>
      createDatabaseDataSource({
        ...validEnvironment,
        DB_PASSWORD: undefined,
      }),
    ).toThrow('DB_PASSWORD');
  });
});
