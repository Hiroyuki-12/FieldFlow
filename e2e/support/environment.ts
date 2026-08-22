import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** ローカルだけe2e/.envを読み、CIから注入された値は上書きしない。 */
export function loadE2EEnvironment(): void {
  // CIや一時検証ではE2E_ENV_FILEを明示でき、通常はGit追跡外のe2e/.envだけを読む。
  const environmentFile = resolve(
    process.cwd(),
    process.env.E2E_ENV_FILE ?? ".env",
  );
  if (existsSync(environmentFile)) process.loadEnvFile(environmentFile);
}

export function requiredEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for E2E tests`);
  return value;
}

export const e2eBaseUrl = (): string =>
  process.env.E2E_BASE_URL ?? "http://localhost:5173";

export const e2eApiUrl = (): string =>
  process.env.E2E_API_URL ?? "http://localhost:8080/api/v1";
