import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { createDatabaseDataSource } from './data-source.factory';

/** npm scriptから実行した場合だけbackend/.envを読み、CIから渡された環境変数は上書きしない。 */
function loadLocalEnvironment(): void {
  const environmentFile = resolve(process.cwd(), '.env');
  if (existsSync(environmentFile)) {
    process.loadEnvFile(environmentFile);
  }
}

loadLocalEnvironment();

/** TypeORM CLIが読み込むDataSource。秘密値そのものは出力しない。 */
const AppDataSource = createDatabaseDataSource(process.env);

export default AppDataSource;
