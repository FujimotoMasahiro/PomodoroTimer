// プライバシーポリシー / 利用規約ページ (#17) とフッターからのリンクの検証。
import { test, expect, gotoApp } from './fixtures.js';

test.describe('フッター: プライバシーポリシー・利用規約', () => {
  test('フッターからプライバシーポリシーを開ける', async ({ page }) => {
    await gotoApp(page);
    await page.locator('footer a', { hasText: 'プライバシーポリシー' }).click();
    await expect(page).toHaveURL(/\/privacy\.html$/);
    await expect(page.locator('h1')).toHaveText('プライバシーポリシー');
    // GA とカレンダー連携 (Limited Use) について書いてあること
    await expect(page.locator('main')).toContainText('Google アナリティクス');
    await expect(page.locator('main')).toContainText('Google API Services User Data Policy');
    // 相互リンクとトップへの戻り
    await page.locator('main a', { hasText: '利用規約' }).click();
    await expect(page).toHaveURL(/\/terms\.html$/);
  });

  test('フッターから利用規約を開け、トップへ戻れる', async ({ page }) => {
    await gotoApp(page);
    await page.locator('footer a', { hasText: '利用規約' }).click();
    await expect(page).toHaveURL(/\/terms\.html$/);
    await expect(page.locator('h1')).toHaveText('利用規約');
    await page.locator('a', { hasText: '← ポモドーロタイマーに戻る' }).click();
    await expect(page.locator('#timer')).toBeVisible();
  });
});
