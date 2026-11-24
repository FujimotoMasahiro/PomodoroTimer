// 案 A の画面表示 (issue #32): 状態ごとの色・リング・次のフェーズの案内・回数ドット・
// タブ名の残り時間・Space キー操作。
import { test, expect, gotoApp } from './fixtures.js';

const phase = (page) => page.evaluate(() => document.body.dataset.phase);
const ringOffset = (page) =>
  page.evaluate(() => parseFloat(document.getElementById('timer-ring-progress').style.strokeDashoffset || '0'));

test.describe('案A: 状態の見せ方', () => {
  test('待機 → 作業 → 一時停止 → 再開 → 休憩で data-phase と案内が変わる', async ({ page }) => {
    await gotoApp(page);
    expect(await phase(page)).toBe('idle');
    await expect(page.locator('#next-phase')).toHaveText('25分の作業から始めます');

    await page.locator('#start-btn').click();
    await expect.poll(() => phase(page)).toBe('work');
    await expect(page.locator('#next-phase')).toHaveText('次は 5分の休憩');
    await expect(page.locator('.cycle-dots i.on')).toHaveCount(1);

    await page.locator('#pause-btn').click();
    await expect.poll(() => phase(page)).toBe('pause');
    await expect(page.locator('#next-phase')).toContainText('再開');

    await page.locator('#restart-btn').click();
    await expect.poll(() => phase(page)).toBe('work');

    await page.locator('#skip-btn').click();
    await expect(page.locator('#status')).toHaveText('休憩中');
    await expect.poll(() => phase(page)).toBe('break');
    await expect(page.locator('#next-phase')).toHaveText('次は 25分の作業');

    await page.locator('#reset-btn').click();
    await expect.poll(() => phase(page)).toBe('idle');
    await expect(page.locator('.cycle-dots i.on')).toHaveCount(0);
    await expect(page.locator('#timer')).toHaveText('25:00');
  });

  test('作業中はタブ名に残り時間が出て、リセットで元のタイトルに戻る', async ({ page }) => {
    await gotoApp(page);
    const base = await page.title();
    await page.locator('#start-btn').click();
    await expect.poll(() => page.title()).toMatch(/^\d{2}:\d{2} 作業中 \| ポモドーロタイマー$/);
    await page.locator('#reset-btn').click();
    await expect.poll(() => page.title()).toBe(base);
  });

  test('リングは時間の経過で減っていく', async ({ page }) => {
    await page.clock.install();
    await gotoApp(page);
    expect(await ringOffset(page)).toBeCloseTo(0, 1);
    await page.locator('#start-btn').click();
    await page.clock.runFor(5 * 60 * 1000); // 25 分中 5 分経過 → 2 割減る
    await expect(page.locator('#timer')).toHaveText('20:00');
    const total = 2 * Math.PI * 46;
    expect(await ringOffset(page)).toBeCloseTo(total * 0.2, 0);
  });
});

test.describe('案A: Space キー', () => {
  test('Space で開始・一時停止・再開できる', async ({ page }) => {
    await gotoApp(page);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Space');
    await expect(page.locator('#status')).toHaveText('作業中');
    await page.keyboard.press('Space');
    await expect(page.locator('#status')).toHaveText('一時停止中');
    await page.keyboard.press('Space');
    await expect(page.locator('#status')).toHaveText('作業中');
  });

  test('入力欄にフォーカスがあるときの Space はタイマーを動かさない', async ({ page }) => {
    await gotoApp(page);
    await page.selectOption('#work-source', 'voicy');
    await page.locator('#voicy-url').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#status')).toHaveText('待機中');
  });
});
