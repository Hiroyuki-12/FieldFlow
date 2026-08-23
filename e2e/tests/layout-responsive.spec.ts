import { expect, test } from "@playwright/test";

import { credentials, loginThroughUi } from "../fixtures/auth.ts";
import { addDays, todayInTokyo } from "../support/date.ts";

const desktopWidths = [1280, 1440] as const;
const menuWidths = [320, 390, 768, 1279] as const;

async function loginAsAdminAtWidth(
  page: Parameters<typeof loginThroughUi>[0],
  width: number,
) {
  await page.setViewportSize({ width, height: 900 });
  await loginThroughUi(page, credentials.admin);
  await expect(
    page.getByRole("heading", { name: /さん、準備を始めましょう。/ }),
  ).toBeVisible();
}

for (const width of menuWidths) {
  test(`LAYOUT-${width} xl未満は主要操作をハンバーガーへまとめる`, async ({
    page,
  }) => {
    await loginAsAdminAtWidth(page, width);

    const menuButton = page.getByRole("button", {
      name: "メニューを開く",
      exact: true,
    });
    await expect(menuButton).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "メインナビゲーション" }),
    ).toBeHidden();
    await expect(
      page.getByRole("button", { name: /アカウントメニューを開く/ }),
    ).toBeHidden();
    await expect(page.locator("aside")).toHaveCount(0);

    // 最小幅でもロゴとメニューボタンが重ならず、横スクロールを起こさないことを保証する。
    const brandBox = await page
      .getByRole("link", { name: "FieldFlow" })
      .boundingBox();
    const menuBox = await menuButton.boundingBox();
    expect(brandBox).not.toBeNull();
    expect(menuBox).not.toBeNull();
    expect(brandBox!.x + brandBox!.width).toBeLessThanOrEqual(menuBox!.x);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    // xl未満ではユーザー情報もモバイルメニュー内へ集約し、表示場所を統一する。
    await menuButton.click();
    const mobileNavigation = page.getByRole("navigation", {
      name: "モバイルナビゲーション",
    });
    await expect(mobileNavigation).toBeVisible();
    await expect(page.getByLabel("メニュー内のユーザー情報")).toBeVisible();
    for (const linkName of [
      "ホーム",
      "日別チェック",
      "道具管理",
      "作業カテゴリ管理",
      "ユーザー管理",
      "パスワード変更",
    ]) {
      await expect(
        mobileNavigation.getByRole("link", { name: linkName }),
      ).toBeVisible();
    }
    await expect(
      mobileNavigation.getByRole("button", { name: "ログアウト" }),
    ).toBeVisible();
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
      page.getByRole("button", { name: /アカウントメニューを開く/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "メニューを開く", exact: true }),
    ).toBeHidden();
    await expect(desktopNavigation).toHaveCSS("flex-wrap", "nowrap");
    await expect(page.locator("aside")).toHaveCount(0);

    const navLinks = desktopNavigation.getByRole("link");
    for (let index = 0; index < (await navLinks.count()); index += 1) {
      await expect(navLinks.nth(index)).toHaveCSS("white-space", "nowrap");
    }

    // 標準buttonをEnterで開き、先頭項目へのフォーカスと画面内配置を確認する。
    const accountButton = page.getByRole("button", {
      name: /アカウントメニューを開く/,
    });
    await accountButton.focus();
    await page.keyboard.press("Enter");
    const accountNavigation = page.getByRole("navigation", {
      name: "アカウント操作",
    });
    await expect(accountNavigation).toBeVisible();
    await expect(
      accountNavigation.getByRole("link", { name: "パスワード変更" }),
    ).toBeFocused();
    const accountBox = await accountNavigation.boundingBox();
    expect(accountBox).not.toBeNull();
    expect(accountBox!.x).toBeGreaterThanOrEqual(0);
    expect(accountBox!.x + accountBox!.width).toBeLessThanOrEqual(width);
    await page.keyboard.press("Escape");
    await expect(accountNavigation).toBeHidden();
    await expect(accountButton).toBeFocused();

    const mainBox = await page.locator("#main-content").boundingBox();
    expect(mainBox).not.toBeNull();
    // max-widthを保った中央配置により、左右余白が片側へ偏らないことを固定する。
    expect(
      Math.abs(mainBox!.x - (width - (mainBox!.x + mainBox!.width))),
    ).toBeLessThanOrEqual(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

test("LAYOUT-SM モバイルはユーザー情報をメニュー内に表示し、Escで起点へ戻す", async ({
  page,
}) => {
  await loginAsAdminAtWidth(page, 375);

  const menuButton = page.getByRole("button", {
    name: "メニューを開く",
    exact: true,
  });
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
  expect(brandBox!.x + brandBox!.width).toBeLessThanOrEqual(menuBox!.x);

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

test("LAYOUT-LONG-NAME 長いユーザー名でも320pxで横スクロールしない", async ({
  page,
}) => {
  // APIのnameを長くして、見出しとモバイルユーザー情報の実レイアウトを検証する。
  const longName =
    "非常に長い利用者名でも安全に折り返して横スクロールを発生させない管理者";
  await page.setViewportSize({ width: 320, height: 700 });
  await page.route("**/api/v1/auth/login", async (route) => {
    const response = await route.fetch();
    const payload = (await response.json()) as {
      user: Record<string, unknown>;
      [key: string]: unknown;
    };
    await route.fulfill({
      response,
      json: { ...payload, user: { ...payload.user, name: longName } },
    });
  });
  await loginThroughUi(page, credentials.admin);

  await expect(
    page.getByRole("heading", {
      name: `${longName}さん、準備を始めましょう。`,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "メニューを開く", exact: true })
    .click();
  await expect(page.getByText(longName).last()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

for (const width of [320, 390, 1280] as const) {
  test(`CHECKLIST-DIALOG-${width} 未選択理由と操作ボタンが表示領域に収まる`, async ({
    page,
  }) => {
    const longCategoryName =
      "E2E 非常に長いカテゴリ名でもチェック表作成ダイアログの横幅を超えずに折り返される作業";
    await page.setViewportSize({ width, height: width < 500 ? 568 : 900 });
    await loginThroughUi(page, credentials.worker);
    await page.goto(`/daily-checklists/${addDays(todayInTokyo(), 3)}`);
    await page.route("**/api/v1/tools?**", async (route) => {
      const response = await route.fetch();
      const payload = (await response.json()) as {
        categories: Array<Record<string, unknown>>;
        [key: string]: unknown;
      };
      await route.fulfill({
        response,
        json: {
          ...payload,
          categories: [
            ...payload.categories,
            {
              id: `layout-long-category-${width}`,
              name: longCategoryName,
              categoryType: "WORK",
              status: "ACTIVE",
              displayOrder: 999,
            },
          ],
        },
      });
    });
    await page
      .getByRole("button", { name: "この日のチェック表を作成" })
      .click();

    const dialog = page.getByRole("dialog", { name: /チェック表を作成/ });
    const header = dialog.locator("header");
    const body = dialog.locator(".overflow-y-auto");
    const footer = dialog.locator("footer");
    const createButton = dialog.getByRole("button", {
      name: "チェック表を作成",
    });
    await expect(dialog).toBeVisible();
    await expect(createButton).toBeDisabled();
    await expect(createButton).toHaveCSS("cursor", "not-allowed");
    await expect(
      dialog.getByText("作業カテゴリを1つ以上選択すると作成できます。"),
    ).toBeVisible();
    await expect(dialog.getByText(longCategoryName)).toBeVisible();
    await expect(body).toHaveCSS("overflow-y", "auto");

    const dialogBox = await dialog.boundingBox();
    const bodyBox = await body.boundingBox();
    const footerBoxBeforeSelection = await footer.boundingBox();
    const headerBoxBeforeScroll = await header.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(bodyBox).not.toBeNull();
    expect(footerBoxBeforeSelection).not.toBeNull();
    expect(headerBoxBeforeScroll).not.toBeNull();
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(width);
    // flex配置の本文末尾とフッターを比較し、固定操作部が本文へ重ならないことを保証する。
    expect(bodyBox!.y + bodyBox!.height).toBeLessThanOrEqual(
      footerBoxBeforeSelection!.y + 1,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    const longCategoryBox = await dialog
      .getByText(longCategoryName)
      .boundingBox();
    expect(longCategoryBox).not.toBeNull();
    expect(longCategoryBox!.width).toBeLessThanOrEqual(bodyBox!.width);

    await dialog.getByLabel(longCategoryName).check();
    await expect(createButton).toBeEnabled();
    await expect(footer).toBeVisible();
    const footerBoxAfterSelection = await footer.boundingBox();
    expect(footerBoxAfterSelection).not.toBeNull();
    // 補足文が消えても予約領域を残し、操作ボタンが大きく跳ねないことを確認する。
    expect(
      Math.abs(footerBoxAfterSelection!.y - footerBoxBeforeSelection!.y),
    ).toBeLessThanOrEqual(1);

    await dialog.getByLabel("午前・午後").check();
    const morningButton = dialog.getByRole("button", { name: /午前/ });
    const afternoonButton = dialog.getByRole("button", { name: /午後/ });
    await expect(morningButton).toContainText("(0)");
    await dialog.getByLabel(longCategoryName).check();
    await expect(morningButton).toContainText("(1)");
    await afternoonButton.click();
    await expect(afternoonButton).toContainText("(0)");
    await expect(
      dialog.getByText("午後の作業カテゴリを1つ以上選択してください。"),
    ).toBeVisible();

    // 本文を動かしても、ヘッダーと操作フッターはダイアログ内の同じ位置に残る。
    await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const headerBoxAfterScroll = await header.boundingBox();
    const footerBoxAfterScroll = await footer.boundingBox();
    expect(headerBoxAfterScroll).not.toBeNull();
    expect(footerBoxAfterScroll).not.toBeNull();
    expect(headerBoxAfterScroll!.y).toBe(headerBoxBeforeScroll!.y);
    expect(footerBoxAfterScroll!.y).toBe(footerBoxAfterSelection!.y);
  });
}
