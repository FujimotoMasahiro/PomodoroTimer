// Googleカレンダー連携（読み取り専用チェックリスト）の検証。
//
// 仕様変更（旧「埋め込み iframe + 週表示」を全面廃止）:
//  - 埋め込み URL 欄 / iframe / extractCalendarSrc / updateCalendar /
//    localStorage キー pomodoro_gcal_embed_url は撤去済み。
//  - 設定に OAuth クライアント ID 欄 (#gcal-client-id) を追加。trim して
//    localStorage キー pomodoro_gcal_client_id へ保存。
//  - 本文「今日の予定」カードで Calendar API（読み取り専用）の今日の予定を取得し、
//    自前チェックリストで表示。チェック（消化）状態は localStorage
//    キー pomodoro_gcal_done_ids（JSON 配列）にローカル保存。Google 側は変更しない。
//
// 外部依存（GIS / googleapis）は QA でブロックされるため、本番コードが用意した
// window.PomodoroTimer.__setGcalEvents(events) フックで「接続後に予定が来た状態」を
// 再現し、描画・チェック永続化・prune・XSS 安全性を決定論的に検証する。
import { test, expect, gotoApp } from './fixtures.js';

const CLIENT_ID_KEY = 'pomodoro_gcal_client_id';
const DONE_KEY = 'pomodoro_gcal_done_ids';

// __setGcalEvents へ渡す代表的な予定セット
const EVENTS = [
  { id: 'e1', title: '朝会', allDay: false, start: '2026-06-17T09:00:00+09:00' },
  { id: 'e2', title: '設計レビュー', allDay: false, start: '2026-06-17T10:30:00+09:00' },
  { id: 'e3', title: '終日タスク', allDay: true, start: '2026-06-17' },
];

async function setEvents(page, events) {
  await page.evaluate((ev) => window.PomodoroTimer.__setGcalEvents(ev), events);
}

async function getDoneIds(page) {
  return page.evaluate((k) => {
    try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (_) { return null; }
  }, DONE_KEY);
}

test.describe('Googleカレンダー連携: 初期状態（localStorage 空）', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('接続ボタン disabled / 更新ボタン非表示 / 進捗系非表示 / 案内文 / リスト空', async ({ page }) => {
    await expect(page.locator('#gcal-connect-btn')).toBeVisible();
    await expect(page.locator('#gcal-connect-btn')).toBeDisabled();

    await expect(page.locator('#gcal-refresh-btn')).toBeHidden();
    await expect(page.locator('#gcal-progress-label')).toBeHidden();
    await expect(page.locator('#gcal-progress')).toBeHidden();

    // 案内文（status）が見えていて、空のリスト
    const status = page.locator('#gcal-status');
    await expect(status).toBeVisible();
    await expect(status).toContainText('OAuth クライアント ID');
    await expect(page.locator('#gcal-event-list > li')).toHaveCount(0);
  });

  test('旧・埋め込み UI 要素が DOM から撤去されている', async ({ page }) => {
    for (const id of ['gcal-url', 'gcal-url-warning', 'gcal-container', 'gcal-placeholder']) {
      await expect(page.locator(`#${id}`)).toHaveCount(0);
    }
  });
});

