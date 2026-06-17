// 「今日のToDo」(Google Tasks API・読み書き同期) の検証。
//
// 仕様:
//  - 本文「今日のToDo」カードで Tasks API の ToDo を表示。チェックすると Google 側も完了に同期する。
//  - OAuth スコープ GCAL_SCOPE に auth/tasks を含む（接続時に calendar.readonly と両方許可）。
//  - 新 UI: #gtasks-progress-label / #gtasks-progress / #gtasks-progress-bar /
//           #gtasks-add-form / #gtasks-add-input / #gtasks-list / #gtasks-status
//
// 決定論化:
//  - 描画は window.PomodoroTimer.__setGcalTasks(tasks) フックで再現。
//  - 同期 (PATCH/POST) は gcalAccessToken が立っている必要があるため、GIS と fetch を
//    スタブして #gcal-connect-btn を押し、トークンを確立してから __setGcalTasks で seed する。
//    fetch スタブは呼ばれた method / URL / body を記録し検証する。
import { test, expect, gotoApp } from './fixtures.js';

const CLIENT_ID_KEY = 'pomodoro_gcal_client_id';

const TASKS = [
  { id: 't1', title: '経費精算', status: 'needsAction', due: '' },
  { id: 't2', title: '請求書送付', status: 'completed', due: '' },
];

async function setTasks(page, tasks) {
  await page.evaluate((t) => window.PomodoroTimer.__setGcalTasks(t), tasks);
}

/**
 * GIS + fetch をスタブし connect を押して gcalAccessToken を確立する。
 * window.__fetchLog に { method, url, body } を記録する。
 * fetchBehavior: '{id}' を含む各リクエストへの ok/status/json を制御。
 */
async function connectWithStub(page, opts = {}) {
  await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: 'stub.apps.googleusercontent.com' } });

  await page.evaluate((behavior) => {
    window.__fetchLog = [];
    window.__patchOk = behavior.patchOk !== false; // 既定 true
    window.__patchStatus = behavior.patchStatus || (window.__patchOk ? 200 : 500);
    window.__patchDelay = behavior.patchDelay || 0;
    window.__postResponse = behavior.postResponse || null;
    window.__postOk = behavior.postOk !== false;
    window.__postStatus = behavior.postStatus || (window.__postOk ? 200 : 500);

    window.google = {
      accounts: {
        oauth2: {
          initTokenClient(cfg) {
            window.__tokenClientScope = cfg.scope; // scope 文字列を記録
            return { requestAccessToken() { cfg.callback({ access_token: 'FAKE_TOKEN' }); } };
          },
        },
      },
    };

    const realFetch = window.fetch;
    window.fetch = (url, options) => {
      const opts = options || {};
      const method = (opts.method || 'GET').toUpperCase();
      let bodyParsed = null;
      try { bodyParsed = opts.body ? JSON.parse(opts.body) : null; } catch (_) { bodyParsed = opts.body; }
      const u = typeof url === 'string' ? url : String(url);

      // Calendar 取得（接続直後に fetchTodayEvents が走る）→ 空 items
      if (u.includes('googleapis.com/calendar')) {
        window.__fetchLog.push({ method, url: u, body: bodyParsed });
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ items: [] }) });
      }
      // Tasks 系
      if (u.includes('tasks.googleapis.com')) {
        window.__fetchLog.push({ method, url: u, body: bodyParsed });
        if (method === 'GET') {
          // fetchGtasks（接続直後）→ 空。テストは __setGcalTasks で seed する。
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ items: [] }) });
        }
        if (method === 'PATCH') {
          const make = () => ({ ok: window.__patchOk, status: window.__patchStatus, json: () => Promise.resolve({}) });
          // 失敗ケースは楽観的反映を観測できるよう少し遅延させる
          const delay = window.__patchDelay || 0;
          return delay
            ? new Promise((r) => setTimeout(() => r(make()), delay))
            : Promise.resolve(make());
        }
        if (method === 'POST') {
          const resp = window.__postResponse || { id: 'new-1', title: bodyParsed && bodyParsed.title, status: 'needsAction' };
          return Promise.resolve({ ok: window.__postOk, status: window.__postStatus, json: () => Promise.resolve(resp) });
        }
      }
      return realFetch(url, options);
    };
  }, opts);

  await page.locator('#gcal-connect-btn').click();
  // 接続完了 = add-form 表示に切替わる（renderGtasks 経由）まで待つ
  await expect(page.locator('#gtasks-add-form')).toBeVisible();
}

function fetchLog(page) {
  return page.evaluate(() => window.__fetchLog || []);
}

test.describe('今日のToDo: 初期状態（未接続）', () => {
  test('案内文表示 / add-form 非表示 / 進捗系非表示 / リスト空', async ({ page }) => {
    await gotoApp(page);
    const status = page.locator('#gtasks-status');
    await expect(status).toBeVisible();
    await expect(status).toContainText('Google');

    await expect(page.locator('#gtasks-add-form')).toBeHidden();
    await expect(page.locator('#gtasks-progress-label')).toBeHidden();
    await expect(page.locator('#gtasks-progress')).toBeHidden();
    await expect(page.locator('#gtasks-list > li')).toHaveCount(0);
  });
});

