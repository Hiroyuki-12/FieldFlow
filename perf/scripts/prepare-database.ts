import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import {
  loadPerformanceEnvironment,
  requiredEnvironmentValue,
} from '../support/environment.ts';

loadPerformanceEnvironment();

// Backend CLIへ渡す前にも完全一致を確認し、通常DBのデータを整える事故を防ぐ。
if (
  requiredEnvironmentValue('NODE_ENV') !== 'test' ||
  requiredEnvironmentValue('DB_NAME') !== 'fieldflow_perf'
) {
  throw new Error(
    'Performance preparation requires NODE_ENV=test and DB_NAME=fieldflow_perf',
  );
}

const backendDirectory = resolve(process.cwd(), '..', 'backend');
const environment = { ...process.env };

function runBackendScript(script: string): void {
  execFileSync('npm', ['run', script], {
    cwd: backendDirectory,
    env: environment,
    stdio: 'inherit',
  });
}

// ローカルは専用DBを冪等作成する。CIはMySQL serviceが作成済みなので省略できる。
if (process.env.PERF_DB_ADMIN_USER && process.env.PERF_DB_ADMIN_PASSWORD) {
  runBackendScript('perf:db:create');
}
runBackendScript('migration:run');
runBackendScript('seed:perf');
