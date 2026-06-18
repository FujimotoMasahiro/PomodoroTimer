// 再検証: 前回レビューで挙げた 3 件の修正確認。
//   BUG-104: グレー化前の元色を localStorage 'pomodoro_gcal_orig_colors' へ永続化し、
//            リロードをまたいでもチェック解除で元色へ復元する。
//   BUG-101: 起動時の無言自動接続(auto)が失敗したら穏やかな案内文。手動(manual)失敗は別文言。
//   BUG-105: gcalAuthInFlight により再認証要求の多重発火を防ぐ（in-flight 中は requestAccessToken を呼ばない）。
//
// 決定論化方針は既存 06/07 spec を踏襲（GIS + fetch をスタブ）。
import { test, expect, gotoApp } from './fixtures.js';

const CLIENT_ID_KEY = 'pomodoro_gcal_client_id';
const CONNECTED_KEY = 'pomodoro_gcal_connected';
const ORIG_COLOR_KEY = 'pomodoro_gcal_orig_colors';
const CLIENT_ID = 'fix.apps.googleusercontent.com';

const liByIndex = (page, i) => page.locator('#gcal-event-list > li').nth(i);
const cbByIndex = (page, i) => liByIndex(page, i).locator('input[type="checkbox"]');

const patchLog = (page) => page.evaluate(() => window.__fetchLog || []);
const tokenCalls = (page) => page.evaluate(() => window.__tokenCalls || []);
const readOrig = (page) =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), ORIG_COLOR_KEY);

/**
 * GIS(initTokenClient) + fetch をスタブして手動 connect でトークンを確立する。
 * 06 spec の connectWithStub 同等。__fetchLog に PATCH を記録する。
 */
