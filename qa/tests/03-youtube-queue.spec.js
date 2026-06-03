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

const AUDIO_KEY = 'pomodoro_audio_source_settings';
const VALID_URL_2 = 'https://www.youtube.com/watch?v=abcdefghijk';
const VALID_ID_2 = 'abcdefghijk';

async function readAudioSettings(page) {
  return page.evaluate((k) => {
    try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; }
  }, AUDIO_KEY);
}

test.describe('勉強/作業モードのフラグとチェックボックス', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('各行に勉強用チェックボックスが表示される', async ({ page }) => {
    const firstInput = page.locator('#youtube-url-list .yt-url-row input[type="url"]').first();
    await firstInput.fill(VALID_URL);
    await expect(page.locator('#youtube-url-list .yt-url-row')).toHaveCount(2);
    await expect(page.locator('#youtube-url-list .yt-url-row').first().locator('.yt-study-check')).toBeVisible();
  });

  test('チェックすると localStorage に {url, study:true} 形式で保存される', async ({ page }) => {
    const firstRow = page.locator('#youtube-url-list .yt-url-row').first();
    await firstRow.locator('input[type="url"]').fill(VALID_URL);
    await firstRow.locator('.yt-study-check').check();
    const s = await readAudioSettings(page);
    expect(Array.isArray(s.youtubeUrls)).toBe(true);
    expect(s.youtubeUrls[0]).toEqual({ url: VALID_URL, study: true });
  });

  test('勉強フラグはリロード後も復元される', async ({ page }) => {
    const firstRow = page.locator('#youtube-url-list .yt-url-row').first();
    await firstRow.locator('input[type="url"]').fill(VALID_URL);
    await firstRow.locator('.yt-study-check').check();
    await page.reload();
    await expect(page.locator('#timer')).toHaveText(/^\d{2}:\d{2}$/);
    const restored = page.locator('#youtube-url-list .yt-url-row').first().locator('.yt-study-check');
    await expect(restored).toBeChecked();
  });

  test('モード切替は localStorage に保存され、リロードで復元される', async ({ page }) => {
    // 既定は作業モード
    expect(await page.locator('#yt-mode-work').isChecked()).toBe(true);
    await page.locator('label[for="yt-mode-study"]').click();
    const s = await readAudioSettings(page);
    expect(s.youtubeMode).toBe('study');
    await page.reload();
    await expect(page.locator('#timer')).toHaveText(/^\d{2}:\d{2}$/);
    await expect(page.locator('#yt-mode-study')).toBeChecked();
  });

  test('旧形式 (文字列配列) の youtubeUrls も読み込める', async ({ page }) => {
    await gotoApp(page, {
      localStorage: {
        [AUDIO_KEY]: JSON.stringify({ workSource: 'youtube', youtubeUrls: [VALID_URL, VALID_URL_2] }),
      },
    });
    // 2 URL + 末尾空欄 = 3 行
    await expect(page.locator('#youtube-url-list .yt-url-row')).toHaveCount(3);
    const inputs = page.locator('#youtube-url-list .yt-url-row input[type="url"]');
    await expect(inputs.nth(0)).toHaveValue(VALID_URL);
    await expect(inputs.nth(1)).toHaveValue(VALID_URL_2);
    // 旧形式はすべて未チェック (study:false) 扱い
    await expect(page.locator('#youtube-url-list .yt-study-check').nth(0)).not.toBeChecked();
  });
});

test.describe('モードによる一覧フィルタリング', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('作業モードはチェック済み(勉強)動画を一覧から隠し、勉強モードで表示する', async ({ page }) => {
    const rows = page.locator('#youtube-url-list .yt-url-row');
    await rows.nth(0).locator('input[type="url"]').fill(VALID_URL);     // A: 未チェック
    await rows.nth(1).locator('input[type="url"]').fill(VALID_URL_2);   // B: 勉強用にする
    await rows.nth(1).locator('.yt-study-check').check();

    // 作業モード(既定): A 表示 / B(勉強) 非表示 / 末尾空行は表示
    await expect(rows.nth(0)).toBeVisible();
    await expect(rows.nth(1)).toBeHidden();
    await expect(rows.nth(2)).toBeVisible();

    // 勉強モードへ: B のみ表示 / A 非表示 / 末尾空行は表示
    await page.locator('label[for="yt-mode-study"]').click();
    await expect(rows.nth(1)).toBeVisible();
    await expect(rows.nth(0)).toBeHidden();
    await expect(rows.nth(2)).toBeVisible();
  });

  test('勉強モードで追加した動画はチェック済みで一覧に残る', async ({ page }) => {
    await page.locator('label[for="yt-mode-study"]').click();
    const rows = page.locator('#youtube-url-list .yt-url-row');
    await rows.nth(0).locator('input[type="url"]').fill(VALID_URL);
    // 勉強モードで足した動画は study=true 既定 → 表示されたまま
    await expect(rows.nth(0)).toBeVisible();
    await expect(rows.nth(0).locator('.yt-study-check')).toBeChecked();
    const s = await readAudioSettings(page);
    expect(s.youtubeUrls[0]).toEqual({ url: VALID_URL, study: true });
  });
});

test.describe('拡張インストール案内モーダル', () => {
  test('未インストール & 未 dismiss なら load 時に表示される', async ({ page }) => {
    // このテストだけモーダルを抑止しない
    await gotoApp(page, { dismissExtModal: false });
    await expect(page.locator('#extInstallModal')).toBeVisible({ timeout: 5000 });
  });
});
