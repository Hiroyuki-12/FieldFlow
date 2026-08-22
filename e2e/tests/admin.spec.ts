import { expect, test } from "@playwright/test";

import { credentials, loginThroughUi } from "../fixtures/auth.ts";
import { e2eApiUrl } from "../support/environment.ts";

test("E2E-ADMIN-01 管理者がカテゴリ・道具・作業者を画面から作成できる", async ({
  page,
}) => {
  await loginThroughUi(page, credentials.admin);

  await page.getByRole("link", { name: "作業カテゴリ管理" }).first().click();
  await page.getByRole("button", { name: "作業カテゴリを作成" }).click();
  const categoryDialog = page.getByRole("dialog", {
    name: "作業カテゴリを作成",
  });
  await categoryDialog.getByLabel("名前").fill("E2E 管理作成カテゴリ");
  await categoryDialog.getByLabel("表示順").fill("90");
  await categoryDialog.getByRole("button", { name: "保存" }).click();
  await expect(
    page.getByText("E2E 管理作成カテゴリを作成しました。"),
  ).toBeVisible();

  await page.getByRole("link", { name: "道具管理" }).first().click();
  await page.getByRole("button", { name: "道具を作成" }).click();
  const toolDialog = page.getByRole("dialog", { name: "道具を作成" });
  await toolDialog.getByLabel("名前").fill("E2E 管理作成工具");
  await toolDialog
    .getByLabel("作業カテゴリ")
    .selectOption({ label: "E2E 管理作成カテゴリ" });
  await toolDialog.getByLabel("保有数").fill("7");
  await toolDialog.getByLabel("表示順").fill("90");
  await toolDialog.getByRole("button", { name: "保存" }).click();
  await expect(
    page.getByText("E2E 管理作成工具を作成しました。"),
  ).toBeVisible();

  await page.getByRole("link", { name: "ユーザー管理" }).first().click();
  await page.getByRole("button", { name: "ユーザーを作成" }).click();
  const userDialog = page.getByRole("dialog", { name: "ユーザーを作成" });
  await userDialog.getByLabel("名前").fill("E2E 管理作成作業者");
  await userDialog.getByLabel("ログインID").fill("e2e.created.worker");
  await userDialog.getByLabel("権限").selectOption("WORKER");
  await userDialog.getByRole("button", { name: "保存" }).click();

  const passwordDialog = page.getByRole("dialog", {
    name: "仮パスワードを発行しました",
  });
  await expect(
    passwordDialog.getByText("仮パスワード", { exact: true }),
  ).toBeVisible();
  const temporaryPassword = await passwordDialog.locator("code").textContent();
  expect(temporaryPassword?.trim()).toHaveLength(16);
});

test("E2E-ADMIN-02 作業者は管理メニュー・直URL・管理APIを利用できない", async ({
  page,
}) => {
  const accessToken = await loginThroughUi(page, credentials.worker);
  await expect(
    page.getByRole("link", { name: "作業カテゴリ管理" }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "ユーザー管理" })).toHaveCount(0);

  await page.goto("/users");
  await expect(
    page.getByRole("heading", {
      name: "この画面を利用する権限がありません",
    }),
  ).toBeVisible();

  const response = await page.request.get(`${e2eApiUrl()}/users`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(response.status()).toBe(403);
});
