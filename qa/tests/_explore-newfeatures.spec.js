// 探索用: サイドバー（「設定」のトグル式アコーディオン）の
// 見た目/レイアウト/モバイル耐性の証跡取得 spec（命名に _ を付け既存と区別）。
//
// レイアウト仕様:
//  - 「設定」パネル(.settings-col)はヘッダーの「設定」ボタンで開閉する。既定は畳む。
//    畳んでいる間は列ごと消える。開くと PC では音の下 (1400px〜は右端の列)、スマホでは下に出る (issue #32)。
//  - 開閉状態は localStorage['pomodoro_sidebar_panels'] に保存され、次回もその状態で開く。
//  - 「今日の予定」(Google カレンダー連携) は 2026-11-23 に廃止（issue #21）。
//  - ToDo(Tasks) カラムは仕様削除済み。
import { test, expect, gotoApp } from './fixtures.js';

const SHOT_DIR = 'reports/screenshots';
const PANELS_KEY = 'pomodoro_sidebar_panels';

const settingsItem = (page) => page.locator('#panel-settings').locator('xpath=ancestor::div[contains(@class,"accordion-item")][1]');
const savedPanels = (page) =>
  page.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } }, PANELS_KEY);

// 素の既定状態（seed 無し）で開く
const gotoRaw = (page) => gotoApp(page, { openSettings: false });

async function expectNoOverflow(page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe('探索: サイドバーのアコーディオン（設定）', () => {
  test('デスクトップ幅: 設定は既定で畳まれ、予定パネルは無い（証跡）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoRaw(page);

    await expect(page.locator('#panel-settings')).not.toHaveClass(/show/);
    await expect(page.locator('#panel-settings-toggle')).toBeVisible();
    // 畳んでいる間は空の枠を出さない
    await expect(page.locator('.settings-col')).toBeHidden();
    await expect(page.locator('#panel-today')).toHaveCount(0);

    await page.locator('#panel-settings-toggle').click();
    await expect(page.locator('#panel-settings')).toHaveClass(/show/);
    const col = page.locator('.settings-col');
    await col.screenshot({ path: `${SHOT_DIR}/sidebar-desktop.png` });
    const colBox = await col.boundingBox();
    const itemBox = await settingsItem(page).boundingBox();
    expect(itemBox.width).toBeGreaterThan(colBox.width * 0.9);

    await expect(page.locator('#gtasks-list')).toHaveCount(0);
    await expectNoOverflow(page);
  });

  test('モバイル幅(390): 設定パネルが全幅・横はみ出しなし（証跡）', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoRaw(page);
    await page.locator('#panel-settings-toggle').click();
    await expect(page.locator('#panel-settings')).toHaveClass(/show/);

    const col = page.locator('.settings-col');
    await col.scrollIntoViewIfNeeded();
    await col.screenshot({ path: `${SHOT_DIR}/sidebar-mobile.png` });

    const colBox = await col.boundingBox();
    const itemBox = await settingsItem(page).boundingBox();
    expect(itemBox.width).toBeGreaterThan(colBox.width * 0.9);
    await expectNoOverflow(page);
  });

  test('設定を開くと音源設定が使える（証跡）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoRaw(page);

    await page.locator('#panel-settings-toggle').click();
    await expect(page.locator('#work-source')).toBeVisible();
    await page.selectOption('#work-source', 'voicy');
    await expect(page.locator('#voicy-url')).toBeVisible();
    await page.locator('.settings-col').screenshot({ path: `${SHOT_DIR}/settings-panel.png` });
  });

  // 触れない項目は置かない（2026-08-29 削除）
  test('「今後バージョンアップにて〜」の無効フォームは無い', async ({ page }) => {
    await gotoRaw(page);
    await page.locator('#panel-settings-toggle').click();
    await expect(page.locator('#settings-form')).toHaveCount(0);
    await expect(page.locator('#work-duration')).toHaveCount(0);
    await expect(page.locator('#mute-notifications')).toHaveCount(0);
    await expect(page.locator('.settings-col')).not.toContainText('今後バージョンアップ');
  });
});

test.describe('探索: アコーディオンのトグルと状態保存', () => {
  test('開閉は localStorage に保存され、リロードで復元される', async ({ page }) => {
    await gotoRaw(page);

    await page.locator('#panel-settings-toggle').click();
    await expect(page.locator('#panel-settings')).toHaveClass(/show/);
    await expect.poll(async () => await savedPanels(page)).toEqual({ settings: true });

    await page.reload();
    await expect(page.locator('#timer')).toHaveText(/^\d{2}:\d{2}$/);
    await expect(page.locator('#panel-settings')).toHaveClass(/show/);

    await page.locator('#panel-settings-toggle').click();
    await expect(page.locator('#panel-settings')).not.toHaveClass(/show/);
    await expect.poll(async () => await savedPanels(page)).toEqual({ settings: false });
  });

  test('保存値が壊れていても既定（設定=畳む）で描画される', async ({ page }) => {
    await gotoApp(page, { openSettings: false, localStorage: { [PANELS_KEY]: 'not-json' } });
    await expect(page.locator('#panel-settings')).not.toHaveClass(/show/);
  });

  test('旧形式の保存値（today を含む）でも設定の開閉は復元される', async ({ page }) => {
    await gotoApp(page, { localStorage: { [PANELS_KEY]: JSON.stringify({ today: false, settings: true }) } });
    await expect(page.locator('#panel-settings')).toHaveClass(/show/);
  });
});
