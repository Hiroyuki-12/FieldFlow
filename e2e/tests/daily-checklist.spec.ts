import { expect, test, type Locator, type Page } from "@playwright/test";

import { credentials, loginThroughUi } from "../fixtures/auth.ts";
import { addDays, todayInTokyo } from "../support/date.ts";

async function waitForSaved(page: Page, input: Locator): Promise<void> {
  // 正常状態は画面全体へ集約し、各道具で「保存済み」が反復する回帰を防ぐ。
  await expect(page.getByLabel("自動保存の状態")).toContainText(
    "すべて保存済み",
  );
  await expect(
    input.locator("xpath=ancestor::li").getByText("保存済み", { exact: true }),
  ).toHaveCount(0);
}

test("E2E-CHECK-01/02/04/05 日別表を作成・自動保存・追加・変更・削除・再作成できる", async ({
  page,
}) => {
  await loginThroughUi(page, credentials.worker);
  await expect(
    page.getByRole("heading", { name: /さん、準備を始めましょう。/ }),
  ).toBeVisible();

  // 現場利用者の入口であるホームから、今日の表作成フローへ進む。
  await page.getByRole("button", { name: /今日のチェックを作成/ }).click();
  let dialog = page.getByRole("dialog", { name: /チェック表を作成/ });
  const createButton = dialog.getByRole("button", {
    name: "チェック表を作成",
  });
  await expect(createButton).toBeDisabled();
  // 午前だけ選んだ段階で送信できる回帰を防ぎ、両時間帯の入力を要求する。
  await dialog.getByLabel("午前・午後").check();
  await dialog.getByLabel("E2E 電気工事").check();
  await expect(createButton).toBeDisabled();
  await expect(
    dialog.getByText("午後の作業カテゴリを1つ以上選択してください。"),
  ).toBeVisible();
  await dialog.getByRole("button", { name: /午後/ }).click();
  await dialog.getByLabel("E2E 配管工事").check();
  await expect(createButton).toBeEnabled();
  await createButton.click();
  // Homeは保存後に日別画面へ遷移するため、遷移先と作成内容を成功条件にする。
  await expect(page).toHaveURL(/\/daily-checklists\/\d{4}-\d{2}-\d{2}$/);
  await expect(
    page.getByRole("heading", { name: "日別チェック" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "確認が必要" })).toBeVisible();
  await expect(page.getByText("数量未設定 2カテゴリ")).toBeVisible();
  await expect(page.getByLabel("自動保存の状態")).toContainText(
    "すべて保存済み",
  );
  await expect(
    page.getByText("持ち出し対象外", { exact: true }).first(),
  ).toBeVisible();

  const testerQuantity = page.getByRole("spinbutton", {
    name: "E2E テスターの持ち出し数",
  });
  await testerQuantity.fill("2");
  await testerQuantity.press("Tab");
  await waitForSaved(page, testerQuantity);
  await expect(
    testerQuantity.locator("xpath=ancestor::li").getByText("未準備", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "E2E テスターを準備済みにする" })
    .check();
  await waitForSaved(page, testerQuantity);
  await expect(page.getByRole("heading", { name: "確認が必要" })).toBeVisible();
  await expect(page.getByText("数量未設定 1カテゴリ")).toBeVisible();

  // 自動追加される共通道具も確認対象に含め、未設定のまま完了扱いにしない。
  const helmetQuantity = page.getByRole("spinbutton", {
    name: "E2E ヘルメットの持ち出し数",
  });
  await helmetQuantity.fill("1");
  await helmetQuantity.press("Tab");
  await waitForSaved(page, helmetQuantity);
  await page
    .getByRole("checkbox", { name: "E2E ヘルメットを準備済みにする" })
    .check();
  await waitForSaved(page, helmetQuantity);
  await expect(page.getByRole("heading", { name: "準備完了" })).toBeVisible();
  await expect(page.getByText("数量未設定 0カテゴリ")).toBeVisible();

  await page.getByRole("button", { name: "午後" }).click();
  const wrenchQuantity = page.getByRole("spinbutton", {
    name: "E2E パイプレンチの持ち出し数",
  });
  await wrenchQuantity.fill("1");
  await wrenchQuantity.press("Tab");
  await waitForSaved(page, wrenchQuantity);
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
  await expect(
    dialog.getByRole("button", { name: "変更を保存" }),
  ).toBeDisabled();
  await dialog.getByLabel("E2E 電気工事").check();
  await expect(
    dialog.getByRole("button", { name: "変更を保存" }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "変更を保存" }).click();
  await expect(dialog.getByText("入力済みの内容があります")).toBeVisible();
  await dialog.getByRole("button", { name: "変更を確定する" }).click();
  await expect(
    page.getByText("時間帯・作業内容を変更しました。"),
  ).toBeVisible();
  await expect(
    page.getByText("1日通し", { exact: true }).first(),
  ).toBeVisible();

  const otherActions = page.getByRole("button", { name: "その他の操作" });
  await expect(otherActions).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("button", { name: "この日のチェック表を削除する" }),
  ).toBeHidden();
  await otherActions.click();
  await expect(otherActions).toHaveAttribute("aria-expanded", "true");
  const openDelete = page.getByRole("button", {
    name: "この日のチェック表を削除する",
  });
  await openDelete.click();
  let deleteDialog = page.getByRole("dialog", {
    name: "この日のチェック表を削除しますか？",
  });
  await expect(deleteDialog).toContainText(todayInTokyo().slice(8));
  await expect(
    deleteDialog.getByRole("button", { name: "キャンセル" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(deleteDialog).toBeHidden();
  await expect(openDelete).toBeFocused();

  await openDelete.click();
  deleteDialog = page.getByRole("dialog", {
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
