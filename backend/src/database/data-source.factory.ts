import { DataSource, DataSourceOptions } from 'typeorm';

import { DATABASE_ENTITIES } from './entities';
import { DATABASE_MIGRATIONS } from './migrations';

function requireEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  key: string,
): string {
  const value = environment[key];
  if (!value) {
    throw new Error(`${key} is required for database operations`);
  }
  return value;
}

/**
 * Migration CLIとTestcontainersから再利用できるDataSourceを作る。
 *
 * NestJSへ依存しないFactoryにしているため、アプリを起動せずにMigrationを実行できる。
 * 結合テストも同じFactoryを使うことで、本番用Migrationと異なる接続設定で検証してしまう
 * 事故を避ける。
 */
export function createDatabaseDataSource(
  environment: NodeJS.ProcessEnv,
): DataSource {
  // 環境変数はすべて文字列なので、DB接続前に数値へ変換して設定ミスを早期検出する。
  const port = Number(requireEnvironmentValue(environment, 'DB_PORT'));
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('DB_PORT must be a positive integer');
  }

  const options: DataSourceOptions = {
    type: 'mysql',
    host: requireEnvironmentValue(environment, 'DB_HOST'),
    port,
    username: requireEnvironmentValue(environment, 'DB_USER'),
    password: requireEnvironmentValue(environment, 'DB_PASSWORD'),
    database: requireEnvironmentValue(environment, 'DB_NAME'),
    charset: 'utf8mb4',
    timezone: 'Z',
    entities: DATABASE_ENTITIES,
    migrations: DATABASE_MIGRATIONS,
    migrationsTableName: 'migrations',
    // NestJS側と同様に自動同期を禁止し、CLIからもMigrationだけを適用する。
    synchronize: false,
    // `migration:run`などの明示的なコマンドを実行した場合だけDBを変更する。
    migrationsRun: false,
  };

  return new DataSource(options);
}
