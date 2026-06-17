// Googleカレンダー認証保持（無言の自動再接続）の検証。
//
// 変更仕様（今回）:
//  - 接続成功時に localStorage['pomodoro_gcal_connected']='1' を保存（access_token は保存しない）。
//  - 起動時、client_id があり かつ connected==='1' なら GIS 準備完了後に
//    requestAccessToken({prompt:''}) を自動実行（ボタン押下不要）。#gcal-status は「接続を復元しています…」。
//  - 手動「Google と接続」ボタン: 過去接続済みなら prompt:''、未接続なら prompt:'consent'。
//  - error_callback で onGcalAuthFailure(): connected フラグ削除・接続ボタン再表示・status にエラー文。
//
// 決定論化:
//  - window.google.accounts.oauth2.initTokenClient を addInitScript で「ページ読み込み前に」スタブ。
//    requestAccessToken の prompt と呼び出し有無を window.__tokenCalls に記録し、
//    callback / error_callback を window.__gisCtl に保持してテストから発火する。
//  - window.fetch をスタブして GET(events) を返す。
import { test, expect, gotoApp } from './fixtures.js';

const CLIENT_ID_KEY = 'pomodoro_gcal_client_id';
const CONNECTED_KEY = 'pomodoro_gcal_connected';
const CLIENT_ID = 'persist.apps.googleusercontent.com';

/**
 * GIS + fetch をページ読み込み前にスタブする。autoConnect の起動時挙動を観測するため
 * addInitScript で仕込む（gotoApp の goto より前に積まれる）。
 * window.__tokenCalls = [{prompt}] / window.__gisCtl = {fire(token), error(), capturedScope}
 */
async function installInitStubs(page, opts = {}) {
  await page.addInitScript((o) => {
    window.__tokenCalls = [];
    window.__initClientCount = 0;
    const seedItems = o.seedItems || [];

    const ctl = {};
    window.__gisCtl = ctl;

    window.google = {
      accounts: {
        oauth2: {
          initTokenClient(cfg) {
            window.__initClientCount++;
            ctl.capturedScope = cfg.scope;
            ctl.fire = (token) => cfg.callback({ access_token: token });
            ctl.fireEmpty = () => cfg.callback({});
            ctl.error = () => { if (cfg.error_callback) cfg.error_callback({ type: 'popup_closed' }); };
            return {
              requestAccessToken(args) {
                window.__tokenCalls.push({ prompt: (args && args.prompt) });
              },
            };
          },
        },
      },
    };

    const realFetch = window.fetch;
    window.fetch = (url, init) => {
      const u = typeof url === 'string' ? url : (url && url.url) || '';
      const method = (init && init.method) || 'GET';
      if (u.includes('googleapis.com/calendar') && method === 'GET') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ items: seedItems }) });
      }
      if (u.includes('googleapis.com/calendar') && method === 'PATCH') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      }
      return realFetch(url, init);
    };
  }, opts);
}

const tokenCalls = (page) => page.evaluate(() => window.__tokenCalls || []);

