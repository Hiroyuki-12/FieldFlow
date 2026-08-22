import AppDataSource from '../data-source';
import {
  E2ESeedConfigValidationError,
  readE2ESeedConfig,
} from './e2e-seed.config';
import { runE2ESeed } from './e2e.seed';

/** Migration適用後のE2E専用DBへ、再実行可能な検証データを投入する。 */
async function seedE2E(): Promise<void> {
  const config = readE2ESeedConfig(process.env);
  try {
    await AppDataSource.initialize();
    await runE2ESeed(AppDataSource, config);
    console.info('E2E seed completed.');
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

void seedE2E().catch((error: unknown) => {
  if (error instanceof E2ESeedConfigValidationError) {
    console.error(error.message);
  } else {
    // SQLやハッシュを含み得る内部例外は出さず、確認対象だけを示す。
    console.error(
      'E2E seed failed. Check migrations and E2E fixture settings.',
    );
  }
  process.exitCode = 1;
});
