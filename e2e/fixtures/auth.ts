import { expect, type Page } from "@playwright/test";

import {
  loadE2EEnvironment,
  requiredEnvironmentValue,
} from "../support/environment.ts";

loadE2EEnvironment();

export interface E2ECredentials {
  loginId: string;
  password: string;
}

export const credentials = {
  admin: {
    loginId: "e2e.admin",
    password: requiredEnvironmentValue("E2E_ADMIN_PASSWORD"),
  },
  worker: {
    loginId: "e2e.worker",
    password: requiredEnvironmentValue("E2E_WORKER_PASSWORD"),
  },
  firstLogin: {
    loginId: "e2e.first",
    password: requiredEnvironmentValue("E2E_FIRST_LOGIN_PASSWORD"),
  },
  firstChangedPassword: requiredEnvironmentValue("E2E_FIRST_CHANGED_PASSWORD"),
} as const;

interface LoginResponse {
  accessToken: string;
}

/** 実画面からログインし、API権限検証にも使えるAccess Tokenだけをメモリで返す。 */
export async function loginThroughUi(
  page: Page,
  input: E2ECredentials,
): Promise<string> {
  await page.goto("/login");
  await page.getByLabel("ログインID").fill(input.loginId);
  await page.getByLabel("パスワード").fill(input.password);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/auth/login") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "ログイン" }).click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  return ((await response.json()) as LoginResponse).accessToken;
}