// ---------------------------------------------------------------------------
test.describe('GCal 認証保持: 起動時の自動接続', () => {
  test('未接続（connected フラグ無し）では起動時 requestAccessToken は呼ばれない', async ({ page }) => {
    await installInitStubs(page);
    await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: CLIENT_ID } });

    // autoConnect は connected フラグが無ければ即 return → 呼び出し 0
    await page.waitForTimeout(400);
    expect(await tokenCalls(page)).toEqual([]);
    await expect(page.locator('#gcal-connect-btn')).toBeVisible();
    await expect(page.locator('#gcal-connect-btn')).toBeEnabled();
    await expect(page.locator('#gcal-refresh-btn')).toBeHidden();
  });

  test('client_id 無し・connected フラグありでも起動時 requestAccessToken は呼ばれない', async ({ page }) => {
    await installInitStubs(page);
    await gotoApp(page, { localStorage: { [CONNECTED_KEY]: '1' } });

    await page.waitForTimeout(400);
    expect(await tokenCalls(page)).toEqual([]);
    // client_id 無し → 接続ボタンは disabled
    await expect(page.locator('#gcal-connect-btn')).toBeDisabled();
  });

  test('client_id + connected=1 で起動 → prompt:"" の無言取得が自動で1回呼ばれる', async ({ page }) => {
    await installInitStubs(page);
    await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: CLIENT_ID, [CONNECTED_KEY]: '1' } });

    await expect.poll(() => tokenCalls(page)).toHaveLength(1);
    const calls = await tokenCalls(page);
    expect(calls[0].prompt).toBe('');
  });

  test('起動時の自動接続中は #gcal-status が「接続を復元しています…」', async ({ page }) => {
    await installInitStubs(page);
    await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: CLIENT_ID, [CONNECTED_KEY]: '1' } });

    const status = page.locator('#gcal-status');
    await expect(status).toBeVisible();
    await expect(status).toContainText('接続を復元しています');
  });

  test('自動接続成功 callback → 予定取得・描画され「更新」ボタンへ', async ({ page }) => {
    await installInitStubs(page, {
      seedItems: [
        { id: 'r1', summary: '復元された予定', start: { dateTime: '2026-06-18T09:00:00+09:00' } },
      ],
    });
    await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: CLIENT_ID, [CONNECTED_KEY]: '1' } });

    await expect.poll(() => tokenCalls(page)).toHaveLength(1);
    // スタブ callback を発火（偽トークン）
    await page.evaluate(() => window.__gisCtl.fire('RESTORED_TOKEN'));

    const items = page.locator('#gcal-event-list > li');
    await expect(items).toHaveCount(1);
    await expect(items.nth(0)).toContainText('復元された予定');
    await expect(page.locator('#gcal-connect-btn')).toBeHidden();
    await expect(page.locator('#gcal-refresh-btn')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
test.describe('GCal 認証保持: 手動接続ボタンの prompt 値', () => {
  test('未接続でボタン押下 → prompt:"consent"', async ({ page }) => {
    await installInitStubs(page);
    await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: CLIENT_ID } });

    await page.locator('#gcal-connect-btn').click();
    await expect.poll(() => tokenCalls(page)).toHaveLength(1);
    expect((await tokenCalls(page))[0].prompt).toBe('consent');
  });

  test('connected=1 でボタン押下 → prompt:""（無言）', async ({ page }) => {
    await installInitStubs(page);
    // 起動時の autoConnect が prompt:'' を1回呼ぶので、それを消費してからボタンを押す
    await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: CLIENT_ID, [CONNECTED_KEY]: '1' } });
    await expect.poll(() => tokenCalls(page)).toHaveLength(1);
    await page.evaluate(() => { window.__tokenCalls = []; });

    await page.locator('#gcal-connect-btn').click();
    await expect.poll(() => tokenCalls(page)).toHaveLength(1);
    expect((await tokenCalls(page))[0].prompt).toBe('');
  });
});

// ---------------------------------------------------------------------------
test.describe('GCal 認証保持: 成功でフラグ保存 / access_token 非永続', () => {
  test('未接続→consent→成功 callback で connected フラグが "1" に保存される', async ({ page }) => {
    await installInitStubs(page, { seedItems: [] });
    await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: CLIENT_ID } });

    await page.locator('#gcal-connect-btn').click();
    await expect.poll(() => tokenCalls(page)).toHaveLength(1);
    await page.evaluate(() => window.__gisCtl.fire('NEW_TOKEN'));

    await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), CONNECTED_KEY)).toBe('1');
  });

  test('access_token は localStorage / sessionStorage に保存されない（フラグのみ）', async ({ page }) => {
    await installInitStubs(page, { seedItems: [] });
    await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: CLIENT_ID } });

    await page.locator('#gcal-connect-btn').click();
    await expect.poll(() => tokenCalls(page)).toHaveLength(1);
    await page.evaluate(() => window.__gisCtl.fire('SECRET_TOKEN_VALUE'));
    await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), CONNECTED_KEY)).toBe('1');

    const leak = await page.evaluate(() => {
      const dump = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        dump.push(k + '=' + localStorage.getItem(k));
      }
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        dump.push(k + '=' + sessionStorage.getItem(k));
      }
      return dump.join('\n');
    });
    expect(leak).not.toContain('SECRET_TOKEN_VALUE');
    expect(leak.toLowerCase()).not.toContain('access_token');
  });
});

