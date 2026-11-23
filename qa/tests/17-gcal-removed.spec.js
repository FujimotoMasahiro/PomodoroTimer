// Google カレンダー連携の廃止 (issue #21)。
// 画面に連携 UI が無く、Google の OAuth ライブラリを読み込まず、
// 過去に連携していた人の端末に残る pomodoro_gcal_* キーが起動時に消えること。
import { test, expect, gotoApp } from './fixtures.js';

const LEGACY = {
  pomodoro_gcal_client_id: 'xxxxxxxx.apps.googleusercontent.com',
  pomodoro_gcal_connected: '1',
  pomodoro_gcal_orig_colors: '{"e1":"5"}',
  pomodoro_gcal_local_done: '["e2"]',
  pomodoro_gcal_account: 'someone@example.com',
  pomodoro_gcal_token: '{"token":"abc","expiresAt":9999999999999}',
};

test.describe('Google カレンダー連携の廃止', () => {
  test('連携の UI が画面に無い', async ({ page }) => {
    await gotoApp(page);
    for (const id of ['panel-today', 'gcal-connect-btn', 'gcal-client-id', 'gcal-event-list', 'gcal-progress-label']) {
      await expect(page.locator(`#${id}`)).toHaveCount(0);
    }
    await expect(page.locator('body')).not.toContainText('今日の予定');
    await expect(page.locator('body')).not.toContainText('カレンダー');
  });

  test('Google の OAuth ライブラリを読み込まない', async ({ page }) => {
    const requested = [];
    page.on('request', (r) => { if (/accounts\.google\.com|googleapis\.com/.test(r.url())) requested.push(r.url()); });
    await gotoApp(page);
    await page.waitForLoadState('load');
    expect(requested).toEqual([]);
    await expect(page.locator('script[src*="accounts.google.com"]')).toHaveCount(0);
  });

  test('旧バージョンで保存された pomodoro_gcal_* は起動時に消える', async ({ page }) => {
    // addInitScript はリロードのたびに再 seed するので、1 回目の読み込みだけ流し込む
    await page.addInitScript((entries) => {
      if (sessionStorage.getItem('__seeded')) return;
      sessionStorage.setItem('__seeded', '1');
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    }, LEGACY);
    await gotoApp(page);
    const left = await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.startsWith('pomodoro_gcal_')));
    expect(left).toEqual([]);
  });
});
