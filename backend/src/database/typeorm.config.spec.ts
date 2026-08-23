import { ConfigService } from '@nestjs/config';

import { createTypeOrmOptions } from './typeorm.config';

describe('createTypeOrmOptions', () => {
  it('DBスキーマの自動同期を常に無効にする', () => {
    // NestJS起動用の設定でもsynchronize/migrationsRunが誤って有効にならないよう回帰テストする。
    const values = new Map<string, unknown>([
      ['DB_HOST', '127.0.0.1'],
      ['DB_PORT', 3306],
      ['DB_USER', 'fieldflow'],
      ['DB_PASSWORD', 'fieldflow'],
      ['DB_NAME', 'fieldflow'],
      ['DB_POOL_LIMIT', 5],
      ['DB_CONNECT_TIMEOUT_MS', 10000],
      ['DB_TLS_ENABLED', false],
    ]);
    const configService = {
      getOrThrow: <T>(key: string): T => values.get(key) as T,
      get: <T>(key: string): T | undefined => values.get(key) as T | undefined,
    } as ConfigService;

    const options = createTypeOrmOptions(configService);

    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(false);
    expect(options.type).toBe('mysql');
    expect(options).toMatchObject({
      poolSize: 5,
      connectTimeout: 10000,
    });
    expect('ssl' in options ? options.ssl : undefined).toBeUndefined();
  });
});
