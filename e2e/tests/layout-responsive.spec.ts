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
  test(`LAYOUT-${width} xl未満は右端ハンバーガーへ切り替わる`, async ({
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
    await expect(
      page.getByLabel("ログイン中のユーザー"),
    ).toBeVisible();

    // 開いた後はアクセシブル名が「メニューを閉じる」に変わるため、位置はクリック前に測る。
    const menuBox = await menuButton.boundingBox();
    expect(menuBox).not.toBeNull();
    expect(width - (menuBox!.x + menuBox!.width)).toBeLessThanOrEqual(32);

    // sm以上ではユーザー情報をヘッダーに残し、メニュー内で重複表示しない。
    await menuButton.click();
    const mobileNavigation = page.getByRole("navigation", {
      name: "モバイルナビゲーション",
    });
    await expect(mobileNavigation).toBeVisible();
    await expect(
      page.getByLabel("メニュー内のユーザー情報"),
    ).toBeHidden();
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
  await expect(
    page.getByLabel("メニュー内のユーザー情報"),
  ).toBeVisible();
  await expect(mobileNavigation.getByRole("link").first()).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(mobileNavigation).toBeHidden();
  await expect(menuButton).toBeFocused();

  const menuBox = await menuButton.boundingBox();
  expect(menuBox).not.toBeNull();
  expect(375 - (menuBox!.x + menuBox!.width)).toBeLessThanOrEqual(24);
});