async function connectWithStub(page, opts = {}) {
  await gotoApp(page, {
    localStorage: { [CLIENT_ID_KEY]: CLIENT_ID, ...(opts.localStorage || {}) },
  });

  await page.evaluate((o) => {
    window.__fetchLog = [];
    const patchOk = o.patchOk !== false;
    const seedItems = o.seedItems || [];

    window.google = {
      accounts: {
        oauth2: {
          initTokenClient(cfg) {
            return {
              requestAccessToken() { cfg.callback({ access_token: 'FAKE_TOKEN' }); },
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
        const m = u.match(/events\/([^?]+)/);
        window.__fetchLog.push({
          method, url: u,
          id: m ? decodeURIComponent(m[1]) : null,
          body: init && init.body ? JSON.parse(init.body) : null,
        });
        if (!patchOk) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      }
      return realFetch(url, init);
    };
  }, opts);

  await page.locator('#gcal-connect-btn').click();
  await expect(page.locator('#gcal-refresh-btn')).toBeVisible();
}

/**
 * GIS + fetch を「読み込み前に」addInitScript で仕込む。callback/error をテストから発火可能。
 * window.__tokenCalls=[{prompt}] / window.__gisCtl={fire(token),fireEmpty(),error()}
 */
async function installInitStubs(page, opts = {}) {
  await page.addInitScript((o) => {
    window.__tokenCalls = [];
    const seedItems = o.seedItems || [];
    const ctl = {};
    window.__gisCtl = ctl;
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient(cfg) {
            ctl.fire = (token) => cfg.callback({ access_token: token });
            ctl.fireEmpty = () => cfg.callback({});
            ctl.error = () => { if (cfg.error_callback) cfg.error_callback({ type: 'popup_closed' }); };
            return {
              requestAccessToken(args) { window.__tokenCalls.push({ prompt: args && args.prompt }); },
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

// ---------------------------------------------------------------------------
// BUG-104: 元色の永続化と復元
// ---------------------------------------------------------------------------
test.describe('BUG-104: 元色の localStorage 永続化', () => {
  test('観点1: 素の予定(colorId 無し)をチェック → PATCH {"colorId":"8"} かつ orig に id="" 保存', async ({ page }) => {
    await connectWithStub(page, { seedItems: [] });
    await page.evaluate(() => window.PomodoroTimer.__setGcalEvents([
      { id: 'plain1', title: '素の予定', allDay: false, start: '2026-06-18T09:00:00+09:00', colorId: '' },
    ]));

    await cbByIndex(page, 0).check();
    await expect.poll(() => patchLog(page)).toHaveLength(1);
    const log = await patchLog(page);
    expect(log[0].body).toEqual({ colorId: '8' });
    expect(log[0].id).toBe('plain1');

    // 元色（既定色 = ''）が localStorage に永続化される
    await expect.poll(() => readOrig(page)).toEqual({ plain1: '' });
  });

  test('観点1b: 色つき予定(7)をチェック → orig に id="7" 保存（リロードしても残る）', async ({ page }) => {
    await connectWithStub(page, { seedItems: [] });
    await page.evaluate(() => window.PomodoroTimer.__setGcalEvents([
      { id: 'blueP', title: '青い予定', allDay: false, start: '2026-06-18T09:00:00+09:00', colorId: '7' },
    ]));

    await cbByIndex(page, 0).check();
    await expect.poll(() => patchLog(page)).toHaveLength(1);
    expect((await patchLog(page))[0].body).toEqual({ colorId: '8' });
    await expect.poll(() => readOrig(page)).toEqual({ blueP: '7' });

    // リロードしても orig が残る（永続化）
    await page.reload();
    await expect(page.locator('#timer')).toHaveText(/^\d{2}:\d{2}$/);
    await expect.poll(() => readOrig(page)).toEqual({ blueP: '7' });
  });

  test('観点2: 色つき(7)→リロード→解除で PATCH {"colorId":"7"}、成功後 orig から id 削除', async ({ page }) => {
    // orig を仕込んだ状態で起動（=リロード後にチェック済み表示のグレー予定がある状態を再現）
    await connectWithStub(page, {
      seedItems: [],
      localStorage: { [ORIG_COLOR_KEY]: JSON.stringify({ e1: '7' }) },
    });
    // グレー済み(colorId 8)＝チェック済み表示で描画
    await page.evaluate(() => window.PomodoroTimer.__setGcalEvents([
      { id: 'e1', title: 'グレー済み(元7)', allDay: false, start: '2026-06-18T09:00:00+09:00', colorId: '8' },
    ]));

    const cb = cbByIndex(page, 0);
    await expect(cb).toBeChecked();

    await cb.uncheck();
    await expect.poll(() => patchLog(page)).toHaveLength(1);
    const log = await patchLog(page);
    expect(log[0].id).toBe('e1');
    expect(log[0].body).toEqual({ colorId: '7' }); // null ではなく元色 '7' へ復元

    // 成功後 orig から e1 が消える
    await expect.poll(() => readOrig(page)).toEqual({});
  });

  test('観点3: 既定色(orig 保存なし)の grayed 予定を解除 → PATCH {"colorId":null}', async ({ page }) => {
    await connectWithStub(page, { seedItems: [] }); // orig 保存なし
    await page.evaluate(() => window.PomodoroTimer.__setGcalEvents([
      { id: 'e2', title: 'グレー済み(元既定)', allDay: false, start: '2026-06-18T09:00:00+09:00', colorId: '8' },
    ]));

    const cb = cbByIndex(page, 0);
    await expect(cb).toBeChecked();
    await cb.uncheck();

    await expect.poll(() => patchLog(page)).toHaveLength(1);
    const log = await patchLog(page);
    expect(log[0].id).toBe('e2');
    expect(log[0].body).toEqual({ colorId: null });
  });

  test('解除が PATCH 失敗(500)した場合は orig を消さない（再試行に備える）', async ({ page }) => {
    await connectWithStub(page, {
      seedItems: [],
      patchOk: false,
      localStorage: { [ORIG_COLOR_KEY]: JSON.stringify({ e9: '5' }) },
    });
    await page.evaluate(() => window.PomodoroTimer.__setGcalEvents([
      { id: 'e9', title: 'グレー済み(元5)', allDay: false, start: '2026-06-18T09:00:00+09:00', colorId: '8' },
    ]));

    const cb = cbByIndex(page, 0);
    await cb.evaluate((el) => { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await expect.poll(() => patchLog(page)).toHaveLength(1);
    expect((await patchLog(page))[0].body).toEqual({ colorId: '5' });

    // 失敗 → ロールバックで再チェック、orig は温存
    await expect(cb).toBeChecked();
    await expect.poll(() => readOrig(page)).toEqual({ e9: '5' });
  });
});

// ---------------------------------------------------------------------------
// BUG-101: 自動/手動の接続失敗時 UX 文言
// ---------------------------------------------------------------------------
test.describe('BUG-101: 接続失敗時の案内文言', () => {
  test('観点4: auto 失敗(error_callback) → 穏やか文言・connected 削除・connect ボタン表示', async ({ page }) => {
    await installInitStubs(page);
    await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: CLIENT_ID, [CONNECTED_KEY]: '1' } });

    await expect.poll(() => tokenCalls(page)).toHaveLength(1);
    expect((await tokenCalls(page))[0].prompt).toBe('');

    await page.evaluate(() => window.__gisCtl.error());

    const status = page.locator('#gcal-status');
    await expect(status).toBeVisible();
    await expect(status).toHaveText('接続するには「Google と接続」を押してください。');
    await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), CONNECTED_KEY)).toBeNull();
    await expect(page.locator('#gcal-connect-btn')).toBeVisible();
    await expect(page.locator('#gcal-refresh-btn')).toBeHidden();
  });

  test('観点4b: auto 失敗(空レスポンス callback) でも同じ穏やか文言', async ({ page }) => {
    await installInitStubs(page);
    await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: CLIENT_ID, [CONNECTED_KEY]: '1' } });

    await expect.poll(() => tokenCalls(page)).toHaveLength(1);
    await page.evaluate(() => window.__gisCtl.fireEmpty());

    await expect(page.locator('#gcal-status')).toHaveText('接続するには「Google と接続」を押してください。');
    await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), CONNECTED_KEY)).toBeNull();
  });

  test('観点5: manual 失敗(error_callback) → 「接続できませんでした。もう一度…」', async ({ page }) => {
    await installInitStubs(page);
    // connected フラグ無し → 起動時 autoConnect は走らない。手動ボタンで consent 要求。
    await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: CLIENT_ID } });

    await page.locator('#gcal-connect-btn').click();
    await expect.poll(() => tokenCalls(page)).toHaveLength(1);
    expect((await tokenCalls(page))[0].prompt).toBe('consent');

    await page.evaluate(() => window.__gisCtl.error());
    await expect(page.locator('#gcal-status'))
      .toHaveText('接続できませんでした。もう一度「Google と接続」を押してください。');
  });

  test('観点5b: manual 失敗(空レスポンス callback) でも manual 文言', async ({ page }) => {
    await installInitStubs(page);
    await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: CLIENT_ID } });

    await page.locator('#gcal-connect-btn').click();
    await expect.poll(() => tokenCalls(page)).toHaveLength(1);
    await page.evaluate(() => window.__gisCtl.fireEmpty());

    await expect(page.locator('#gcal-status'))
      .toHaveText('接続できませんでした。もう一度「Google と接続」を押してください。');
  });
});

