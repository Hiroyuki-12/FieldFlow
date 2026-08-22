import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** ローカルだけperf/.envを読み、CIで注入された値は上書きしない。 */
export function loadPerformanceEnvironment(): void {
  const environmentFile = resolve(
    process.cwd(),
    process.env.PERF_ENV_FILE ?? '.env',
  );
  if (existsSync(environmentFile)) process.loadEnvFile(environmentFile);
}

export function requiredEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for performance tests`);
  return value;
}
