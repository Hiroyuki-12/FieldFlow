import { defineConfig, devices } from "@playwright/test";

import { e2eBaseUrl, loadE2EEnvironment } from "./support/environment.ts";

loadE2EEnvironment();

export default defineConfig({
  testDir: "./tests",
  outputDir: "./results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL: e2eBaseUrl(),
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  expect: { timeout: 10_000 },
  timeout: 45_000,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // BackendはE2E専用DBの環境変数を明示して別TerminalまたはCI stepで起動する。
  webServer: {
    command: "npm --prefix ../frontend run dev",
    url: e2eBaseUrl(),
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_API_BASE_URL: "/api/v1",
      VITE_API_PROXY_TARGET: "http://localhost:8080",
    },
  },
});
