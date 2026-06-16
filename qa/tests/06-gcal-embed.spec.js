// Google カレンダー埋め込み機能の検証（A+C 併用 仕様）。
// 実 calendar.google.com は読み込めない/ブロック対象なので、iframe の
// 「存在」と「src 属性値」のみで検証し、実コンテンツ表示は判定対象外。
//
// 今回の仕様変更:
//  - 予定エリアは本文最下部・横幅いっぱい（col-12）の単独カード。
//  - カード見出し右に「通常のカレンダーを開く ↗」ボタン (#gcal-open-full) を常時表示。
//  - 埋め込みは週表示を既定化。extractCalendarSrc は mode 無しの URL に mode=WEEK を付与。
//    mode 明示済み URL は尊重して上書きしない。
import { test, expect, gotoApp } from './fixtures.js';

// mode を含まない有効 URL（→ mode=WEEK が付与される想定）
const EMBED_URL =
  'https://calendar.google.com/calendar/embed?src=ja.japanese%23holiday%40group.v.calendar.google.com&ctz=Asia%2FTokyo';

// mode=MONTH を明示した URL（→ 上書きされず MONTH のまま）
const EMBED_URL_MONTH =
  'https://calendar.google.com/calendar/embed?src=foo%40gmail.com&ctz=Asia%2FTokyo&mode=MONTH';

const GCAL_KEY = 'pomodoro_gcal_embed_url';

// iframe の src を URL として解釈し、mode パラメータを取り出す小ヘルパ
async function iframeModeParam(page) {
  const src = await page.locator('#gcal-container iframe').getAttribute('src');
  return new URL(src).searchParams.get('mode');
}

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

  // [BUG-101] 修正済み (2026-06-16): loadCalendarSettings() が起動時に updateCalendar('') を
  // 呼ぶため JS フォールバック文言が実表示になる。その文言を HTML の新プレースホルダ文言
  // （「週表示」「通常のカレンダーを開く」を含む）と揃えたため、本テストは通常通過に戻す。
  test('初期プレースホルダ文言が新仕様（週表示 / 通常のカレンダーを開く）に追従', async ({ page }) => {
    const ph = page.locator('#gcal-placeholder');
    await expect(ph).toBeVisible();
    // 厳密一致ではなくキーワード contains で頑健に
    await expect(ph).toContainText('週表示');
    await expect(ph).toContainText('通常のカレンダーを開く');
  });

  test('有効な埋め込み URL (mode 無し) を貼ると iframe 生成・mode=WEEK が付与される', async ({ page }) => {
    await page.locator('#gcal-url').fill(EMBED_URL);
    const iframe = page.locator('#gcal-container iframe');
    await expect(iframe).toHaveCount(1);
    // mode=WEEK が付与される
    expect(await iframeModeParam(page)).toBe('WEEK');
    // 元の src / ctz は保持される
    const src = await iframe.getAttribute('src');
    const params = new URL(src).searchParams;
    expect(params.get('src')).toBe('ja.japanese#holiday@group.v.calendar.google.com');
    expect(params.get('ctz')).toBe('Asia/Tokyo');
    await expect(page.locator('#gcal-url-warning')).toBeHidden();
    await expect(page.locator('#gcal-placeholder')).toHaveCount(0);
  });

  test('mode=MONTH を明示した URL は WEEK で上書きされず MONTH のまま', async ({ page }) => {
    await page.locator('#gcal-url').fill(EMBED_URL_MONTH);
    const iframe = page.locator('#gcal-container iframe');
    await expect(iframe).toHaveCount(1);
    expect(await iframeModeParam(page)).toBe('MONTH');
    await expect(page.locator('#gcal-url-warning')).toBeHidden();
  });

  test('iframe 全体を貼っても src を抽出して iframe 化（&amp; は & に戻る・mode=WEEK 付与）', async ({ page }) => {
    const snippet =
      '<iframe src="https://calendar.google.com/calendar/embed?src=foo%40gmail.com&amp;ctz=Asia%2FTokyo" ' +
      'style="border: 0" width="800" height="600" frameborder="0" scrolling="no"></iframe>';
    await page.locator('#gcal-url').fill(snippet);
    const iframe = page.locator('#gcal-container iframe');
    await expect(iframe).toHaveCount(1);
    const src = await iframe.getAttribute('src');
    // &amp; が残っていないこと
    expect(src).not.toContain('&amp;');
    // src 抽出が成立し、mode=WEEK が付与される
    const params = new URL(src).searchParams;
    expect(params.get('src')).toBe('foo@gmail.com');
    expect(params.get('ctz')).toBe('Asia/Tokyo');
    expect(params.get('mode')).toBe('WEEK');
    await expect(page.locator('#gcal-url-warning')).toBeHidden();
  });
});

test.describe('Googleカレンダー: 「通常のカレンダーを開く」ボタン (#gcal-open-full)', () => {
  test('埋め込み URL 未設定でも常に表示され、href / target / rel が仕様どおり', async ({ page }) => {
    await gotoApp(page); // localStorage 空 = 埋め込み未設定
    const btn = page.locator('#gcal-open-full');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('href', 'https://calendar.google.com/calendar/u/0/r');
    await expect(btn).toHaveAttribute('target', '_blank');
    const rel = await btn.getAttribute('rel');
    expect(rel || '').toContain('noopener');
  });

  test('埋め込み URL 設定後もボタンは表示され続ける', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#gcal-url').fill(EMBED_URL);
    await expect(page.locator('#gcal-container iframe')).toHaveCount(1);
    await expect(page.locator('#gcal-open-full')).toBeVisible();
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
  test('有効 URL を入れてリロードすると input と iframe (mode=WEEK) が復元される', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#gcal-url').fill(EMBED_URL);
    await expect
      .poll(async () => page.evaluate((k) => localStorage.getItem(k), GCAL_KEY))
      .toBe(EMBED_URL);

    await page.reload();
    await expect(page.locator('#timer')).toHaveText(/^\d{2}:\d{2}$/);
    // input は生の保存値（mode 無し）で復元される
    await expect(page.locator('#gcal-url')).toHaveValue(EMBED_URL);
    const iframe = page.locator('#gcal-container iframe');
    await expect(iframe).toHaveCount(1);
    // 生成された iframe には mode=WEEK が付与されている
    expect(await iframeModeParam(page)).toBe('WEEK');
  });

  test('保存済み不正値はリロード後 input に復元されるが iframe は作られず警告表示', async ({ page }) => {
    await gotoApp(page, { localStorage: { [GCAL_KEY]: 'http://calendar.google.com/calendar/embed?src=x' } });
    await expect(page.locator('#gcal-url')).toHaveValue('http://calendar.google.com/calendar/embed?src=x');
    await expect(page.locator('#gcal-container iframe')).toHaveCount(0);
    await expect(page.locator('#gcal-url-warning')).toBeVisible();
  });
});

test.describe('今日のタスク機能: DOM から完全に撤去されていること', () => {
  test('task 系の要素がいずれも存在しない', async ({ page }) => {
    await gotoApp(page);
    for (const id of [
      'task-add-form',
      'task-input',
      'task-list',
      'task-empty',
      'task-progress-label',
      'task-progress-bar',
    ]) {
      await expect(page.locator(`#${id}`)).toHaveCount(0);
    }
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
