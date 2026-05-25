// YouTube 再生リスト UI（動的行・検証・サムネ・削除）と拡張フックの検証。
import { test, expect, gotoApp } from './fixtures.js';

const VALID_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const VALID_ID = 'dQw4w9WgXcQ';

test.describe('YouTube 再生リスト UI', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('初期は空欄が 1 行だけ', async ({ page }) => {
    await expect(page.locator('#youtube-url-list .yt-url-row')).toHaveCount(1);
  });

  test('有効 URL を入れると末尾に空欄が自動追加 & サムネ表示', async ({ page }) => {
    const firstInput = page.locator('#youtube-url-list .yt-url-row input[type="url"]').first();
    await firstInput.fill(VALID_URL);
    await expect(page.locator('#youtube-url-list .yt-url-row')).toHaveCount(2);
    const thumb = page.locator('#youtube-url-list .yt-url-row').first().locator('.yt-thumb');
    await expect(thumb).toHaveAttribute('src', new RegExp(VALID_ID));
  });

  test('無効文字列で警告表示・サムネ非表示', async ({ page }) => {
    const firstInput = page.locator('#youtube-url-list .yt-url-row input[type="url"]').first();
    await firstInput.fill('not a youtube url');
    const row = page.locator('#youtube-url-list .yt-url-row').first();
    await expect(row.locator('.yt-url-warning')).toBeVisible();
    await expect(row.locator('.yt-thumb-cell')).toBeHidden();
  });

  test('× で行削除しても末尾の空欄は保たれる', async ({ page }) => {
    const firstInput = page.locator('#youtube-url-list .yt-url-row input[type="url"]').first();
    await firstInput.fill(VALID_URL);
    await expect(page.locator('#youtube-url-list .yt-url-row')).toHaveCount(2);
    await page.locator('#youtube-url-list .yt-url-row').first().locator('button[aria-label="削除"]').click();
    // 削除後も末尾空欄が 1 つ残る
    await expect(page.locator('#youtube-url-list .yt-url-row')).toHaveCount(1);
    await expect(page.locator('#youtube-url-list .yt-url-row input[type="url"]')).toHaveValue('');
  });
});

test.describe('extractVideoId: URL 形式の網羅', () => {
  test('代表的な YouTube URL 形式から ID を抽出できる', async ({ page }) => {
    await gotoApp(page);
    const results = await page.evaluate(async () => {
      const { YouTubeManager } = await import('/MusicManager.js');
      const m = new YouTubeManager(document.createElement('div'));
      const cases = {
        watch: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        short_host: 'https://youtu.be/dQw4w9WgXcQ',
        embed: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        shorts: 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
        raw_id: 'dQw4w9WgXcQ',
        invalid: 'https://example.com/foo',
      };
      const out = {};
      for (const [k, v] of Object.entries(cases)) out[k] = m.extractVideoId(v);
      return out;
    });
    expect(results.watch).toBe(VALID_ID);
    expect(results.short_host).toBe(VALID_ID);
    expect(results.embed).toBe(VALID_ID);
    expect(results.shorts).toBe(VALID_ID);
    expect(results.raw_id).toBe(VALID_ID);
    expect(results.invalid).toBeNull();
  });
});

test.describe('拡張フック window.PomodoroTimer.addYouTubeUrls', () => {
  test('重複 ID を除いて追加し、件数を返す', async ({ page }) => {
    await gotoApp(page);
    const res = await page.evaluate((id) => {
      const url = `https://www.youtube.com/watch?v=${id}`;
      const r1 = window.PomodoroTimer.addYouTubeUrls([url, url]); // 重複は1件
      const r2 = window.PomodoroTimer.addYouTubeUrls([url]);       // 既存重複は0件
      const rows = document.querySelectorAll('#youtube-url-list .yt-url-row').length;
      return { r1, r2, rows };
    }, VALID_ID);
    expect(res.r1.added).toBe(1);
    expect(res.r2.added).toBe(0);
  });
});

test.describe('拡張インストール案内モーダル', () => {
  test('未インストール & 未 dismiss なら load 時に表示される', async ({ page }) => {
    // このテストだけモーダルを抑止しない
    await gotoApp(page, { dismissExtModal: false });
    await expect(page.locator('#extInstallModal')).toBeVisible({ timeout: 5000 });
  });
});
