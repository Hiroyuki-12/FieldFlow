import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

import { DATABASE_ENTITIES } from './entities';
import { DATABASE_MIGRATIONS } from './migrations';

/**
 * NestJSの通常起動時に使用するTypeORM接続設定を作る。
 *
 * この設定はControllerやServiceからRepositoryを利用できるようにするためのもの。
 * Migration CLIは`data-source.ts`を入口にするが、EntityとMigrationの一覧は両者で共有し、
 * 「アプリでは見えるがMigrationでは見えない」といった環境差を防いでいる。
 */
export function createTypeOrmOptions(
  configService: ConfigService,
): TypeOrmModuleOptions {
  return {
    type: 'mysql',
    host: configService.getOrThrow<string>('DB_HOST'),
    port: configService.getOrThrow<number>('DB_PORT'),
    username: configService.getOrThrow<string>('DB_USER'),
    password: configService.getOrThrow<string>('DB_PASSWORD'),
    database: configService.getOrThrow<string>('DB_NAME'),
    charset: 'utf8mb4',
    timezone: 'Z',
    entities: DATABASE_ENTITIES,
    migrations: DATABASE_MIGRATIONS,
    // EntityはTypeScriptとDBの対応表として使い、Entityとの差分をDBへ自動反映させない。
    // 自動反映を許すと、名前変更を列削除＋再作成と判断してデータを失う可能性があるため、
    // スキーマ変更は内容をレビューできるMigrationだけに限定する。
    synchronize: false,
    // アプリ起動とMigration実行を分離し、複数コンテナが同時にDBを変更する事故を防ぐ。
    migrationsRun: false,
  };
}