// ---------------------------------------------------------------------------
// BUG-105: 再認証の多重発火防止
// ---------------------------------------------------------------------------
test.describe('BUG-105: in-flight 中の多重発火防止', () => {
  test('観点6: in-flight 中に connect 連打しても requestAccessToken は1回だけ', async ({ page }) => {
    await installInitStubs(page);
    // 起動時 autoConnect が prompt:'' を1回発火し、callback 未発火＝in-flight 継続
    await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: CLIENT_ID, [CONNECTED_KEY]: '1' } });
    await expect.poll(() => tokenCalls(page)).toHaveLength(1);

    // in-flight のまま手動 connect を連打 → 抑止されて増えない
    await page.locator('#gcal-connect-btn').click();
    await page.locator('#gcal-connect-btn').click();
    await page.locator('#gcal-connect-btn').click();
    await page.waitForTimeout(300);
    expect(await tokenCalls(page)).toHaveLength(1);
  });

  test('観点6b: callback 発火後は in-flight が解け、再度 requestAccessToken を呼べる', async ({ page }) => {
    await installInitStubs(page, { seedItems: [] });
    await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: CLIENT_ID, [CONNECTED_KEY]: '1' } });
    await expect.poll(() => tokenCalls(page)).toHaveLength(1);

    // callback を発火して in-flight 解除
    await page.evaluate(() => window.__gisCtl.fire('TOK'));
    await expect(page.locator('#gcal-refresh-btn')).toBeVisible();

    // 接続済み → 「更新」になっているので、再認証経路は connect ボタンが隠れる。
    // in-flight 解除の確認は __tokenCalls をリセットして直接 requestGcalToken を呼べるか…ではなく、
    // 401 等の再取得を模す代わりに、connect ボタンを再表示させて押す経路で確認する。
    await page.evaluate(() => { window.__tokenCalls = []; });
    // refresh は token 既存なので requestAccessToken は呼ばれない（GET のみ）。
    // ここでは「in-flight が false に戻った」ことを、connectGcal 経路を強制起動して確認する。
    await page.evaluate(() => {
      // connect ボタンを再表示して押下可能にする（UI 状態を擬似復帰）
      const b = document.getElementById('gcal-connect-btn');
      if (b) b.style.display = '';
    });
    await page.locator('#gcal-connect-btn').click();
    await expect.poll(() => tokenCalls(page)).toHaveLength(1);
  });

  test('観点6c: error_callback 発火後も in-flight が解け、再接続できる', async ({ page }) => {
    await installInitStubs(page);
    await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: CLIENT_ID, [CONNECTED_KEY]: '1' } });
    await expect.poll(() => tokenCalls(page)).toHaveLength(1);

    // auto 失敗 → in-flight=false、connect ボタン再表示
    await page.evaluate(() => window.__gisCtl.error());
    await expect(page.locator('#gcal-connect-btn')).toBeVisible();

    await page.evaluate(() => { window.__tokenCalls = []; });
    await page.locator('#gcal-connect-btn').click();
    await expect.poll(() => tokenCalls(page)).toHaveLength(1);
    // フラグ解除済みなので consent
    expect((await tokenCalls(page))[0].prompt).toBe('consent');
  });
});

// ---------------------------------------------------------------------------
test.describe('BUG fixes: console / pageerror 監視', () => {
  test('104/101/105 の一連操作で console error / pageerror が出ない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await connectWithStub(page, { seedItems: [] });
    await page.evaluate(() => window.PomodoroTimer.__setGcalEvents([
      { id: 'c1', title: '色つき', allDay: false, start: '2026-06-18T09:00:00+09:00', colorId: '7' },
    ]));
    await cbByIndex(page, 0).check();
    await expect.poll(() => patchLog(page)).toHaveLength(1);
    await cbByIndex(page, 0).uncheck();
    await expect.poll(() => patchLog(page)).toHaveLength(2);

    const real = errors.filter(
      (e) => !/iframe_api|ytimg|voicy|gtag|gsi\/client|accounts\.google|googleapis|net::ERR_FAILED|Failed to load resource/i.test(e)
    );
    expect(real).toEqual([]);
  });
});
