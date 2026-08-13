import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { createDatabaseDataSource } from './data-source.factory';

/**
 * npm scriptから実行した場合だけ`backend/.env`を読み込む。
 * ファイルが存在しないCI・本番では、実行環境から安全に注入された値をそのまま使用する。
 */
function loadLocalEnvironment(): void {
  const environmentFile = resolve(process.cwd(), '.env');
  if (existsSync(environmentFile)) {
    process.loadEnvFile(environmentFile);
  }
}

loadLocalEnvironment();

/**
 * `migration:show/run/revert`とSeed CLIが読み込む共通DataSource。
 * このファイルは接続設定を組み立てるだけで、import時にDB接続やMigration実行は行わない。
 */
const AppDataSource = createDatabaseDataSource(process.env);

export default AppDataSource;
