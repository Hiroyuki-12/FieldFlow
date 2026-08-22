import { execFileSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';

import {
  loadPerformanceEnvironment,
  requiredEnvironmentValue,
} from '../support/environment.ts';

loadPerformanceEnvironment();

if (
  requiredEnvironmentValue('NODE_ENV') !== 'test' ||
  requiredEnvironmentValue('DB_NAME') !== 'fieldflow_perf'
) {
  throw new Error(
    'Performance backend requires NODE_ENV=test and DB_NAME=fieldflow_perf',
  );
}

const backendDirectory = resolve(process.cwd(), '..', 'backend');

// watch再起動の揺らぎを測定へ混ぜず、CIと同じbuild成果物を8080で起動する。
execFileSync('npm', ['run', 'build'], {
  cwd: backendDirectory,
  env: { ...process.env },
  stdio: 'inherit',
});

// 停止判断を利用者が行えるよう、別Terminalの前景プロセスとしてBackendを維持する。
const child = spawn('npm', ['run', 'start'], {
  cwd: backendDirectory,
  env: { ...process.env },
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exitCode = code ?? 1;
});
