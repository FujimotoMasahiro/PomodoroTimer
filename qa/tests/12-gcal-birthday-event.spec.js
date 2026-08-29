// カレンダー側で色を変えられない予定（Google Contacts 由来の誕生日など）の完了扱い。
//
// 仕様（2026-08-29 追加）:
//  - events.patch が HTTP 400 かつ reason='eventTypeRestriction' を返す予定は、
//    Google カレンダーへ書き戻せない。この場合、チェックはロールバックせず
//    「この画面だけの完了」として localStorage['pomodoro_gcal_local_done'] に覚える。
//    → 取り消し線・進捗カウントは完了として扱い、リロードしても完了のまま。
//  - チェックを外したときも同じく 400 になるが、画面の完了だけを取り消す。
//  - reason が違う 400（本物のリクエスト不正）は従来どおり失敗＝ロールバック。
//  - 今日の予定に出てこなくなった id は、予定取得のたびに掃除する。
import { test, expect, gotoApp } from './fixtures.js';

const CLIENT_ID_KEY = 'pomodoro_gcal_client_id';
const LOCAL_DONE_KEY = 'pomodoro_gcal_local_done';

// 実際に返ってきたレスポンス（誕生日の予定に colorId を書こうとしたとき）
const BIRTHDAY_ERROR = {
  error: {
    errors: [{
      domain: 'calendar',
      reason: 'eventTypeRestriction',
      message: "Attempt made to modify 'birthday' event in a way that is not valid for this event type.",
      extendedHelp: 'https://developers.google.com/workspace/calendar/api/guides/event-types#birthday',
    }],
    code: 400,
    message: "Attempt made to modify 'birthday' event in a way that is not valid for this event type.",
  },
};

// reason が違う 400（本物の失敗として扱ってほしいもの）
const OTHER_400 = {
  error: { errors: [{ domain: 'global', reason: 'invalid', message: 'Invalid value' }], code: 400, message: 'Invalid value' },
};

const EVENTS = [
  { id: 'bday1', title: '穂佳 甲矢さんの誕生日', allDay: true, start: '2026-08-29', colorId: '' },
  { id: 'e2', title: '領収書整理', allDay: false, start: '2026-08-29T14:30:00+09:00', colorId: '' },
];

const setEvents = (page, events) =>
  page.evaluate((ev) => window.PomodoroTimer.__setGcalEvents(ev), events);

const liByIndex = (page, i) => page.locator('#gcal-event-list > li').nth(i);
const cbByIndex = (page, i) => liByIndex(page, i).locator('input[type="checkbox"]');
const titleByIndex = (page, i) => liByIndex(page, i).locator('span').last();
const localDone = (page) =>
  page.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } }, LOCAL_DONE_KEY);
const patchLog = (page) => page.evaluate(() => window.__fetchLog || []);

/**
 * GIS + fetch をスタブし connect を押してトークンを確立する。
 * opts.restrictedIds に入れた id への PATCH は 400 eventTypeRestriction を返す。
 * opts.other400Ids に入れた id への PATCH は reason 違いの 400 を返す。
 * opts.seedItems は GET(events) が返す items。
 */
async function connectWithStub(page, opts = {}) {
  await gotoApp(page, { localStorage: { [CLIENT_ID_KEY]: 'stub.apps.googleusercontent.com', ...(opts.localStorage || {}) } });

  await page.evaluate((o) => {
    window.__fetchLog = [];
    const restricted = new Set(o.restrictedIds || []);
    const other400 = new Set(o.other400Ids || []);
    const seedItems = o.seedItems || [];
    const bdayErr = o.bdayErr;
    const otherErr = o.otherErr;

    window.google = {
      accounts: {
        oauth2: {
          initTokenClient(cfg) {
            return { requestAccessToken() { cfg.callback({ access_token: 'FAKE_TOKEN', expires_in: 3600 }); } };
          },
        },
      },
    };

    const realFetch = window.fetch;
    window.fetch = (url, init) => {
      const u = typeof url === 'string' ? url : (url && url.url) || '';
      const method = (init && init.method) || 'GET';
      if (u.includes('oauth2/v3/userinfo')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ email: 'masa@example.com' }) });
      }
      if (u.includes('googleapis.com/calendar') && method === 'GET') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ items: seedItems }) });
      }
      if (u.includes('googleapis.com/calendar') && method === 'PATCH') {
        const m = u.match(/events\/([^?]+)/);
        const id = m ? decodeURIComponent(m[1]) : null;
        window.__fetchLog.push({ id, body: init && init.body ? JSON.parse(init.body) : null });
        if (restricted.has(id)) {
          return Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve(bdayErr) });
        }
        if (other400.has(id)) {
          return Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve(otherErr) });
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      }
      return realFetch(url, init);
    };
  }, { ...opts, bdayErr: BIRTHDAY_ERROR, otherErr: OTHER_400 });

  await page.locator('#gcal-connect-btn').click();
  await expect(page.locator('#gcal-refresh-btn')).toBeVisible();
}

