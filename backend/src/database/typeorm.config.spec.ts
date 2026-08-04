import { ConfigService } from '@nestjs/config';

import { createTypeOrmOptions } from './typeorm.config';

describe('createTypeOrmOptions', () => {
  it('DBスキーマの自動同期を常に無効にする', () => {
    const values = new Map<string, string | number>([
      ['DB_HOST', '127.0.0.1'],
      ['DB_PORT', 3306],
      ['DB_USER', 'fieldflow'],
      ['DB_PASSWORD', 'fieldflow'],
      ['DB_NAME', 'fieldflow'],
    ]);
    const configService = {
      getOrThrow: <T>(key: string): T => values.get(key) as T,
    } as ConfigService;

    const options = createTypeOrmOptions(configService);

    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(false);
    expect(options.type).toBe('mysql');
  });
});
