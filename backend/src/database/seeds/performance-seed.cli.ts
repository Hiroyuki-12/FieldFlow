import AppDataSource from '../data-source';
import {
  PerformanceSeedConfigValidationError,
  readPerformanceSeedConfig,
} from './performance-seed.config';
import { runPerformanceSeed } from './performance.seed';

/** Migration適用後の性能試験専用DBへ、比較可能な固定量のFixtureを投入する。 */
async function seedPerformanceData(): Promise<void> {
  const config = readPerformanceSeedConfig(process.env);
  try {
    await AppDataSource.initialize();
    await runPerformanceSeed(AppDataSource, config);
    console.info('Performance seed completed.');
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

void seedPerformanceData().catch((error: unknown) => {
  if (error instanceof PerformanceSeedConfigValidationError) {
    console.error(error.message);
  } else {
    // SQL、パスワードHash、接続情報を出さず、利用者が確認すべき範囲だけを示す。
    console.error(
      'Performance seed failed. Check migrations and performance fixture settings.',
    );
  }
  process.exitCode = 1;
});
