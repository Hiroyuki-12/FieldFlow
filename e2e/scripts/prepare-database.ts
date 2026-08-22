import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import {
  loadE2EEnvironment,
  requiredEnvironmentValue,
} from "../support/environment.ts";

loadE2EEnvironment();

// 通常DBを誤って整える事故を、Backend CLIへ渡す前にも止める。
if (
  requiredEnvironmentValue("NODE_ENV") !== "test" ||
  requiredEnvironmentValue("DB_NAME") !== "fieldflow_e2e"
) {
  throw new Error(
    "E2E preparation requires NODE_ENV=test and DB_NAME=fieldflow_e2e",
  );
}

const backendDirectory = resolve(process.cwd(), "..", "backend");
const environment = { ...process.env };

function runBackendScript(script: string): void {
  execFileSync("npm", ["run", script], {
    cwd: backendDirectory,
    env: environment,
    stdio: "inherit",
  });
}

// 管理接続情報があるローカルでは専用DBを冪等作成する。CIはMySQL serviceが作成済みなので省略できる。
if (process.env.E2E_DB_ADMIN_USER && process.env.E2E_DB_ADMIN_PASSWORD) {
  runBackendScript("e2e:db:create");
}
runBackendScript("migration:run");
runBackendScript("seed:e2e");