test.describe('Googleカレンダー連携: クライアント ID 保存と接続ボタン活性', () => {
  test('ID 入力で localStorage 保存・trim・接続ボタン有効化', async ({ page }) => {
    await gotoApp(page);
    const input = page.locator('#gcal-client-id');
    await expect(input).toHaveValue('');

    // 前後空白を入れて trim を確認
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

test.describe('Googleカレンダー連携: 予定描画（__setGcalEvents）', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('件数分の行・各行に時刻（終日/HH:MM）＋タイトル＋チェックボックス', async ({ page }) => {
    await setEvents(page, EVENTS);

    const items = page.locator('#gcal-event-list > li');
    await expect(items).toHaveCount(3);

    // 各行にチェックボックス
    await expect(page.locator('#gcal-event-list > li input[type="checkbox"]')).toHaveCount(3);

    // タイトル表示
    await expect(items.nth(0)).toContainText('朝会');
    await expect(items.nth(1)).toContainText('設計レビュー');
    await expect(items.nth(2)).toContainText('終日タスク');

    // 時刻表示: 時刻あり = HH:MM、終日 = 「終日」
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

  test('進捗ラベル/バーが表示され "0 / 3" を示す', async ({ page }) => {
    await setEvents(page, EVENTS);
    const label = page.locator('#gcal-progress-label');
    await expect(label).toBeVisible();
    await expect(label).toHaveText('0 / 3');
    await expect(page.locator('#gcal-progress')).toBeVisible();
    await expect(page.locator('#gcal-progress-bar')).toHaveAttribute('aria-valuenow', '0');
  });
});

test.describe('Googleカレンダー連携: チェックで消化', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await setEvents(page, EVENTS);
  });

  test('チェックで取消線＋done_ids 追加＋進捗更新', async ({ page }) => {
    const firstTitle = page.locator('#gcal-event-list > li').nth(0).locator('span').last();
    const firstCb = page.locator('#gcal-event-list > li').nth(0).locator('input[type="checkbox"]');

    await firstCb.check();
    await expect(firstTitle).toHaveClass(/text-decoration-line-through/);

    await expect.poll(() => getDoneIds(page)).toEqual(['e1']);
    await expect(page.locator('#gcal-progress-label')).toHaveText('1 / 3');
    await expect(page.locator('#gcal-progress-bar')).toHaveAttribute('aria-valuenow', '33');
  });

  test('再描画後もチェック状態が復元される', async ({ page }) => {
    await page.locator('#gcal-event-list > li').nth(0).locator('input[type="checkbox"]').check();
    await expect.poll(() => getDoneIds(page)).toEqual(['e1']);

    // 再度 __setGcalEvents（= 「更新」相当の再描画）
    await setEvents(page, EVENTS);
    const firstCb = page.locator('#gcal-event-list > li').nth(0).locator('input[type="checkbox"]');
    await expect(firstCb).toBeChecked();
    await expect(page.locator('#gcal-progress-label')).toHaveText('1 / 3');
  });

  test('解除で done_ids から削除・取消線解除・進捗が戻る', async ({ page }) => {
    const firstCb = page.locator('#gcal-event-list > li').nth(0).locator('input[type="checkbox"]');
    const firstTitle = page.locator('#gcal-event-list > li').nth(0).locator('span').last();

    await firstCb.check();
    await expect.poll(() => getDoneIds(page)).toEqual(['e1']);

    await firstCb.uncheck();
    await expect(firstTitle).not.toHaveClass(/text-decoration-line-through/);
    await expect.poll(() => getDoneIds(page)).toEqual([]);
    await expect(page.locator('#gcal-progress-label')).toHaveText('0 / 3');
    await expect(page.locator('#gcal-progress-bar')).toHaveAttribute('aria-valuenow', '0');
  });

  test('全件チェックで "3 / 3"・バー 100%', async ({ page }) => {
    const cbs = page.locator('#gcal-event-list > li input[type="checkbox"]');
    const n = await cbs.count();
    for (let i = 0; i < n; i++) await cbs.nth(i).check();
    await expect(page.locator('#gcal-progress-label')).toHaveText('3 / 3');
    await expect(page.locator('#gcal-progress-bar')).toHaveAttribute('aria-valuenow', '100');
    await expect.poll(() => (getDoneIds(page)).then((a) => a && a.slice().sort()))
      .toEqual(['e1', 'e2', 'e3']);
  });
});

test.describe('Googleカレンダー連携: done_ids の prune（肥大化防止）', () => {
  test('今日の予定に無い ID は __setGcalEvents で除去される', async ({ page }) => {
    // 今日に存在しない stale な ID（zzz）を含めて仕込む。e1 は今日存在する。
    await gotoApp(page, { localStorage: { [DONE_KEY]: JSON.stringify(['e1', 'zzz-not-today']) } });
    await setEvents(page, EVENTS);

    // 描画後、存在しない zzz が削除され、e1 は保持される
    await expect.poll(() => (getDoneIds(page)).then((a) => a && a.slice().sort()))
      .toEqual(['e1']);
    // e1 のチェックは復元されている
    await expect(page.locator('#gcal-event-list > li').nth(0).locator('input[type="checkbox"]'))
      .toBeChecked();
    await expect(page.locator('#gcal-progress-label')).toHaveText('1 / 3');
  });
});

test.describe('Googleカレンダー連携: 空の予定', () => {
  test('__setGcalEvents([]) で「今日の予定はありません。」・進捗系非表示', async ({ page }) => {
    await gotoApp(page);
    await setEvents(page, []);

    await expect(page.locator('#gcal-event-list > li')).toHaveCount(0);
    const status = page.locator('#gcal-status');
    await expect(status).toBeVisible();
    await expect(status).toHaveText('今日の予定はありません。');
    await expect(page.locator('#gcal-progress-label')).toBeHidden();
    await expect(page.locator('#gcal-progress')).toBeHidden();
    // 空でも接続→更新の切替は起きる（renderGcalEvents が呼ばれる）
    await expect(page.locator('#gcal-refresh-btn')).toBeVisible();
  });
});

test.describe('Googleカレンダー連携: XSS 安全性', () => {
  test('タイトルの HTML は textContent 表示で実行されない', async ({ page }) => {
    await gotoApp(page);
    await setEvents(page, [
      { id: 'x1', title: '<img src=x onerror=window.__xss=1>', allDay: false, start: '2026-06-17T11:00:00+09:00' },
    ]);

    // リスト内に img 要素が注入されていない
    await expect(page.locator('#gcal-event-list img')).toHaveCount(0);
    // onerror が発火していない
    const xss = await page.evaluate(() => window.__xss);
    expect(xss).toBeUndefined();
    // タイトルは生文字列として可視
    await expect(page.locator('#gcal-event-list > li').first())
      .toContainText('<img src=x onerror=window.__xss=1>');
  });
});

test.describe('Googleカレンダー連携: 「通常のカレンダーを開く」ボタン', () => {
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

test.describe('Googleカレンダー連携: a11y / console 監視', () => {
  test('チェックボックスに aria-label がある', async ({ page }) => {
    await gotoApp(page);
    await setEvents(page, EVENTS);
    const cbs = page.locator('#gcal-event-list > li input[type="checkbox"]');
    const n = await cbs.count();
    for (let i = 0; i < n; i++) {
      expect((await cbs.nth(i).getAttribute('aria-label')) || '').not.toBe('');
    }
  });

  test('一連操作で console error / pageerror が出ない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await gotoApp(page);
    await page.locator('#gcal-client-id').fill('id.apps.googleusercontent.com');
    await setEvents(page, EVENTS);
    // チェック→解除→空→再投入の一連
    const firstCb = page.locator('#gcal-event-list > li').nth(0).locator('input[type="checkbox"]');
    await firstCb.check();
    await firstCb.uncheck();
    await setEvents(page, []);
    await setEvents(page, EVENTS);

    // 外部ブロック由来ノイズ（GIS/googleapis/youtube/voicy/gtag）は除外
    const real = errors.filter(
      (e) =>
        !/iframe_api|ytimg|voicy|gtag|gsi\/client|accounts\.google|googleapis|net::ERR_FAILED|Failed to load resource/i.test(e)
    );
    expect(real).toEqual([]);
  });
});

test.describe('Googleカレンダー連携: フル経路スタブ（GIS + fetch スタブ）', () => {
  // __setGcalEvents を介さず、connect クリック → 偽トークン → fetch スタブ items → 描画
  // までの本番経路（connectGcal / fetchTodayEvents / renderGcalEvents）を 1 本検証する。
  test('接続クリックで items が取得・描画される', async ({ page }) => {
    await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: 'stub.apps.googleusercontent.com' } });

    // GIS と fetch を本番コードのロード後にスタブ
    await page.evaluate(() => {
      window.google = {
        accounts: {
          oauth2: {
            initTokenClient(cfg) {
              return {
                requestAccessToken() {
                  // 同期的に callback を呼んで偽トークンを返す
                  cfg.callback({ access_token: 'FAKE_TOKEN' });
                },
              };
            },
          },
        },
      };
      const realFetch = window.fetch;
      window.fetch = (url, opts) => {
        if (typeof url === 'string' && url.includes('googleapis.com/calendar')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                items: [
                  { id: 'g1', summary: 'API 朝会', start: { dateTime: '2026-06-17T08:00:00+09:00' } },
                  { id: 'g2', summary: 'API 終日', start: { date: '2026-06-17' } },
                  { id: 'g3', start: { dateTime: '2026-06-17T13:00:00+09:00' } }, // summary 無し
                ],
              }),
          });
        }
        return realFetch(url, opts);
      };
    });

    await page.locator('#gcal-connect-btn').click();

    const items = page.locator('#gcal-event-list > li');
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toContainText('API 朝会');
    await expect(items.nth(0)).toContainText('08:00');
    await expect(items.nth(1)).toContainText('終日');
    // summary 無しは「(タイトルなし)」フォールバック
    await expect(items.nth(2)).toContainText('(タイトルなし)');
    await expect(page.locator('#gcal-progress-label')).toHaveText('0 / 3');
    await expect(page.locator('#gcal-refresh-btn')).toBeVisible();
  });
});
