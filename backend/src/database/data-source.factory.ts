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

/** Migration CLIとTestcontainersから再利用できるDataSourceを作る。 */
export function createDatabaseDataSource(
  environment: NodeJS.ProcessEnv,
): DataSource {
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
    // CLIでも自動同期を許可せず、必ずレビュー可能なMigrationを適用する。
    synchronize: false,
    migrationsRun: false,
  };

  return new DataSource(options);
}
