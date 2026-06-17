// Googleカレンダー連携（予定をタスク扱い・チェックで colorId='8' へ書き戻し）の検証。
//
// 仕様（今回変更後）:
//  - Google Tasks (ToDo) UI は全廃。予定カードは col-12 単独。
//  - 「今日の予定」カードで Calendar API の今日の予定を取得し、自前チェックリストで表示。
//  - チェック（完了）= その予定の colorId を '8'（Graphite/グレー）へ書き換えて
//    Google カレンダーへ反映（events.patch）。外すと元の色へ戻す。
//  - 完了判定は colorId==='8'。ローカル完了集合 pomodoro_gcal_done_ids は廃止。
//  - OAuth スコープは https://www.googleapis.com/auth/calendar.events（tasks は含まない）。
//
// 決定論化:
//  - 描画は window.PomodoroTimer.__setGcalEvents(events) フックで再現。
//    events = [{ id, title, allDay, start, colorId }]。colorId:'8' は完了行。
//  - チェック操作は window.fetch で PATCH .../calendar/v3/calendars/primary/events/{id} を呼ぶ。
//    fetch をスタブして method / URL / body を検証する。書き戻しには gcalAccessToken が
//    必要なため、GIS + fetch をスタブして connect を押しトークンを確立する。
import { test, expect, gotoApp } from './fixtures.js';

const CLIENT_ID_KEY = 'pomodoro_gcal_client_id';

// __setGcalEvents へ渡す代表的な予定セット（すべて未完了 = colorId 非 '8'）
const EVENTS = [
  { id: 'e1', title: '朝会', allDay: false, start: '2026-06-18T09:00:00+09:00', colorId: '' },
  { id: 'e2', title: '設計レビュー', allDay: false, start: '2026-06-18T10:30:00+09:00', colorId: '7' },
  { id: 'e3', title: '終日タスク', allDay: true, start: '2026-06-18', colorId: '' },
];

async function setEvents(page, events) {
  await page.evaluate((ev) => window.PomodoroTimer.__setGcalEvents(ev), events);
}

const liByIndex = (page, i) => page.locator('#gcal-event-list > li').nth(i);
const cbByIndex = (page, i) => liByIndex(page, i).locator('input[type="checkbox"]');
const titleByIndex = (page, i) => liByIndex(page, i).locator('span').last();

/**
 * GIS + fetch をスタブし connect を押して gcalAccessToken を確立する。
 * window.__fetchLog に PATCH の { method, url, body, id } を記録する。
 * opts.patchOk=false で PATCH を 500 失敗させる。
 * 接続直後の今日の予定 fetch（GET）は seedItems を返す（既定: 空 items）。
 */
