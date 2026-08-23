import { expect, test } from "@playwright/test";

import { credentials, loginThroughUi } from "../fixtures/auth.ts";
import { e2eApiUrl, e2eBaseUrl } from "../support/environment.ts";

test("E2E-AUTH-01 仮パスワードを変更し、新しいパスワードで再ログインできる", async ({
  page,
}) => {
  const accessToken = await loginThroughUi(page, credentials.firstLogin);
  await expect(
    page.getByRole("heading", { name: "初回パスワード変更" }),
  ).toBeVisible();

  // Frontendを経由しないリクエストでも、Backendが初回変更状態を守ることを確認する。
  const unchangedResponse = await page.request.patch(
    `${e2eApiUrl()}/auth/password`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        currentPassword: credentials.firstLogin.password,
        newPassword: credentials.firstLogin.password,
      },
    },
  );
  expect(unchangedResponse.status()).toBe(422);
  await expect(unchangedResponse.json()).resolves.toMatchObject({
    code: "PASSWORD_UNCHANGED",
  });

  const username = page.locator('input[name="username"]');
  const currentPassword = page.getByLabel("現在の仮パスワード", {
    exact: true,
  });
  const newPassword = page.getByLabel("新しいパスワード", { exact: true });
  const confirmation = page.getByLabel("新しいパスワード（確認）", {
    exact: true,
  });
  await expect(username).toHaveValue(credentials.firstLogin.loginId);
  await expect(username).toHaveAttribute("autocomplete", "username");
  await expect(currentPassword).toHaveAttribute("name", "current-password");
  await expect(currentPassword).toHaveAttribute(
    "autocomplete",
    "current-password",
  );
  await expect(newPassword).toHaveAttribute("name", "new-password");
  await expect(newPassword).toHaveAttribute("autocomplete", "new-password");
  await expect(confirmation).toHaveAttribute(
    "name",
    "new-password-confirmation",
  );
  await expect(confirmation).toHaveAttribute("autocomplete", "new-password");
  await expect(page.getByRole("note")).toContainText(
    "仮パスワードと同じパスワードは設定できません。",
  );

  await currentPassword.fill(credentials.firstLogin.password);
  await newPassword.fill(credentials.firstLogin.password);
  await confirmation.fill(credentials.firstLogin.password);
  await page.getByRole("button", { name: "現在の仮パスワードを表示" }).click();
  await expect(currentPassword).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "変更して再ログイン" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "仮パスワードと同じパスワードは設定できません。",
  );
  await expect(
    page.getByRole("heading", { name: "初回パスワード変更" }),
  ).toBeVisible();

  await newPassword.fill(credentials.firstChangedPassword);
  await confirmation.fill(credentials.firstChangedPassword);
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
