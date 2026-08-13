import AppDataSource from '../data-source';
import { runInitialSeed } from './initial.seed';
import {
  readInitialAdminSeedConfig,
  SeedConfigValidationError,
} from './seed.config';

/**
 * `npm run seed:run`から呼ばれる、一回限りの初期データ投入コマンド。
 * アプリ起動時に自動実行しないことで、複数コンテナによる競合や意図しない再投入を防ぐ。
 */
async function seed(): Promise<void> {
  // DBへ接続する前にSeed専用環境変数を検証し、不完全な設定で処理を始めない。
  const config = readInitialAdminSeedConfig(process.env);

  try {
    // 接続→TransactionでSeed→接続終了の順で、短時間だけDB接続を保持する。
    await AppDataSource.initialize();
    const result = await runInitialSeed(AppDataSource, config);
    console.info(
      `Initial seed completed (commonCategoryCreated=${String(result.commonCategoryCreated)}, initialAdminCreated=${String(result.initialAdminCreated)})`,
    );
  } finally {
    // Seedの成功・失敗にかかわらず接続を閉じ、CLIプロセスが終了できるようにする。
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

void seed().catch((error: unknown) => {
  if (error instanceof SeedConfigValidationError) {
    console.error(error.message);
  } else {
    // DB例外へハッシュ等が混入する可能性を考慮し、詳細をそのまま出力しない。
    console.error(
      'Initial seed failed. Check the database connection and seed environment variables.',
    );
  }
  process.exitCode = 1;
});
