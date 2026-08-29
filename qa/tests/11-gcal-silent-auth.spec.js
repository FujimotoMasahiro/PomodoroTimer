// Googleカレンダー: 毎回のアカウント選択ダイアログを出さないための仕組みの検証。
//
// 仕様（2026-08-29 追加）:
//  - scope に 'openid email' を含める。接続成功後 userinfo からメールを取得し
//    localStorage['pomodoro_gcal_account'] に控える。
//  - 起動時の無言復元 requestAccessToken({prompt:''}) には、控えたメールを
//    login_hint として必ず添える。複数アカウントがログインしている環境では
//    login_hint 無しの prompt:'' は account_selection_required で必ず失敗し、
//    毎回アカウント選択画面が出てしまうため。
//  - access_token は expires_in 付きで localStorage['pomodoro_gcal_token'] に
//    { token, expiresAt } としてキャッシュ。期限内の起動では Google への往復も
//    ダイアログも無しで復元する（requestAccessToken を呼ばない）。
//  - 期限切れ / 401 ではキャッシュを破棄し、まず *無言* で取り直す（対話 UI は出さない）。
import { test, expect, gotoApp } from './fixtures.js';

const CLIENT_ID_KEY = 'pomodoro_gcal_client_id';
const CONNECTED_KEY = 'pomodoro_gcal_connected';
const ACCOUNT_KEY = 'pomodoro_gcal_account';
const TOKEN_KEY = 'pomodoro_gcal_token';
const CLIENT_ID = 'silent.apps.googleusercontent.com';

const EVENTS = [
  { id: 'e1', summary: '朝会', start: { dateTime: '2026-08-29T09:00:00+09:00' } },
  { id: 'e2', summary: '設計レビュー', start: { dateTime: '2026-08-29T10:30:00+09:00' }, colorId: '7' },
];

/**
 * GIS + fetch をページ読み込み前にスタブ。
 * window.__tokenCalls = [{ prompt, hasPromptKey, loginHint, hasHintKey }]
 * window.__gisCtl = { fire(token, expiresIn), error(), capturedScope }
 * window.__calGetCount / __userinfoCount で往復回数を数える。
 */
async function installInitStubs(page, opts = {}) {
  await page.addInitScript((o) => {
    window.__tokenCalls = [];
    window.__calGetCount = 0;
    window.__userinfoCount = 0;
    const seedItems = o.seedItems || [];
    const email = o.email || 'someone@example.com';
    // 1 回目の GET だけ 401 を返して、失効時の振る舞いを見るためのスイッチ
    let getStatuses = (o.getStatuses || []).slice();

    const ctl = {};
    window.__gisCtl = ctl;

    window.google = {
      accounts: {
        oauth2: {
          initTokenClient(cfg) {
            ctl.capturedScope = cfg.scope;
            ctl.fire = (token, expiresIn) => cfg.callback(
              expiresIn === undefined
                ? { access_token: token }
                : { access_token: token, expires_in: expiresIn }
            );
            ctl.error = () => { if (cfg.error_callback) cfg.error_callback({ type: 'popup_closed' }); };
            return {
              requestAccessToken(args) {
                const a = args || {};
                window.__tokenCalls.push({
                  prompt: a.prompt,
                  hasPromptKey: Object.prototype.hasOwnProperty.call(a, 'prompt'),
                  loginHint: a.login_hint,
                  hasHintKey: Object.prototype.hasOwnProperty.call(a, 'login_hint'),
                });
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
      if (u.includes('oauth2/v3/userinfo')) {
        window.__userinfoCount++;
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ email }) });
      }
      if (u.includes('googleapis.com/calendar') && method === 'GET') {
        window.__calGetCount++;
        const status = getStatuses.length ? getStatuses.shift() : 200;
        return Promise.resolve({
          ok: status === 200, status,
          json: () => Promise.resolve({ items: seedItems }),
        });
      }
      if (u.includes('googleapis.com/calendar') && method === 'PATCH') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      }
      return realFetch(url, init);
    };
  }, opts);
}

