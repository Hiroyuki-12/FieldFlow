import { expect, test } from "@playwright/test";

import { credentials, loginThroughUi } from "../fixtures/auth.ts";
import { e2eApiUrl, e2eBaseUrl } from "../support/environment.ts";

test("E2E-AUTH-01 仮パスワードを変更し、新しいパスワードで再ログインできる", async ({
  page,
}) => {
  await loginThroughUi(page, credentials.firstLogin);
  await expect(
    page.getByRole("heading", { name: "初回パスワード変更" }),
  ).toBeVisible();

  await page
    .getByLabel("現在の仮パスワード")
    .fill(credentials.firstLogin.password);
  await page
    .getByLabel("新しいパスワード", { exact: true })
    .fill(credentials.firstChangedPassword);
  await page
    .getByLabel("新しいパスワード（確認）")
    .fill(credentials.firstChangedPassword);
  await page.getByRole("button", { name: "変更して再ログイン" }).click();

  await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
  await expect(page.getByText("パスワードを変更しました。")).toBeVisible();
  await loginThroughUi(page, {
    loginId: credentials.firstLogin.loginId,
    password: credentials.firstChangedPassword,
  });
  await expect(
    page.getByRole("heading", { name: /おはようございます/ }),
  ).toBeVisible();
});

test("E2E-AUTH-02 Refresh後にログアウトすると保護画面へ戻れない", async ({
  page,
}) => {
  await loginThroughUi(page, credentials.worker);
  await expect(
    page.getByRole("heading", { name: /おはようございます/ }),
  ).toBeVisible();

  const refreshResponse = await page.request.post(
    `${e2eApiUrl()}/auth/refresh`,
    {
      // Cookieを使う更新系APIはCSRF防御のOrigin完全一致も含めて検証する。
      headers: { Origin: e2eBaseUrl() },
    },
  );
  expect(refreshResponse.ok()).toBe(true);
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();

  await page.goto("/tools");
  await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
  await expect(page).toHaveURL(/\/login\?redirect=/);
});
