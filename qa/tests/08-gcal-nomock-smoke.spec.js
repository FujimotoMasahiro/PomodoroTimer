// (A) ノーモック実機スモーク。
// fixtures.gotoApp は使わず、google / fetch を一切スタブしない素のロードを行う。
// 外部ノイズ（gtag / Voicy / YouTube）はブロックしてよいが、Google 系 (GIS / googleapis)
// は「本番に近い実体」を確認するためスタブしない。ただしネットワークは到達しない可能性が
// あるため、GIS スクリプト取得失敗由来のネットワーク警告は除外し、アプリ JS 由来の例外
// (pageerror / console.error) だけで合否判定する。
import { test as base, expect } from '@playwright/test';

const test = base;

const CLIENT_ID_KEY = 'pomodoro_gcal_client_id';
const CONNECTED_KEY = 'pomodoro_gcal_connected';

// アプリ JS 由来でない（環境要因の）ノイズを除外するフィルタ。
// GIS スクリプトや googleapis への到達失敗、CDN ブロック等はアプリのバグではない。
function isAppLevelError(text) {
  const t = String(text || '');
  if (/gsi\/client|accounts\.google\.com|googleapis\.com|apis\.google\.com/i.test(t)) return false;
  if (/Failed to load resource|net::ERR|ERR_FAILED|ERR_BLOCKED|ERR_NAME_NOT_RESOLVED/i.test(t)) return false;
  if (/the server responded with a status of/i.test(t)) return false;
  if (/googletagmanager|google-analytics|voicy|youtube|ytimg/i.test(t)) return false;
  if (/Content Security Policy|favicon/i.test(t)) return false;
  return true;
}

// google / fetch をスタブしない素ロード。外部ノイズのみ遮断し、Google 系は実挙動に任せる。
// dismiss 拡張モーダルのため localStorage を流す。
async function rawGoto(page, { localStorage: ls = {}, blockGis = true } = {}) {
  const NOISE = ['googletagmanager.com', 'google-analytics.com', 'voicy.jp',
    'www.youtube.com/iframe_api', 'img.youtube.com', 'i.ytimg.com'];
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (NOISE.some((h) => url.includes(h))) return route.abort();
    // GIS スクリプトはネット未到達でハングしないよう abort（= 実体が無い状況を再現）。
    if (blockGis && url.includes('accounts.google.com/gsi/client')) return route.abort();
    return route.continue();
  });

  const seed = { pomodoro_yt_ext_dismissed: 'true', ...ls };
  await page.addInitScript((entries) => {
    try { for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v); } catch (_) {}
  }, seed);

  await page.goto('/index.html');
  await expect(page.locator('#timer')).toHaveText(/^\d{2}:\d{2}$/);
}

function attachErrorCollectors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push({ type: 'pageerror', text: err.message }));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push({ type: 'console', text: msg.text() }); });
  return errors;
}

test.describe('(A) ノーモック実機スモーク', () => {
  test('1. 素ロードでアプリ JS 由来の console error / pageerror が出ない', async ({ page }) => {
    const errors = attachErrorCollectors(page);
    await rawGoto(page);
    // GIS の async 読み込み・main() 初期化が落ち着くのを待つ
    await page.waitForTimeout(1500);
    const appErrors = errors.filter((e) => isAppLevelError(e.text));
    expect(appErrors, JSON.stringify(appErrors, null, 2)).toEqual([]);
  });

  test('2. 初期 DOM: connect disabled / refresh 非表示 / progress 非表示 / 案内文 / リスト空 / open-full 表示', async ({ page }) => {
    await rawGoto(page);
    const connect = page.locator('#gcal-connect-btn');
    await expect(connect).toBeVisible();
    await expect(connect).toBeDisabled();

    await expect(page.locator('#gcal-refresh-btn')).toBeHidden();
    await expect(page.locator('#gcal-progress')).toBeHidden();

    const status = page.locator('#gcal-status');
    await expect(status).toBeVisible();
    expect((await status.textContent()).trim().length).toBeGreaterThan(0);

    await expect(page.locator('#gcal-event-list > li')).toHaveCount(0);

    const openFull = page.locator('#gcal-open-full');
    await expect(openFull).toBeVisible();
    await expect(openFull).toHaveAttribute('href', 'https://calendar.google.com/calendar/u/0/r');
  });

  test('3. client-id 入力で connect 有効化 → リロードで復元', async ({ page }) => {
    await rawGoto(page);
    const input = page.locator('#gcal-client-id');
    const connect = page.locator('#gcal-connect-btn');
    await expect(connect).toBeDisabled();

    await input.fill('1234567890-abc.apps.googleusercontent.com');
    await expect(connect).toBeEnabled();

    // 永続化確認
    const stored = await page.evaluate((k) => localStorage.getItem(k), CLIENT_ID_KEY);
    expect(stored).toBe('1234567890-abc.apps.googleusercontent.com');

    // リロード（同じ route/seed 条件で）
    await page.reload();
    await expect(page.locator('#timer')).toHaveText(/^\d{2}:\d{2}$/);
    await expect(page.locator('#gcal-client-id')).toHaveValue('1234567890-abc.apps.googleusercontent.com');
    await expect(page.locator('#gcal-connect-btn')).toBeEnabled();
  });

  test('4. client-id + connected=1 で素ロード → whenGisReady が ~10s で諦めハングしない', async ({ page }) => {
    const errors = attachErrorCollectors(page);
    // GIS スクリプトを abort（= window.google が立たない状況）。
    await rawGoto(page, {
      blockGis: true,
      localStorage: {
        [CLIENT_ID_KEY]: '1234567890-abc.apps.googleusercontent.com',
        [CONNECTED_KEY]: '1',
      },
    });

    // autoConnect が走り status が「接続を復元しています…」になる
    await expect(page.locator('#gcal-status')).toContainText('接続を復元しています');

    // whenGisReady のポーリング上限は 40 回 * 250ms = ~10s。
    // この間ページが応答し続ける（ハングしない）ことを確認する。
    const t0 = Date.now();
    // 11 秒待っても evaluate が即応答する＝メインスレッドが固まっていない
    await page.waitForTimeout(11000);
    const responsive = await page.evaluate(() => 1 + 1);
    expect(responsive).toBe(2);
    expect(Date.now() - t0).toBeGreaterThan(10000);

    // 諦めた後でもページは生きている（タイマー操作が可能）
    await page.locator('#start-btn').click();
    await expect(page.locator('#cycles')).toHaveText('1');

    // この一連でアプリ由来の例外が出ていないこと
    const appErrors = errors.filter((e) => isAppLevelError(e.text));
    expect(appErrors, JSON.stringify(appErrors, null, 2)).toEqual([]);
  });

  test('5. 素ロード時、setInterval リークや未処理例外で固まらない（最終応答性）', async ({ page }) => {
    await rawGoto(page, {
      localStorage: {
        [CLIENT_ID_KEY]: '1234567890-abc.apps.googleusercontent.com',
        [CONNECTED_KEY]: '1',
      },
    });
    // 連続操作してもブロックされない
    await page.locator('#start-btn').click();
    await page.locator('#skip-btn').click();
    await page.locator('#reset-btn').click();
    await expect(page.locator('#cycles')).toHaveText('0');
  });
});