const tokenCalls = (page) => page.evaluate(() => window.__tokenCalls || []);
const readToken = (page) =>
  page.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } }, TOKEN_KEY);

// 有効期限つきトークンキャッシュの seed 値を作る
const tokenSeed = (token, msFromNow) => JSON.stringify({ token, expiresAt: Date.now() + msFromNow });

// ---------------------------------------------------------------------------
test.describe('GCal 無言認証: scope とアカウント記憶', () => {
  test('scope に openid email と calendar.events が含まれる', async ({ page }) => {
    await installInitStubs(page);
    await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: CLIENT_ID } });
    await page.locator('#gcal-connect-btn').click();
    const scope = await page.evaluate(() => window.__gisCtl.capturedScope);
    expect(scope).toContain('openid');
    expect(scope).toContain('email');
    expect(scope).toContain('https://www.googleapis.com/auth/calendar.events');
  });

  test('接続成功で userinfo のメールを login_hint 用に控える', async ({ page }) => {
    await installInitStubs(page, { seedItems: EVENTS, email: 'masa@example.com' });
    await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: CLIENT_ID } });
    await page.locator('#gcal-connect-btn').click();
    await page.evaluate(() => window.__gisCtl.fire('tok-1', 3600));
    await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), ACCOUNT_KEY))
      .toBe('masa@example.com');
  });

  test('手動での再接続はメールを控え直す（別アカウントへ切り替えた場合に追随）', async ({ page }) => {
    await installInitStubs(page, { seedItems: EVENTS, email: 'new@example.com' });
    await gotoApp(page, {
      localStorage: { [CLIENT_ID_KEY]: CLIENT_ID, [ACCOUNT_KEY]: 'old@example.com' },
    });
    await page.locator('#gcal-connect-btn').click();
    await page.evaluate(() => window.__gisCtl.fire('tok-2', 3600));
    await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), ACCOUNT_KEY))
      .toBe('new@example.com');
  });
});