// ---------------------------------------------------------------------------
test.describe('GCal 認証保持: error_callback でフラグ解除＆復帰', () => {
  test('起動時の無言取得で error_callback 発火 → connected 削除・接続ボタン再表示・status エラー文', async ({ page }) => {
    await installInitStubs(page);
    await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: CLIENT_ID, [CONNECTED_KEY]: '1' } });

    await expect.poll(() => tokenCalls(page)).toHaveLength(1);
    expect((await tokenCalls(page))[0].prompt).toBe('');

    // 無言取得失敗を error_callback で再現
    await page.evaluate(() => window.__gisCtl.error());

    // connected フラグが消える
    await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), CONNECTED_KEY)).toBeNull();
    // 接続ボタン再表示・更新非表示
    await expect(page.locator('#gcal-connect-btn')).toBeVisible();
    await expect(page.locator('#gcal-refresh-btn')).toBeHidden();
    // status にエラー / 案内文
    const status = page.locator('#gcal-status');
    await expect(status).toBeVisible();
    await expect(status).toContainText(/接続|Google と接続/);
  });

  test('error 後は接続ボタンが prompt:"consent"（フラグ解除済みのため）', async ({ page }) => {
    await installInitStubs(page);
    await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: CLIENT_ID, [CONNECTED_KEY]: '1' } });

    await expect.poll(() => tokenCalls(page)).toHaveLength(1);
    await page.evaluate(() => window.__gisCtl.error());
    await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), CONNECTED_KEY)).toBeNull();

    await page.evaluate(() => { window.__tokenCalls = []; });
    await page.locator('#gcal-connect-btn').click();
    await expect.poll(() => tokenCalls(page)).toHaveLength(1);
    // フラグ解除済み → 同意画面 (consent) へ
    expect((await tokenCalls(page))[0].prompt).toBe('consent');
  });

  test('空レスポンス callback（access_token 無し）でも onGcalAuthFailure 経路で復帰する', async ({ page }) => {
    await installInitStubs(page);
    await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: CLIENT_ID, [CONNECTED_KEY]: '1' } });

    await expect.poll(() => tokenCalls(page)).toHaveLength(1);
    await page.evaluate(() => window.__gisCtl.fireEmpty());

    await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), CONNECTED_KEY)).toBeNull();
    await expect(page.locator('#gcal-connect-btn')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
test.describe('GCal 認証保持: console / pageerror 監視', () => {
  test('自動接続→成功→更新の一連で console error / pageerror が出ない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await installInitStubs(page, {
      seedItems: [{ id: 's1', summary: '予定A', start: { dateTime: '2026-06-18T09:00:00+09:00' } }],
    });
    await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: CLIENT_ID, [CONNECTED_KEY]: '1' } });
    await expect.poll(() => tokenCalls(page)).toHaveLength(1);
    await page.evaluate(() => window.__gisCtl.fire('TOK'));
    await expect(page.locator('#gcal-refresh-btn')).toBeVisible();
    await page.locator('#gcal-refresh-btn').click();

    const real = errors.filter(
      (e) => !/iframe_api|ytimg|voicy|gtag|gsi\/client|accounts\.google|googleapis|net::ERR_FAILED|Failed to load resource/i.test(e)
    );
    expect(real).toEqual([]);
  });
});
