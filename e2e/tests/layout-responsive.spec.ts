import { expect, test } from "@playwright/test";

import { credentials, loginThroughUi } from "../fixtures/auth.ts";

const desktopWidths = [1280, 1440] as const;
const menuWidths = [768, 1024] as const;

async function loginAsAdminAtWidth(
  page: Parameters<typeof loginThroughUi>[0],
  width: number,
) {
  await page.setViewportSize({ width, height: 900 });
  await loginThroughUi(page, credentials.admin);
  await expect(
    page.getByRole("heading", { name: /おはようございます/ }),
  ).toBeVisible();
}

for (const width of menuWidths) {
  test(`LAYOUT-${width} xl未満はFieldFlow直後のハンバーガーへ切り替わる`, async ({
    page,
  }) => {
    await loginAsAdminAtWidth(page, width);

    const menuButton = page.getByRole("button", { name: "メニューを開く" });
    await expect(menuButton).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "メインナビゲーション" }),
    ).toBeHidden();
    await expect(
      page.getByRole("navigation", { name: "アカウントメニュー" }),
    ).toBeHidden();
    await expect(page.getByLabel("ログイン中のユーザー")).toBeVisible();

    // ユーザー情報の左ではなく、ブランド直後に置かれることを座標でも固定する。
    const brandBox = await page
      .getByRole("link", { name: "FieldFlow" })
      .boundingBox();
    const menuBox = await menuButton.boundingBox();
    const userBox = await page.getByLabel("ログイン中のユーザー").boundingBox();
    expect(brandBox).not.toBeNull();
    expect(menuBox).not.toBeNull();
    expect(userBox).not.toBeNull();
    expect(menuBox!.x - (brandBox!.x + brandBox!.width)).toBeLessThanOrEqual(
      24,
    );
    expect(userBox!.x).toBeGreaterThan(menuBox!.x + menuBox!.width);

    // sm以上ではユーザー情報をヘッダーに残し、メニュー内で重複表示しない。
    await menuButton.click();
    const mobileNavigation = page.getByRole("navigation", {
      name: "モバイルナビゲーション",
    });
    await expect(mobileNavigation).toBeVisible();
    await expect(page.getByLabel("メニュー内のユーザー情報")).toBeHidden();
  });
}

for (const width of desktopWidths) {
  test(`LAYOUT-${width} xl以上は折り返さない横並びナビゲーションを表示する`, async ({
    page,
  }) => {
    await loginAsAdminAtWidth(page, width);

    const desktopNavigation = page.getByRole("navigation", {
      name: "メインナビゲーション",
    });
    await expect(desktopNavigation).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "アカウントメニュー" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "メニューを開く" }),
    ).toBeHidden();
    await expect(desktopNavigation).toHaveCSS("flex-wrap", "nowrap");

    const navLinks = desktopNavigation.getByRole("link");
    for (let index = 0; index < (await navLinks.count()); index += 1) {
      await expect(navLinks.nth(index)).toHaveCSS("white-space", "nowrap");
    }
  });
}

test("LAYOUT-SM sm未満はユーザー情報をメニュー内に表示し、Escで起点へ戻す", async ({
  page,
}) => {
  await loginAsAdminAtWidth(page, 375);

  await expect(page.getByLabel("ログイン中のユーザー")).toBeHidden();
  const menuButton = page.getByRole("button", { name: "メニューを開く" });
  await menuButton.focus();
  await menuButton.click();

  const mobileNavigation = page.getByRole("navigation", {
    name: "モバイルナビゲーション",
  });
  await expect(mobileNavigation).toBeVisible();
  await expect(page.getByLabel("メニュー内のユーザー情報")).toBeVisible();
  await expect(mobileNavigation.getByRole("link").first()).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(mobileNavigation).toBeHidden();
  await expect(menuButton).toBeFocused();

  const menuBox = await menuButton.boundingBox();
  const brandBox = await page
    .getByRole("link", { name: "FieldFlow" })
    .boundingBox();
  expect(menuBox).not.toBeNull();
  expect(brandBox).not.toBeNull();
  expect(menuBox!.x - (brandBox!.x + brandBox!.width)).toBeLessThanOrEqual(24);

  // 高さも狭い端末で、作成・編集モーダルの本文だけがスクロールし、操作欄を見失わないことを確認する。
  await page.setViewportSize({ width: 375, height: 568 });
  await menuButton.click();
  await page
    .getByRole("navigation", { name: "モバイルナビゲーション" })
    .getByRole("link", { name: "道具管理" })
    .click();
  await expect(page.getByRole("heading", { name: "道具管理" })).toBeVisible();

  for (const openButton of [
    page.getByRole("button", { name: "道具を作成" }),
    page.getByRole("button", { name: "編集" }).first(),
  ]) {
    await openButton.click();
    const dialog = page.getByRole("dialog");
    const body = dialog.locator(".overflow-y-auto");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("名前")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "保存" })).toBeVisible();
    expect(
      await body.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    ).toBe(true);
    await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(
      dialog.getByText(
        "保有数はチームの総数です。日別の持ち出し操作では増減しません。",
      ),
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "保存" })).toBeVisible();

    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox!.y).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(568);
    await dialog.getByRole("button", { name: "キャンセル" }).click();
  }
});