// ---------------------------------------------------------------------------
test.describe('GCal 無言認証: トークンのキャッシュ', () => {
  test('expires_in 付きの成功で { token, expiresAt } が localStorage に保存される', async ({ page }) => {
    await installInitStubs(page, { seedItems: EVENTS });
    await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: CLIENT_ID } });
    const before = Date.now();
    await page.locator('#gcal-connect-btn').click();
    await page.evaluate(() => window.__gisCtl.fire('tok-cache', 3600));

    await expect.poll(async () => (await readToken(page))?.token).toBe('tok-cache');
    const saved = await readToken(page);
    // 期限はおおよそ 1 時間後（前後の実行時間ぶんの幅を見る）
    expect(saved.expiresAt).toBeGreaterThan(before + 3500 * 1000);
    expect(saved.expiresAt).toBeLessThan(before + 3700 * 1000);
  });

  test('expires_in の無い応答はキャッシュしない（期限不明のトークンを抱えない）', async ({ page }) => {
    await installInitStubs(page, { seedItems: EVENTS });
    await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: CLIENT_ID } });
    await page.locator('#gcal-connect-btn').click();
    await page.evaluate(() => window.__gisCtl.fire('tok-nolife'));
    await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), CONNECTED_KEY)).toBe('1');
    expect(await readToken(page)).toBeNull();
  });

  test('期限内キャッシュがある起動では requestAccessToken を一切呼ばずに予定が出る', async ({ page }) => {
    await installInitStubs(page, { seedItems: EVENTS });
    await gotoApp(page, {
      localStorage: {
        [CLIENT_ID_KEY]: CLIENT_ID,
        [CONNECTED_KEY]: '1',
        [ACCOUNT_KEY]: 'masa@example.com',
        [TOKEN_KEY]: tokenSeed('cached-token', 30 * 60 * 1000),
      },
    });
    // 予定が描画される = キャッシュしたトークンで直接取得できている
    await expect(page.locator('#gcal-event-list > li')).toHaveCount(EVENTS.length);
    // 認証ダイアログにつながる呼び出しは 0 回
    expect(await tokenCalls(page)).toHaveLength(0);
    // 「更新」ボタン表示 = 接続済み UI
    await expect(page.locator('#gcal-refresh-btn')).toBeVisible();
  });

  test('期限切れキャッシュは破棄され、login_hint 付きの無言取得へ回る', async ({ page }) => {
    await installInitStubs(page, { seedItems: EVENTS });
    await gotoApp(page, {
      localStorage: {
        [CLIENT_ID_KEY]: CLIENT_ID,
        [CONNECTED_KEY]: '1',
        [ACCOUNT_KEY]: 'masa@example.com',
        [TOKEN_KEY]: tokenSeed('stale-token', -1000),   // すでに切れている
      },
    });
    await expect.poll(async () => (await tokenCalls(page)).length).toBe(1);
    const call = (await tokenCalls(page))[0];
    expect(call.prompt).toBe('');
    expect(call.loginHint).toBe('masa@example.com');
    expect(await readToken(page)).toBeNull();
    // 期限切れトークンでカレンダーを叩いていない
    expect(await page.evaluate(() => window.__calGetCount)).toBe(0);
  });

  test('残り 1 分を切ったキャッシュは使わない（期限ぎりぎりの 401 を避ける）', async ({ page }) => {
    await installInitStubs(page, { seedItems: EVENTS });
    await gotoApp(page, {
      localStorage: {
        [CLIENT_ID_KEY]: CLIENT_ID,
        [CONNECTED_KEY]: '1',
        [ACCOUNT_KEY]: 'masa@example.com',
        [TOKEN_KEY]: tokenSeed('almost-stale', 30 * 1000),
      },
    });
    await expect.poll(async () => (await tokenCalls(page)).length).toBe(1);
    expect((await tokenCalls(page))[0].prompt).toBe('');
    expect(await page.evaluate(() => window.__calGetCount)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
test.describe('GCal 無言認証: login_hint の受け渡し', () => {
  test('控えたメールがあれば起動時の無言取得に login_hint が乗る', async ({ page }) => {
    await installInitStubs(page, { seedItems: EVENTS });
    await gotoApp(page, {
      localStorage: {
        [CLIENT_ID_KEY]: CLIENT_ID, [CONNECTED_KEY]: '1', [ACCOUNT_KEY]: 'masa@example.com',
      },
    });
    await expect.poll(async () => (await tokenCalls(page)).length).toBe(1);
    const call = (await tokenCalls(page))[0];
    expect(call.prompt).toBe('');
    expect(call.loginHint).toBe('masa@example.com');
  });

  test('控えたメールが無ければ login_hint キーを付けない（空文字を渡さない）', async ({ page }) => {
    await installInitStubs(page, { seedItems: EVENTS });
    await gotoApp(page, {
      localStorage: { [CLIENT_ID_KEY]: CLIENT_ID, [CONNECTED_KEY]: '1' },
    });
    await expect.poll(async () => (await tokenCalls(page)).length).toBe(1);
    const call = (await tokenCalls(page))[0];
    expect(call.prompt).toBe('');
    expect(call.hasHintKey).toBe(false);
  });

  test('手動「Google と接続」は対話モードのまま（prompt / login_hint を付けない）', async ({ page }) => {
    await installInitStubs(page, { seedItems: EVENTS });
    await gotoApp(page, {
      localStorage: { [CLIENT_ID_KEY]: CLIENT_ID, [ACCOUNT_KEY]: 'masa@example.com' },
    });
    await page.locator('#gcal-connect-btn').click();
    await expect.poll(async () => (await tokenCalls(page)).length).toBe(1);
    const call = (await tokenCalls(page))[0];
    expect(call.hasPromptKey).toBe(false);
    expect(call.hasHintKey).toBe(false);
  });
});

// ---------------------------------------------------------------------------
test.describe('GCal 無言認証: 401 は対話ではなく無言で取り直す', () => {
  test('予定取得が 401 → キャッシュ破棄・prompt:"" + login_hint で再取得', async ({ page }) => {
    await installInitStubs(page, { seedItems: EVENTS, getStatuses: [401] });
    await gotoApp(page, {
      localStorage: {
        [CLIENT_ID_KEY]: CLIENT_ID,
        [CONNECTED_KEY]: '1',
        [ACCOUNT_KEY]: 'masa@example.com',
        [TOKEN_KEY]: tokenSeed('revoked-token', 30 * 60 * 1000),
      },
    });
    // キャッシュで 1 回叩き、401 を受けて無言リトライへ
    await expect.poll(async () => (await tokenCalls(page)).length).toBe(1);
    const call = (await tokenCalls(page))[0];
    expect(call.prompt).toBe('');            // 対話 UI ではない
    expect(call.loginHint).toBe('masa@example.com');
    expect(await readToken(page)).toBeNull(); // 失効トークンは残さない

    // 再取得が成功すれば、そのまま予定が出る
    await page.evaluate(() => window.__gisCtl.fire('fresh-token', 3600));
    await expect(page.locator('#gcal-event-list > li')).toHaveCount(EVENTS.length);
    await expect.poll(async () => (await readToken(page))?.token).toBe('fresh-token');
  });

  test('未接続で 401 相当になった場合は従来どおり対話接続へ落とす', async ({ page }) => {
    await installInitStubs(page, { seedItems: EVENTS, getStatuses: [401] });
    // connected フラグ無し = まだ一度も接続できていない状態
    await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: CLIENT_ID } });
    await page.locator('#gcal-connect-btn').click();
    await page.evaluate(() => window.__gisCtl.fire('tok-x', 3600));
    // 1 回目 = 手動接続、2 回目 = 401 後の再接続
    await expect.poll(async () => (await tokenCalls(page)).length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
test.describe('GCal 無言認証: console / pageerror 監視', () => {
  test('キャッシュ復元→401→無言再取得の一連で console error / pageerror が出ない', async ({ page }) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));

    await installInitStubs(page, { seedItems: EVENTS, getStatuses: [401] });
    await gotoApp(page, {
      localStorage: {
        [CLIENT_ID_KEY]: CLIENT_ID,
        [CONNECTED_KEY]: '1',
        [ACCOUNT_KEY]: 'masa@example.com',
        [TOKEN_KEY]: tokenSeed('revoked-token', 30 * 60 * 1000),
      },
    });
    await expect.poll(async () => (await tokenCalls(page)).length).toBe(1);
    await page.evaluate(() => window.__gisCtl.fire('fresh-token', 3600));
    await expect(page.locator('#gcal-event-list > li')).toHaveCount(EVENTS.length);

    // 外部依存の遮断由来のノイズ（gsi/client など）は除き、アプリ由来だけを見る
    const real = errors.filter(
      (e) => !/iframe_api|ytimg|voicy|gtag|gsi\/client|accounts\.google|googleapis|net::ERR_FAILED|Failed to load resource/i.test(e)
    );
    expect(real, JSON.stringify(real, null, 2)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 接続設定 (OAuth クライアント ID) の出し分け（2026-08-29）。
// 未連携のときだけ「今日の予定」パネルに出し、接続できたら畳む。
test.describe('GCal 無言認証: 接続設定の出し分け', () => {
  const setup = (page) => page.locator('#gcal-setup');

  test('接続成功で畳まれ、認証が失敗して未接続へ戻るとまた出てくる', async ({ page }) => {
    await installInitStubs(page, { seedItems: EVENTS });
    await gotoApp(page, {
      localStorage: { [CLIENT_ID_KEY]: CLIENT_ID, [CONNECTED_KEY]: '1', [ACCOUNT_KEY]: 'masa@example.com' },
    });

    // 起動時は未接続 = 設定が見えている
    await expect(setup(page)).toBeVisible();

    await expect.poll(async () => (await tokenCalls(page)).length).toBe(1);
    await page.evaluate(() => window.__gisCtl.fire('tok', 3600));

    // 接続できたら畳まれる
    await expect(page.locator('#gcal-refresh-btn')).toBeVisible();
    await expect(setup(page)).toBeHidden();

    // 認証が切れて未接続へ戻ると、また入力できる
    await page.evaluate(() => window.__gisCtl.error());
    await expect(page.locator('#gcal-connect-btn')).toBeVisible();
    await expect(setup(page)).toBeVisible();
  });
});
