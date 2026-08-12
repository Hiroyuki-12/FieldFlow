import AppDataSource from '../data-source';
import { runInitialSeed } from './initial.seed';
import {
  readInitialAdminSeedConfig,
  SeedConfigValidationError,
} from './seed.config';

/** 本番アプリ起動と分離した、一回限りの初期データ投入コマンド。 */
async function seed(): Promise<void> {
  const config = readInitialAdminSeedConfig(process.env);

  try {
    await AppDataSource.initialize();
    const result = await runInitialSeed(AppDataSource, config);
    console.info(
      `Initial seed completed (commonCategoryCreated=${String(result.commonCategoryCreated)}, initialAdminCreated=${String(result.initialAdminCreated)})`,
    );
  } finally {
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