test.describe('今日のToDo: 描画（__setGcalTasks）', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('件数分の行・チェックボックス＋タイトル・completed は取消線＆チェック済', async ({ page }) => {
    await setTasks(page, TASKS);
    const items = page.locator('#gtasks-list > li');
    await expect(items).toHaveCount(2);
    await expect(page.locator('#gtasks-list > li input[type="checkbox"]')).toHaveCount(2);

    await expect(items.nth(0)).toContainText('経費精算');
    await expect(items.nth(1)).toContainText('請求書送付');

    // needsAction 行: 未チェック・取消線なし
    const cb0 = items.nth(0).locator('input[type="checkbox"]');
    await expect(cb0).not.toBeChecked();
    await expect(items.nth(0).locator('span')).not.toHaveClass(/text-decoration-line-through/);

    // completed 行: チェック済・取消線
    const cb1 = items.nth(1).locator('input[type="checkbox"]');
    await expect(cb1).toBeChecked();
    await expect(items.nth(1).locator('span')).toHaveClass(/text-decoration-line-through/);
  });

  test('接続→更新ボタン切替・add-form 表示・進捗 "1 / 2"', async ({ page }) => {
    await setTasks(page, TASKS);
    await expect(page.locator('#gcal-connect-btn')).toBeHidden();
    await expect(page.locator('#gcal-refresh-btn')).toBeVisible();
    await expect(page.locator('#gtasks-add-form')).toBeVisible();

    const label = page.locator('#gtasks-progress-label');
    await expect(label).toBeVisible();
    await expect(label).toHaveText('1 / 2');
    await expect(page.locator('#gtasks-progress')).toBeVisible();
    await expect(page.locator('#gtasks-progress-bar')).toHaveAttribute('aria-valuenow', '50');
  });

  test('status:completed の行は textContent 表示・XSS 実行されない', async ({ page }) => {
    await setTasks(page, [
      { id: 't1', title: '経費精算', status: 'needsAction', due: '' },
      { id: 't2', title: '<img src=x onerror=window.__xssT=1>', status: 'completed', due: '' },
    ]);
    await expect(page.locator('#gtasks-list img')).toHaveCount(0);
    const xss = await page.evaluate(() => window.__xssT);
    expect(xss).toBeUndefined();
    await expect(page.locator('#gtasks-list > li').nth(1))
      .toContainText('<img src=x onerror=window.__xssT=1>');
  });

  test('空: 「今日の ToDo はありません…」・進捗系非表示・add-form は表示', async ({ page }) => {
    await setTasks(page, []);
    await expect(page.locator('#gtasks-list > li')).toHaveCount(0);
    const status = page.locator('#gtasks-status');
    await expect(status).toBeVisible();
    await expect(status).toContainText('今日の ToDo はありません');
    await expect(page.locator('#gtasks-progress-label')).toBeHidden();
    await expect(page.locator('#gtasks-progress')).toBeHidden();
    await expect(page.locator('#gtasks-add-form')).toBeVisible();
  });
});

test.describe('今日のToDo: OAuth スコープ', () => {
  test('接続時の scope に auth/tasks と calendar.readonly を含む', async ({ page }) => {
    await connectWithStub(page);
    const scope = await page.evaluate(() => window.__tokenClientScope);
    expect(scope).toContain('https://www.googleapis.com/auth/tasks');
    expect(scope).toContain('calendar.readonly');
  });
});

test.describe('今日のToDo: チェックで完了同期（PATCH）', () => {
  test('未完了→完了: 楽観的に取消線＆進捗更新・PATCH body {status:completed}', async ({ page }) => {
    await connectWithStub(page);
    await setTasks(page, TASKS);
    // 接続時の GET ログをクリアして PATCH のみ見たい
    await page.evaluate(() => { window.__fetchLog = []; });

    const li0 = page.locator('#gtasks-list > li').nth(0);
    const cb0 = li0.locator('input[type="checkbox"]');
    await cb0.check();

    await expect(li0.locator('span')).toHaveClass(/text-decoration-line-through/);
    await expect(page.locator('#gtasks-progress-label')).toHaveText('2 / 2');

    await expect.poll(async () => (await fetchLog(page)).filter((r) => r.method === 'PATCH').length).toBe(1);
    const log = await fetchLog(page);
    const patch = log.find((r) => r.method === 'PATCH');
    expect(patch.url).toContain('tasks.googleapis.com/tasks/v1/lists/@default/tasks/t1');
    expect(patch.body).toMatchObject({ status: 'completed' });
  });

  test('完了→未完了: PATCH body {status:needsAction, completed:null}', async ({ page }) => {
    await connectWithStub(page);
    await setTasks(page, TASKS);
    await page.evaluate(() => { window.__fetchLog = []; });

    const li1 = page.locator('#gtasks-list > li').nth(1); // t2 = completed
    const cb1 = li1.locator('input[type="checkbox"]');
    await cb1.uncheck();

    await expect(li1.locator('span')).not.toHaveClass(/text-decoration-line-through/);
    await expect(page.locator('#gtasks-progress-label')).toHaveText('0 / 2');

    await expect.poll(async () => (await fetchLog(page)).filter((r) => r.method === 'PATCH').length).toBe(1);
    const patch = (await fetchLog(page)).find((r) => r.method === 'PATCH');
    expect(patch.url).toContain('/tasks/t2');
    expect(patch.body).toMatchObject({ status: 'needsAction', completed: null });
  });
});

