import { execFileSync, spawn } from "node:child_process";
import { resolve } from "node:path";

import {
  loadE2EEnvironment,
  requiredEnvironmentValue,
} from "../support/environment.ts";

loadE2EEnvironment();

if (
  requiredEnvironmentValue("NODE_ENV") !== "test" ||
  requiredEnvironmentValue("DB_NAME") !== "fieldflow_e2e"
) {
  throw new Error(
    "E2E backend requires NODE_ENV=test and DB_NAME=fieldflow_e2e",
  );
}

const backendDirectory = resolve(process.cwd(), "..", "backend");

// watch固有の再起動差を避け、CIと同じbuild成果物を実行してE2E条件を揃える。
execFileSync("npm", ["run", "build"], {
  cwd: backendDirectory,
  env: { ...process.env },
  stdio: "inherit",
});

// 別Terminalで起動し、終了操作は利用者が確認できる前景プロセスとして扱う。
const child = spawn("npm", ["run", "start"], {
  cwd: backendDirectory,
  env: { ...process.env },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exitCode = code ?? 1;
});