async function connectWithStub(page, opts = {}) {
  await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: 'stub.apps.googleusercontent.com' } });

  await page.evaluate((o) => {
    window.__fetchLog = [];
    window.__capturedScope = null;
    const patchOk = o.patchOk !== false; // 既定 true
    const seedItems = o.seedItems || [];

    window.google = {
      accounts: {
        oauth2: {
          initTokenClient(cfg) {
            window.__capturedScope = cfg.scope;
            return {
              requestAccessToken() {
                cfg.callback({ access_token: 'FAKE_TOKEN' });
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
      // 予定取得（GET）
      if (u.includes('googleapis.com/calendar') && method === 'GET') {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({ items: seedItems }),
        });
      }
      // 書き戻し（PATCH events/{id}）
      if (u.includes('googleapis.com/calendar') && method === 'PATCH') {
        const m = u.match(/events\/([^?]+)/);
        window.__fetchLog.push({
          method,
          url: u,
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
  // トークン確立を待つ（refresh ボタンが現れる ＝ renderGcalEvents 通過）
  await expect(page.locator('#gcal-refresh-btn')).toBeVisible();
}

async function patchLog(page) {
  return page.evaluate(() => window.__fetchLog || []);
}

// ---------------------------------------------------------------------------
test.describe('GCal: 初期状態（未接続・localStorage 空）', () => {
  test.beforeEach(async ({ page }) => { await gotoApp(page); });

  test('接続ボタン disabled / 更新非表示 / 進捗系非表示 / 案内文 / リスト空', async ({ page }) => {
    await expect(page.locator('#gcal-connect-btn')).toBeVisible();
    await expect(page.locator('#gcal-connect-btn')).toBeDisabled();
    await expect(page.locator('#gcal-refresh-btn')).toBeHidden();
    await expect(page.locator('#gcal-progress-label')).toBeHidden();
    await expect(page.locator('#gcal-progress')).toBeHidden();

    const status = page.locator('#gcal-status');
    await expect(status).toBeVisible();
    await expect(status).toContainText('OAuth クライアント ID');
    await expect(page.locator('#gcal-event-list > li')).toHaveCount(0);
  });

  test('ToDo(Tasks) 関連要素が DOM から消えている', async ({ page }) => {
    for (const id of ['gtasks-list', 'gtasks-status', 'gtasks-progress', 'gtasks-progress-bar',
      'gtasks-progress-label', 'gtasks-add-form', 'gtasks-add-input']) {
      await expect(page.locator(`#${id}`)).toHaveCount(0);
    }
  });

  test('旧・埋め込み UI 要素も DOM から消えている', async ({ page }) => {
    for (const id of ['gcal-url', 'gcal-url-warning', 'gcal-container', 'gcal-placeholder']) {
      await expect(page.locator(`#${id}`)).toHaveCount(0);
    }
  });
});

test.describe('GCal: クライアント ID 保存と接続ボタン活性', () => {
  test('ID 入力で localStorage 保存・trim・接続ボタン有効化', async ({ page }) => {
    await gotoApp(page);
    const input = page.locator('#gcal-client-id');
    await expect(input).toHaveValue('');
    await input.fill('  abc123.apps.googleusercontent.com  ');
    await expect
      .poll(() => page.evaluate((k) => localStorage.getItem(k), CLIENT_ID_KEY))
      .toBe('abc123.apps.googleusercontent.com');
    await expect(page.locator('#gcal-connect-btn')).toBeEnabled();
  });

  test('リロードで input 復元＆接続ボタン有効（保存済み ID）', async ({ page }) => {
    await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: 'saved.apps.googleusercontent.com' } });
    await expect(page.locator('#gcal-client-id')).toHaveValue('saved.apps.googleusercontent.com');
    await expect(page.locator('#gcal-connect-btn')).toBeEnabled();
  });

  test('ID を空に戻すと接続ボタンが再び disabled', async ({ page }) => {
    await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: 'x.apps.googleusercontent.com' } });
    await expect(page.locator('#gcal-connect-btn')).toBeEnabled();
    await page.locator('#gcal-client-id').fill('');
    await expect(page.locator('#gcal-connect-btn')).toBeDisabled();
  });
});

test.describe('GCal: 予定描画（__setGcalEvents）', () => {
  test.beforeEach(async ({ page }) => { await gotoApp(page); });

  test('件数分の行・時刻（終日/HH:MM）＋タイトル＋チェックボックス', async ({ page }) => {
    await setEvents(page, EVENTS);
    const items = page.locator('#gcal-event-list > li');
    await expect(items).toHaveCount(3);
    await expect(page.locator('#gcal-event-list > li input[type="checkbox"]')).toHaveCount(3);

    await expect(items.nth(0)).toContainText('朝会');
    await expect(items.nth(1)).toContainText('設計レビュー');
    await expect(items.nth(2)).toContainText('終日タスク');

    await expect(items.nth(0)).toContainText('09:00');
    await expect(items.nth(1)).toContainText('10:30');
    await expect(items.nth(2)).toContainText('終日');
  });

  test('接続ボタンが隠れ「更新」が表示・status が空になる', async ({ page }) => {
    await setEvents(page, EVENTS);
    await expect(page.locator('#gcal-connect-btn')).toBeHidden();
    await expect(page.locator('#gcal-refresh-btn')).toBeVisible();
    await expect(page.locator('#gcal-status')).toBeHidden();
  });

  test('未完了行は未チェック・取消線なし、進捗 "0 / 3"', async ({ page }) => {
    await setEvents(page, EVENTS);
    for (let i = 0; i < 3; i++) {
      await expect(cbByIndex(page, i)).not.toBeChecked();
      await expect(titleByIndex(page, i)).not.toHaveClass(/text-decoration-line-through/);
    }
    const label = page.locator('#gcal-progress-label');
    await expect(label).toBeVisible();
    await expect(label).toHaveText('0 / 3');
    await expect(page.locator('#gcal-progress')).toBeVisible();
    await expect(page.locator('#gcal-progress-bar')).toHaveAttribute('aria-valuenow', '0');
  });

  test('colorId:"8" の行は checked かつ取消線・進捗は完了数を反映 "1 / 3"', async ({ page }) => {
    await setEvents(page, [
      { id: 'a', title: '完了済み予定', allDay: false, start: '2026-06-18T09:00:00+09:00', colorId: '8' },
      { id: 'b', title: '未完了 1', allDay: false, start: '2026-06-18T10:00:00+09:00', colorId: '' },
      { id: 'c', title: '未完了 2', allDay: true, start: '2026-06-18', colorId: '5' },
    ]);
    await expect(cbByIndex(page, 0)).toBeChecked();
    await expect(titleByIndex(page, 0)).toHaveClass(/text-decoration-line-through/);
    await expect(cbByIndex(page, 1)).not.toBeChecked();
    await expect(cbByIndex(page, 2)).not.toBeChecked();
    await expect(page.locator('#gcal-progress-label')).toHaveText('1 / 3');
    await expect(page.locator('#gcal-progress-bar')).toHaveAttribute('aria-valuenow', '33');
  });
});

test.describe('GCal: 空の予定', () => {
  test('__setGcalEvents([]) で「今日の予定はありません。」・進捗系非表示', async ({ page }) => {
    await gotoApp(page);
    await setEvents(page, []);
    await expect(page.locator('#gcal-event-list > li')).toHaveCount(0);
    const status = page.locator('#gcal-status');
    await expect(status).toBeVisible();
    await expect(status).toHaveText('今日の予定はありません。');
    await expect(page.locator('#gcal-progress-label')).toBeHidden();
    await expect(page.locator('#gcal-progress')).toBeHidden();
    await expect(page.locator('#gcal-refresh-btn')).toBeVisible();
  });
});

test.describe('GCal: XSS 安全性', () => {
  test('タイトルの HTML は textContent 表示で実行されない', async ({ page }) => {
    await gotoApp(page);
    await setEvents(page, [
      { id: 'x1', title: '<img src=x onerror=window.__xss=1>', allDay: false, start: '2026-06-18T11:00:00+09:00', colorId: '' },
    ]);
    await expect(page.locator('#gcal-event-list img')).toHaveCount(0);
    const xss = await page.evaluate(() => window.__xss);
    expect(xss).toBeUndefined();
    await expect(page.locator('#gcal-event-list > li').first())
      .toContainText('<img src=x onerror=window.__xss=1>');
  });
});

test.describe('GCal: 「通常のカレンダーを開く」ボタン', () => {
  test('href / target / rel が仕様どおり・常時表示（初期）', async ({ page }) => {
    await gotoApp(page);
    const btn = page.locator('#gcal-open-full');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('href', 'https://calendar.google.com/calendar/u/0/r');
    await expect(btn).toHaveAttribute('target', '_blank');
    expect((await btn.getAttribute('rel')) || '').toContain('noopener');
  });

  test('予定描画後もボタンは表示され続ける', async ({ page }) => {
    await gotoApp(page);
    await setEvents(page, EVENTS);
    await expect(page.locator('#gcal-open-full')).toBeVisible();
  });
});

test.describe('GCal: a11y', () => {
  test('チェックボックスに aria-label がある', async ({ page }) => {
    await gotoApp(page);
    await setEvents(page, EVENTS);
    const cbs = page.locator('#gcal-event-list > li input[type="checkbox"]');
    const n = await cbs.count();
    for (let i = 0; i < n; i++) {
      expect((await cbs.nth(i).getAttribute('aria-label')) || '').not.toBe('');
    }
  });
});

// ---------------------------------------------------------------------------
// 書き戻し（PATCH）の本番経路: GIS + fetch スタブでトークン確立後に検証
// ---------------------------------------------------------------------------
test.describe('GCal: OAuth スコープ', () => {
  test('initTokenClient に渡る scope が calendar.events を含み tasks を含まない', async ({ page }) => {
    await connectWithStub(page, { seedItems: [] });
    const scope = await page.evaluate(() => window.__capturedScope);
    expect(scope).toContain('https://www.googleapis.com/auth/calendar.events');
    expect(scope).not.toContain('tasks');
    expect(scope).not.toContain('calendar.readonly');
  });
});

test.describe('GCal: チェック（完了）で colorId="8" を PATCH', () => {
  test('未完了→チェックで楽観的取消線＋進捗更新＋PATCH body {"colorId":"8"}', async ({ page }) => {
    await connectWithStub(page, { seedItems: [] });
    await setEvents(page, EVENTS);

    const cb = cbByIndex(page, 0);
    const title = titleByIndex(page, 0);
    await cb.check();

    await expect(title).toHaveClass(/text-decoration-line-through/);
    await expect(page.locator('#gcal-progress-label')).toHaveText('1 / 3');
    await expect(page.locator('#gcal-progress-bar')).toHaveAttribute('aria-valuenow', '33');

    await expect.poll(() => patchLog(page)).toHaveLength(1);
    const log = await patchLog(page);
    expect(log[0].method).toBe('PATCH');
    expect(log[0].url).toContain('/calendar/v3/calendars/primary/events/e1');
    expect(log[0].body).toEqual({ colorId: '8' });
  });
});

test.describe('GCal: チェック解除で元の色へ戻す PATCH', () => {
  test('元が既定色（colorId:"8" 初期）の行を外すと body {"colorId":null}', async ({ page }) => {
    await connectWithStub(page, { seedItems: [] });
    // 元色が不明（初期から '8'）の完了行
    await setEvents(page, [
      { id: 'done1', title: 'グレー済み', allDay: false, start: '2026-06-18T09:00:00+09:00', colorId: '8' },
    ]);
    const cb = cbByIndex(page, 0);
    await expect(cb).toBeChecked();

    await cb.uncheck();
    await expect(titleByIndex(page, 0)).not.toHaveClass(/text-decoration-line-through/);

    await expect.poll(() => patchLog(page)).toHaveLength(1);
    const log = await patchLog(page);
    expect(log[0].id).toBe('done1');
    expect(log[0].body).toEqual({ colorId: null });
  });

  test('同一セッションで「元が青(7)→チェック→解除」すると元の "7" へ戻す PATCH', async ({ page }) => {
    await connectWithStub(page, { seedItems: [] });
    await setEvents(page, [
      { id: 'blue1', title: '青い予定', allDay: false, start: '2026-06-18T09:00:00+09:00', colorId: '7' },
    ]);
    const cb = cbByIndex(page, 0);
    await expect(cb).not.toBeChecked();

    // チェック → '8' を PATCH
    await cb.check();
    await expect.poll(() => patchLog(page)).toHaveLength(1);
    let log = await patchLog(page);
    expect(log[0].body).toEqual({ colorId: '8' });

    // 解除 → 元色 '7' へ戻す PATCH
    await cb.uncheck();
    await expect.poll(() => patchLog(page)).toHaveLength(2);
    log = await patchLog(page);
    expect(log[1].body).toEqual({ colorId: '7' });
    await expect(titleByIndex(page, 0)).not.toHaveClass(/text-decoration-line-through/);
  });
});

test.describe('GCal: 書き戻し失敗でロールバック', () => {
  test('PATCH 500 でチェック/取消線/進捗が元に戻り status にエラー文', async ({ page }) => {
    await connectWithStub(page, { seedItems: [], patchOk: false });
    await setEvents(page, EVENTS);

    const cb = cbByIndex(page, 0);
    const title = titleByIndex(page, 0);
    // check() は「チェック済みで確定」を検証するが、本テストは失敗ロールバックで
    // 即座に未チェックへ戻るため、change を直接発火させてハンドラだけ起動する。
    await cb.evaluate((el) => { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); });

    // PATCH が呼ばれる
    await expect.poll(() => patchLog(page)).toHaveLength(1);
    const log = await patchLog(page);
    expect(log[0].body).toEqual({ colorId: '8' });

    // ロールバック: 未チェック・取消線解除・進捗 0/3
    await expect(cb).not.toBeChecked();
    await expect(title).not.toHaveClass(/text-decoration-line-through/);
    await expect(page.locator('#gcal-progress-label')).toHaveText('0 / 3');
    await expect(page.locator('#gcal-progress-bar')).toHaveAttribute('aria-valuenow', '0');

    // エラー文
    const status = page.locator('#gcal-status');
    await expect(status).toBeVisible();
    await expect(status).toContainText(/失敗|エラー/);
  });
});

test.describe('GCal: フル経路（connect → GET → 描画）', () => {
  test('接続クリックで items が取得・colorId 反映で描画される', async ({ page }) => {
    await connectWithStub(page, {
      seedItems: [
        { id: 'g1', summary: 'API 朝会', start: { dateTime: '2026-06-18T08:00:00+09:00' } },
        { id: 'g2', summary: 'API 終日', start: { date: '2026-06-18' } },
        { id: 'g3', start: { dateTime: '2026-06-18T13:00:00+09:00' }, colorId: '8' }, // 完了 & summary 無し
      ],
    });

    const items = page.locator('#gcal-event-list > li');
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toContainText('API 朝会');
    await expect(items.nth(0)).toContainText('08:00');
    await expect(items.nth(1)).toContainText('終日');
    await expect(items.nth(2)).toContainText('(タイトルなし)');
    // colorId:'8' の g3 は完了
    await expect(cbByIndex(page, 2)).toBeChecked();
    await expect(page.locator('#gcal-progress-label')).toHaveText('1 / 3');
  });
});

test.describe('GCal: console / pageerror 監視', () => {
  test('一連操作で console error / pageerror が出ない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await connectWithStub(page, { seedItems: [] });
    await setEvents(page, EVENTS);
    const cb = cbByIndex(page, 0);
    await cb.check();
    await expect.poll(() => patchLog(page)).toHaveLength(1);
    await cb.uncheck();
    await expect.poll(() => patchLog(page)).toHaveLength(2);
    await setEvents(page, []);
    await setEvents(page, EVENTS);

    const real = errors.filter(
      (e) => !/iframe_api|ytimg|voicy|gtag|gsi\/client|accounts\.google|googleapis|net::ERR_FAILED|Failed to load resource/i.test(e)
    );
    expect(real).toEqual([]);
  });
});