test.describe('今日のToDo: 同期失敗時ロールバック', () => {
  test('PATCH が 500 → チェック・取消線・進捗が元に戻り status にエラー文', async ({ page }) => {
    // PATCH を遅延させて「楽観的反映 → ロールバック」の両局面を観測する
    await connectWithStub(page, { patchOk: false, patchStatus: 500, patchDelay: 250 });
    await setTasks(page, TASKS);

    const li0 = page.locator('#gtasks-list > li').nth(0);
    const cb0 = li0.locator('input[type="checkbox"]');
    await cb0.check();

    // 楽観反映: PATCH 応答前は完了表示（2 / 2）になる
    await expect(page.locator('#gtasks-progress-label')).toHaveText('2 / 2');

    // ロールバック: 500 応答後に未チェック・取消線なし・進捗 1/2・エラー文
    await expect(cb0).not.toBeChecked();
    await expect(li0.locator('span')).not.toHaveClass(/text-decoration-line-through/);
    await expect(page.locator('#gtasks-progress-label')).toHaveText('1 / 2');
    await expect(page.locator('#gtasks-status')).toContainText('失敗');
  });
});

test.describe('今日のToDo: 追加（POST）', () => {
  test('入力→送信: POST .../@default/tasks {title}・成功行が先頭に増える', async ({ page }) => {
    await connectWithStub(page, {
      postResponse: { id: 'created-9', title: '新規タスク', status: 'needsAction' },
    });
    await setTasks(page, TASKS);
    await page.evaluate(() => { window.__fetchLog = []; });

    await page.locator('#gtasks-add-input').fill('新規タスク');
    await page.locator('#gtasks-add-form button[type="submit"]').click();

    // 行が 3 件・先頭が新規
    await expect(page.locator('#gtasks-list > li')).toHaveCount(3);
    await expect(page.locator('#gtasks-list > li').nth(0)).toContainText('新規タスク');

    const post = (await fetchLog(page)).find((r) => r.method === 'POST');
    expect(post).toBeTruthy();
    expect(post.url).toMatch(/tasks\.googleapis\.com\/tasks\/v1\/lists\/@default\/tasks$/);
    expect(post.body).toMatchObject({ title: '新規タスク' });

    // 入力欄クリア
    await expect(page.locator('#gtasks-add-input')).toHaveValue('');
  });

  test('空入力では何もしない（POST されない・件数不変）', async ({ page }) => {
    await connectWithStub(page);
    await setTasks(page, TASKS);
    await page.evaluate(() => { window.__fetchLog = []; });

    await page.locator('#gtasks-add-input').fill('   ');
    await page.locator('#gtasks-add-form button[type="submit"]').click();

    await page.waitForTimeout(200);
    const posts = (await fetchLog(page)).filter((r) => r.method === 'POST');
    expect(posts.length).toBe(0);
    await expect(page.locator('#gtasks-list > li')).toHaveCount(2);
  });
});

test.describe('今日のToDo: a11y / console 監視', () => {
  test('各チェックボックスに aria-label がある', async ({ page }) => {
    await gotoApp(page);
    await setTasks(page, TASKS);
    const cbs = page.locator('#gtasks-list > li input[type="checkbox"]');
    const n = await cbs.count();
    for (let i = 0; i < n; i++) {
      expect((await cbs.nth(i).getAttribute('aria-label')) || '').not.toBe('');
    }
  });

  test('接続→描画→チェック→追加の一連で console error / pageerror が出ない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await connectWithStub(page, {
      postResponse: { id: 'c-1', title: '追加タスク', status: 'needsAction' },
    });
    await setTasks(page, TASKS);
    await page.locator('#gtasks-list > li').nth(0).locator('input[type="checkbox"]').check();
    await page.locator('#gtasks-add-input').fill('追加タスク');
    await page.locator('#gtasks-add-form button[type="submit"]').click();
    await expect(page.locator('#gtasks-list > li')).toHaveCount(3);

    const real = errors.filter(
      (e) => !/iframe_api|ytimg|voicy|gtag|gsi\/client|accounts\.google|googleapis|net::ERR_FAILED|Failed to load resource/i.test(e)
    );
    expect(real).toEqual([]);
  });
});
