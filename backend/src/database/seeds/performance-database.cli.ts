import { createConnection } from 'mysql2/promise';

import {
  PERFORMANCE_DATABASE_NAME,
  PerformanceSeedConfigValidationError,
  readPerformanceDatabaseAdminConfig,
} from './performance-seed.config';

/** Docker ComposeのMySQLへ、通常・E2E DBと分離した性能試験専用DBを冪等に作成する。 */
async function createPerformanceDatabase(): Promise<void> {
  const config = readPerformanceDatabaseAdminConfig(process.env);
  const connection = await createConnection({
    host: config.host,
    port: config.port,
    user: config.adminUser,
    password: config.adminPassword,
  });

  try {
    // 固定DB名だけをSQLへ埋め込み、利用者入力による識別子のSQL Injectionを防ぐ。
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${PERFORMANCE_DATABASE_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
    );
    // アプリ用ユーザーへ性能DBだけの権限を与え、rootでBackendを動かさない。
    const appUser = connection.escape(config.appUser);
    await connection.query(
      `GRANT ALL PRIVILEGES ON \`${PERFORMANCE_DATABASE_NAME}\`.* TO ${appUser}@'%'`,
    );
  } finally {
    await connection.end();
  }

  console.info('Performance database is ready.');
}

void createPerformanceDatabase().catch((error: unknown) => {
  if (error instanceof PerformanceSeedConfigValidationError) {
    console.error(error.message);
  } else {
    // 管理パスワードや接続詳細を例外から漏らさず、確認箇所だけを示す。
    console.error(
      'Performance database creation failed. Check the local MySQL settings.',
    );
  }
  process.exitCode = 1;
});
