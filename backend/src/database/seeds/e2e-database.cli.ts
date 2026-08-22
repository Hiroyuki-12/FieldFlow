import { createConnection } from 'mysql2/promise';

import {
  E2E_DATABASE_NAME,
  E2ESeedConfigValidationError,
  readE2EDatabaseAdminConfig,
} from './e2e-seed.config';

/** Docker ComposeのMySQLへ、開発DBと分離したE2E専用DBを冪等に作成する。 */
async function createE2EDatabase(): Promise<void> {
  const config = readE2EDatabaseAdminConfig(process.env);
  const connection = await createConnection({
    host: config.host,
    port: config.port,
    user: config.adminUser,
    password: config.adminPassword,
  });

  try {
    // DB名は固定値しか受け入れない。利用者入力を識別子へ埋め込むSQL Injectionを防ぐ。
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${E2E_DATABASE_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
    );
    // Composeが作るアプリ用ユーザーへE2E DBだけの権限を追加し、rootでアプリを動かさない。
    const appUser = connection.escape(config.appUser);
    await connection.query(
      `GRANT ALL PRIVILEGES ON \`${E2E_DATABASE_NAME}\`.* TO ${appUser}@'%'`,
    );
  } finally {
    await connection.end();
  }

  console.info('E2E database is ready.');
}

void createE2EDatabase().catch((error: unknown) => {
  if (error instanceof E2ESeedConfigValidationError) {
    console.error(error.message);
  } else {
    // 管理パスワードや接続詳細を例外から漏らさず、確認箇所だけを示す。
    console.error(
      'E2E database creation failed. Check the local MySQL settings.',
    );
  }
  process.exitCode = 1;
});
