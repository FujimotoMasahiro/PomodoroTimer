// Google カレンダー埋め込み機能の検証。
// 実 calendar.google.com は読み込めない/ブロック対象なので、iframe の
// 「存在」と「src 属性値」のみで検証し、実コンテンツ表示は判定対象外。
import { test, expect, gotoApp } from './fixtures.js';

const EMBED_URL =
  'https://calendar.google.com/calendar/embed?src=ja.japanese%23holiday%40group.v.calendar.google.com&ctz=Asia%2FTokyo';

const GCAL_KEY = 'pomodoro_gcal_embed_url';

test.describe('Googleカレンダー埋め込み: 基本表示', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('初期はプレースホルダのみ・iframe なし・警告非表示', async ({ page }) => {
    await expect(page.locator('#gcal-placeholder')).toBeVisible();
    await expect(page.locator('#gcal-container iframe')).toHaveCount(0);
    await expect(page.locator('#gcal-url-warning')).toBeHidden();
    await expect(page.locator('#gcal-url')).toHaveValue('');
  });

  test('有効な埋め込み URL を貼ると iframe が生成され src が一致', async ({ page }) => {
    await page.locator('#gcal-url').fill(EMBED_URL);
    const iframe = page.locator('#gcal-container iframe');
    await expect(iframe).toHaveCount(1);
    await expect(iframe).toHaveAttribute('src', EMBED_URL);
    await expect(page.locator('#gcal-url-warning')).toBeHidden();
    await expect(page.locator('#gcal-placeholder')).toHaveCount(0);
  });

  test('iframe 全体を貼っても src を抽出して iframe 化（&amp; は & に戻る）', async ({ page }) => {
    const snippet =
      '<iframe src="https://calendar.google.com/calendar/embed?src=foo%40gmail.com&amp;ctz=Asia%2FTokyo" ' +
      'style="border: 0" width="800" height="600" frameborder="0" scrolling="no"></iframe>';
    await page.locator('#gcal-url').fill(snippet);
    const iframe = page.locator('#gcal-container iframe');
    await expect(iframe).toHaveCount(1);
    const src = await iframe.getAttribute('src');
    expect(src).toBe(
      'https://calendar.google.com/calendar/embed?src=foo%40gmail.com&ctz=Asia%2FTokyo'
    );
    // &amp; が残っていないこと
    expect(src).not.toContain('&amp;');
    await expect(page.locator('#gcal-url-warning')).toBeHidden();
  });
});

test.describe('Googleカレンダー埋め込み: 不正入力の拒否', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  const rejected = {
    '別ドメイン': 'https://evil.example.com/calendar/embed?src=x',
    'http (非https)': 'http://calendar.google.com/calendar/embed?src=x',
    'パスが embed でない': 'https://calendar.google.com/calendar/render?src=x',
    'ただの文字列': 'not a url at all',
  };

  for (const [name, url] of Object.entries(rejected)) {
    test(`拒否: ${name}`, async ({ page }) => {
      await page.locator('#gcal-url').fill(url);
      // iframe は作られない
      await expect(page.locator('#gcal-container iframe')).toHaveCount(0);
      // 警告が出る
      await expect(page.locator('#gcal-url-warning')).toBeVisible();
      // 本文はプレースホルダ（解析失敗メッセージ）
      await expect(page.locator('#gcal-placeholder')).toBeVisible();
      await expect(page.locator('#gcal-placeholder')).toContainText('解析できませんでした');
    });
  }

  test('空文字に戻すと iframe が消えて初期プレースホルダ・警告非表示', async ({ page }) => {
    await page.locator('#gcal-url').fill(EMBED_URL);
    await expect(page.locator('#gcal-container iframe')).toHaveCount(1);

    await page.locator('#gcal-url').fill('');
    await expect(page.locator('#gcal-container iframe')).toHaveCount(0);
    await expect(page.locator('#gcal-url-warning')).toBeHidden();
    await expect(page.locator('#gcal-placeholder')).toBeVisible();
    await expect(page.locator('#gcal-placeholder')).not.toContainText('解析できませんでした');
  });
});

test.describe('Googleカレンダー埋め込み: 永続化', () => {
  test('有効 URL を入れてリロードすると input と iframe が復元される', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#gcal-url').fill(EMBED_URL);
    await expect
      .poll(async () => page.evaluate((k) => localStorage.getItem(k), GCAL_KEY))
      .toBe(EMBED_URL);

    await page.reload();
    await expect(page.locator('#timer')).toHaveText(/^\d{2}:\d{2}$/);
    await expect(page.locator('#gcal-url')).toHaveValue(EMBED_URL);
    const iframe = page.locator('#gcal-container iframe');
    await expect(iframe).toHaveCount(1);
    await expect(iframe).toHaveAttribute('src', EMBED_URL);
  });

  test('保存済み不正値はリロード後 input に復元されるが iframe は作られず警告表示', async ({ page }) => {
    await gotoApp(page, { localStorage: { [GCAL_KEY]: 'http://calendar.google.com/calendar/embed?src=x' } });
    await expect(page.locator('#gcal-url')).toHaveValue('http://calendar.google.com/calendar/embed?src=x');
    await expect(page.locator('#gcal-container iframe')).toHaveCount(0);
    await expect(page.locator('#gcal-url-warning')).toBeVisible();
  });
});

test.describe('Googleカレンダー埋め込み: console / pageerror 監視', () => {
  test('入力・拒否・クリアの一連でエラーが出ない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await gotoApp(page);
    await page.locator('#gcal-url').fill(EMBED_URL);
    await page.locator('#gcal-url').fill('garbage');
    await page.locator('#gcal-url').fill('');
    // 既知の外部ブロック由来ノイズ（YouTube API 等）は除外
    const real = errors.filter(
      (e) => !/iframe_api|ytimg|voicy|gtag|net::ERR_FAILED|Failed to load resource/i.test(e)
    );
    expect(real).toEqual([]);
  });
});