// ---------------------------------------------------------------------------
test.describe('GCal: 誕生日など色を変えられない予定を完了にする', () => {
  test('400 eventTypeRestriction でもチェックは外れず、完了表示になる', async ({ page }) => {
    await connectWithStub(page, { restrictedIds: ['bday1'] });
    await setEvents(page, EVENTS);

    await cbByIndex(page, 0).check();

    // チェックは付いたまま（ロールバックしない）
    await expect(cbByIndex(page, 0)).toBeChecked();
    // 取り消し線＝完了の見た目
    await expect(titleByIndex(page, 0)).toHaveCSS('text-decoration-line', 'line-through');
    // 進捗にも数えられる
    await expect(page.locator('#gcal-progress-label')).toHaveText('1 / 2');
    // PATCH は実際に試みている（諦める前に一度は書き戻そうとする）
    expect((await patchLog(page)).map((r) => r.id)).toEqual(['bday1']);
  });

  test('この画面だけの完了として localStorage に覚える', async ({ page }) => {
    await connectWithStub(page, { restrictedIds: ['bday1'] });
    await setEvents(page, EVENTS);

    await cbByIndex(page, 0).check();
    await expect.poll(() => localDone(page)).toEqual(['bday1']);
  });

  test('カレンダー側の色が元のままでも、リロード後に完了として復元される', async ({ page }) => {
    // Google からは colorId 無し（未完了の見た目）で返ってくるが、画面では完了
    await connectWithStub(page, {
      restrictedIds: ['bday1'],
      seedItems: [
        { id: 'bday1', summary: '穂佳 甲矢さんの誕生日', start: { date: '2026-08-29' } },
        { id: 'e2', summary: '領収書整理', start: { dateTime: '2026-08-29T14:30:00+09:00' } },
      ],
      localStorage: { [LOCAL_DONE_KEY]: JSON.stringify(['bday1']) },
    });

    await expect(page.locator('#gcal-event-list > li')).toHaveCount(2);
    await expect(cbByIndex(page, 0)).toBeChecked();
    await expect(page.locator('#gcal-progress-label')).toHaveText('1 / 2');
  });

  test('チェックを外すと（同じく 400 でも）画面の完了が取り消される', async ({ page }) => {
    await connectWithStub(page, {
      restrictedIds: ['bday1'],
      seedItems: [{ id: 'bday1', summary: '穂佳 甲矢さんの誕生日', start: { date: '2026-08-29' } }],
      localStorage: { [LOCAL_DONE_KEY]: JSON.stringify(['bday1']) },
    });

    await expect(cbByIndex(page, 0)).toBeChecked();
    await cbByIndex(page, 0).uncheck();

    await expect(cbByIndex(page, 0)).not.toBeChecked();
    await expect(titleByIndex(page, 0)).toHaveCSS('text-decoration-line', 'none');
    await expect.poll(() => localDone(page)).toEqual([]);
  });

  test('案内文で「この画面でのみ完了」だと分かる', async ({ page }) => {
    await connectWithStub(page, { restrictedIds: ['bday1'] });
    await setEvents(page, EVENTS);

    await cbByIndex(page, 0).check();
    await expect(page.locator('#gcal-status')).toContainText('この画面でのみ完了');
  });

  test('同じリストの通常の予定はこれまでどおりカレンダーへ書き戻す', async ({ page }) => {
    await connectWithStub(page, { restrictedIds: ['bday1'] });
    await setEvents(page, EVENTS);

    await cbByIndex(page, 1).check();

    await expect(cbByIndex(page, 1)).toBeChecked();
    const log = await patchLog(page);
    expect(log).toEqual([{ id: 'e2', body: { colorId: '8' } }]);
    // 通常の予定は色で完了を持つので、画面だけの完了には入れない
    await expect.poll(() => localDone(page)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
test.describe('GCal: 本物の 400 は従来どおり失敗として扱う', () => {
  test('reason が eventTypeRestriction でない 400 はロールバックする', async ({ page }) => {
    await connectWithStub(page, { other400Ids: ['e2'] });
    await setEvents(page, EVENTS);

    // ロールバックされるので check() ではなく click()（最終状態が変わらないため）
    await cbByIndex(page, 1).click();

    await expect(cbByIndex(page, 1)).not.toBeChecked();
    await expect(titleByIndex(page, 1)).toHaveCSS('text-decoration-line', 'none');
    await expect(page.locator('#gcal-status')).toContainText('HTTP 400');
    await expect.poll(() => localDone(page)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
test.describe('GCal: 画面だけの完了の後片付け', () => {
  test('今日の予定に無くなった id は予定取得のたびに捨てる', async ({ page }) => {
    // 昨日ぶんの 'old-bday' が残っている状態で、今日の予定には含まれない
    await connectWithStub(page, {
      seedItems: [{ id: 'e2', summary: '領収書整理', start: { dateTime: '2026-08-29T14:30:00+09:00' } }],
      localStorage: { [LOCAL_DONE_KEY]: JSON.stringify(['old-bday', 'e2']) },
    });

    await expect(page.locator('#gcal-event-list > li')).toHaveCount(1);
    await expect.poll(() => localDone(page)).toEqual(['e2']);
  });
});

// ---------------------------------------------------------------------------
test.describe('GCal 誕生日: console / pageerror 監視', () => {
  test('チェック→解除の一連で console error / pageerror が出ない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await connectWithStub(page, { restrictedIds: ['bday1'] });
    await setEvents(page, EVENTS);
    await cbByIndex(page, 0).check();
    await expect(page.locator('#gcal-progress-label')).toHaveText('1 / 2');
    await cbByIndex(page, 0).uncheck();
    await expect(page.locator('#gcal-progress-label')).toHaveText('0 / 2');

    const real = errors.filter(
      (e) => !/iframe_api|ytimg|voicy|gtag|gsi\/client|accounts\.google|googleapis|net::ERR_FAILED|Failed to load resource/i.test(e)
    );
    expect(real, JSON.stringify(real, null, 2)).toEqual([]);
  });
});
