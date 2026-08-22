import { expect, test, type Locator } from "@playwright/test";

import { credentials, loginThroughUi } from "../fixtures/auth.ts";
import { addDays, todayInTokyo } from "../support/date.ts";

async function waitForSaved(input: Locator): Promise<void> {
  const row = input.locator("xpath=ancestor::li");
  await expect(row.getByText("保存済み")).toBeVisible();
}

test("E2E-CHECK-01/02/04/05 日別表を作成・自動保存・追加・変更・削除・再作成できる", async ({
  page,
}) => {
  await loginThroughUi(page, credentials.worker);
  await expect(
    page.getByRole("heading", { name: /おはようございます/ }),
  ).toBeVisible();

  // 現場利用者の入口であるホームから、今日の表作成フローへ進む。
  await page.getByRole("button", { name: /今日のチェックを作成/ }).click();
  let dialog = page.getByRole("dialog", { name: /チェック表を作成/ });
  await dialog.getByLabel("午前・午後").check();
  await dialog.getByLabel("E2E 電気工事").check();
  await dialog.getByRole("button", { name: /午後/ }).click();
  await dialog.getByLabel("E2E 配管工事").check();
  await dialog.getByRole("button", { name: "チェック表を作成" }).click();
  // Homeは保存後に日別画面へ遷移するため、遷移先と作成内容を成功条件にする。
  await expect(page).toHaveURL(/\/daily-checklists\/\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByRole("heading", { name: "日別チェック" })).toBeVisible();

  const testerQuantity = page.getByRole("spinbutton", {
    name: "E2E テスターの持ち出し数",
  });
  await testerQuantity.fill("2");
  await testerQuantity.press("Tab");
  await waitForSaved(testerQuantity);
  await page
    .getByRole("checkbox", { name: "E2E テスターを準備済みにする" })
    .check();
  await waitForSaved(testerQuantity);

  await page.getByRole("button", { name: "午後" }).click();
  const wrenchQuantity = page.getByRole("spinbutton", {
    name: "E2E パイプレンチの持ち出し数",
  });
  await wrenchQuantity.fill("1");
  await wrenchQuantity.press("Tab");
  await waitForSaved(wrenchQuantity);
  await page.getByRole("button", { name: "午前" }).click();
  await expect(testerQuantity).toHaveValue("2");
  await expect(
    page.getByRole("checkbox", { name: "E2E テスターを準備済みにする" }),
  ).toBeChecked();

  await page.getByRole("button", { name: "作業カテゴリを追加" }).click();
  const additionDialog = page.getByRole("dialog", {
    name: "作業カテゴリを追加",
  });
  await additionDialog.getByLabel("E2E 追加作業").check();
  await additionDialog
    .getByRole("button", { name: "選択したカテゴリを追加" })
    .click();
  await expect(
    page.getByText("午前へ作業カテゴリを追加しました。"),
  ).toBeVisible();
  await expect(page.getByText("E2E 追加工具", { exact: true })).toBeVisible();

  await page.reload();
  await expect(testerQuantity).toHaveValue("2");
  await expect(page.getByText("E2E 追加工具", { exact: true })).toBeVisible();

  await page
    .getByRole("button", { name: "時間帯・作業内容を変更する" })
    .click();
  dialog = page.getByRole("dialog", { name: /時間帯・作業内容を変更/ });
  await dialog.getByLabel("1日通し").check();
  await dialog.getByLabel("E2E 電気工事").check();
  await dialog.getByRole("button", { name: "変更を保存" }).click();
  await expect(dialog.getByText("入力済みの内容があります")).toBeVisible();
  await dialog.getByRole("button", { name: "変更を確定する" }).click();
  await expect(
    page.getByText("時間帯・作業内容を変更しました。"),
  ).toBeVisible();
  await expect(
    page.getByText("1日通し", { exact: true }).first(),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "この日のチェック表を削除する" })
    .click();
  const deleteDialog = page.getByRole("dialog", {
    name: "この日のチェック表を削除しますか？",
  });
  await deleteDialog.getByRole("button", { name: "削除する" }).click();
  await expect(
    page.getByText("この日のチェック表を削除しました。"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "この日のチェック表はありません" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "この日のチェック表を作成" }).click();
  dialog = page.getByRole("dialog", { name: /チェック表を作成/ });
  await dialog.getByLabel("E2E 配管工事").check();
  await dialog.getByRole("button", { name: "チェック表を作成" }).click();
  await expect(
    page.getByText("この日のチェック表を作成しました。"),
  ).toBeVisible();
  await expect(
    page.getByText("E2E パイプレンチ", { exact: true }),
  ).toBeVisible();
});

test("E2E-CHECK-03 過去日は保存済み内容を閲覧できるが編集できない", async ({
  page,
}) => {
  const yesterday = addDays(todayInTokyo(), -1);
  await loginThroughUi(page, credentials.worker);
  await page.goto(`/daily-checklists/${yesterday}`);

  await expect(page.getByText("過去日のため閲覧のみです。")).toBeVisible();
  await expect(page.getByText("E2E テスター", { exact: true })).toBeVisible();
  await expect(page.getByText("持出 2")).toBeVisible();
  await expect(
    page.getByRole("spinbutton", { name: /持ち出し数/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "作業カテゴリを追加" }),
  ).toHaveCount(0);
});
