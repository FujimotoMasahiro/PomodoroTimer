// 初めての人向けの使い方案内 (issue #16)。
// 初回訪問だけ自動で出て、2 回目以降は出ない。「使い方」ボタンでいつでも開ける。
import { test, expect, gotoApp } from './fixtures.js';

const guide = '#welcome-guide';

test.describe('初めての人向けの使い方案内', () => {
  test('初回訪問で表示され、タイマーと音源の選び方・上級者向け機能を案内する', async ({ page }) => {
    await gotoApp(page, { dismissWelcome: false, openSettings: false });
    await expect(page.locator(guide)).toBeVisible();
    await expect(page.locator(guide)).toContainText('スタート');
    await expect(page.locator(guide)).toContainText('音源を選ぶ');
    await expect(page.locator(guide).locator('summary')).toHaveText('上級者向けの機能');
    await expect(page.locator(guide)).toContainText('Google カレンダー連携');
    await expect(page.locator(guide)).toContainText('Chrome 拡張機能');
  });

  test('2 回目以降は表示しない (閉じずにリロードしても出ない)', async ({ page }) => {
    await gotoApp(page, { dismissWelcome: false, openSettings: false });
    await expect(page.locator(guide)).toBeVisible();
    await page.reload();
    await expect(page.locator('#timer')).toHaveText(/^\d{2}:\d{2}$/);
    await expect(page.locator(guide)).toBeHidden();
  });

  test('「はじめる」で閉じ、「使い方」で再び開ける', async ({ page }) => {
    await gotoApp(page, { dismissWelcome: false, openSettings: false });
    await page.locator('#welcome-close-btn').click();
    await expect(page.locator(guide)).toBeHidden();
    await page.locator('#welcome-open-btn').click();
    await expect(page.locator(guide)).toBeVisible();
    await page.locator('#welcome-close-x').click();
    await expect(page.locator(guide)).toBeHidden();
  });

  test('「設定を開く」で畳まれた設定が開き、作業中の音源の選択欄に移る', async ({ page }) => {
    await gotoApp(page, { dismissWelcome: false, openSettings: false });
    await expect(page.locator('#panel-settings')).not.toHaveClass(/\bshow\b/);
    await page.locator('#welcome-open-settings').click();
    await expect(page.locator('#panel-settings')).toHaveClass(/\bshow\b/);
    await expect(page.locator('#work-source')).toBeFocused();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pomodoro_sidebar_panels')));
    expect(saved.settings).toBe(true);
  });

  test('案内を出した初回訪問では拡張機能モーダルを重ねて出さない', async ({ page }) => {
    await gotoApp(page, { dismissWelcome: false, dismissExtModal: false, openSettings: false });
    await expect(page.locator(guide)).toBeVisible();
    await page.waitForLoadState('load');
    await page.waitForTimeout(500);
    await expect(page.locator('#extInstallModal')).toBeHidden();
  });
});
