// YouTube 再生まわりの新挙動を決定論的に検証するスペック。
//  - 勉強/作業モードの再生対象フィルタ (getActiveYouTubeUrls / youtubeQueueIds)
//  - 並び替えの再読み込み条件 (先頭が変われば resetPosition、それ以外は維持)
//  - 10 秒進捗保存と loadVideoById({startSeconds}) 復帰
//  - 旧形式互換 / モード保存 / 空行扱い
// 既定の fixtures は YouTube IFrame API をブロックして決定論化するが、ここでは
// 実 API の代わりにフェイク YT.Player を注入し、loadVideoById / playVideo /
// pauseVideo の呼び出し列 (window.__ytCalls) を観測して再生挙動まで踏み込む。
import { test, expect } from '@playwright/test';

const AUDIO_KEY = 'pomodoro_audio_source_settings';
const ID_A = 'aaaaaaaaaaa';
const ID_B = 'bbbbbbbbbbb';
const ID_C = 'ccccccccccc';
const URL_A = `https://www.youtube.com/watch?v=${ID_A}`;
const URL_B = `https://www.youtube.com/watch?v=${ID_B}`;
const URL_C = `https://www.youtube.com/watch?v=${ID_C}`;

// 外部ノイズをブロックしつつ、YT フェイクを注入して app を開く。
async function gotoWithFakeYT(page, opts = {}) {
  const { localStorage: ls = {} } = opts;
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (
      url.includes('googletagmanager.com') ||
      url.includes('google-analytics.com') ||
      url.includes('youtube.com/iframe_api') ||
      url.includes('img.youtube.com') ||
      url.includes('i.ytimg.com') ||
      url.includes('voicy.jp')
    ) return route.abort();
    return route.continue();
  });

  const seed = { ...ls, pomodoro_yt_ext_dismissed: 'true' };
  await page.addInitScript((entries) => {
    try { for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v); } catch (_) {}
  }, seed);

  // フェイク YT.Player: 呼び出し列を window.__ytCalls に記録。
  await page.addInitScript(() => {
    window.__ytCalls = [];
    function FakePlayer(elId, cfg) {
      this._cfg = cfg || {};
      this._videoId = (cfg && cfg.videoId) || null;
      this._currentTime = 0;
      window.__ytCalls.push({ type: 'new', videoId: this._videoId, start: cfg && cfg.playerVars && cfg.playerVars.start });
      // onReady を非同期で発火
      setTimeout(() => { try { cfg.events && cfg.events.onReady && cfg.events.onReady({ target: this }); } catch (_) {} }, 0);
    }
    FakePlayer.prototype.playVideo = function () { window.__ytCalls.push({ type: 'playVideo', videoId: this._videoId }); };
    FakePlayer.prototype.pauseVideo = function () { window.__ytCalls.push({ type: 'pauseVideo', videoId: this._videoId }); };
    FakePlayer.prototype.loadVideoById = function (arg) {
      if (typeof arg === 'object') { this._videoId = arg.videoId; window.__ytCalls.push({ type: 'loadVideoById', videoId: arg.videoId, start: arg.startSeconds }); }
      else { this._videoId = arg; window.__ytCalls.push({ type: 'loadVideoById', videoId: arg, start: undefined }); }
    };
    FakePlayer.prototype.getCurrentTime = function () { return this._currentTime; };
    // テストから現在時刻を仕込めるように
    window.__setYtTime = (t) => { /* 後で wirePlayer で実体に繋ぐ */ window.__ytTime = t; };
    FakePlayer.prototype.getCurrentTime = function () { return (typeof window.__ytTime === 'number') ? window.__ytTime : this._currentTime; };
    // ENDED を発火させるヘルパ
    window.__fireEnded = () => {
      const cb = window.__lastPlayerEvents && window.__lastPlayerEvents.onStateChange;
      if (cb) cb({ data: 0, target: window.__lastPlayer });
    };
    const _origNew = FakePlayer;
    function Wrapped(elId, cfg) {
      window.__lastPlayerEvents = cfg && cfg.events;
      const inst = new _origNew(elId, cfg);
      window.__lastPlayer = inst;
      return inst;
    }
    window.YT = { Player: Wrapped, PlayerState: { ENDED: 0 } };
  });

  await page.goto('/index.html');
  await expect(page.locator('#timer')).toHaveText(/^\d{2}:\d{2}$/);
}

async function ytCalls(page) { return page.evaluate(() => window.__ytCalls || []); }

// URL 行を直接入力して n 番目の input を埋める
async function fillRow(page, idx, url) {
  const input = page.locator('#youtube-url-list .yt-url-row input[type="url"]').nth(idx);
  await input.fill(url);
}

test.describe('探索: 勉強/作業モードの再生対象フィルタ', () => {
  test('作業モードは未チェックのみ、勉強モードはチェック済みのみを再生対象にする', async ({ page }) => {
    await gotoWithFakeYT(page);
    await page.locator('#work-source').selectOption('youtube');

    // 3 本入力: A(未チェック), B(チェック=勉強), C(未チェック)
    await fillRow(page, 0, URL_A);
    await fillRow(page, 1, URL_B);
    await fillRow(page, 2, URL_C);
    await page.locator('#youtube-url-list .yt-url-row').nth(1).locator('.yt-study-check').check();

    // 作業モード(既定)で start → A から再生 (B はスキップされ対象外)
    await page.locator('#start-btn').click();
    await page.waitForTimeout(50);
    let calls = await ytCalls(page);
    const firstNew = calls.find((c) => c.type === 'new');
    expect(firstNew.videoId).toBe(ID_A);

    // 勉強モードへ切替 → 対象は B のみ。scheduleUrlRefresh(300ms debounce) を待つ
    await page.locator('label[for="yt-mode-study"]').click();
    await page.waitForTimeout(450);
    calls = await ytCalls(page);
    // B へ loadVideoById されているはず
    const loadedB = calls.find((c) => c.type === 'loadVideoById' && c.videoId === ID_B);
    expect(loadedB, 'study モードで B に切替わる').toBeTruthy();
  });

  test('勉強モードで対象が空なら pause される (無音)', async ({ page }) => {
    await gotoWithFakeYT(page);
    await page.locator('#work-source').selectOption('youtube');
    await fillRow(page, 0, URL_A); // 未チェックのみ
    await page.locator('#start-btn').click();
    await page.waitForTimeout(50);
    // 勉強モードへ: チェック済みが無い → pause
    await page.locator('label[for="yt-mode-study"]').click();
    await page.waitForTimeout(450);
    const calls = await ytCalls(page);
    expect(calls.some((c) => c.type === 'pauseVideo')).toBe(true);
  });
});

test.describe('探索: 並び替えの再読み込み条件', () => {
  // dragstart/dragend を JS から直接 dispatch して reorder ロジックだけを駆動する。
  async function reorder(page, fromIdx, toIdx) {
    await page.evaluate(({ fromIdx, toIdx }) => {
      const rows = [...document.querySelectorAll('#youtube-url-list .yt-url-row')];
      const from = rows[fromIdx];
      const dt = new DataTransfer();
      from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      // DOM 上で実際に並び替える (dragover ハンドラ相当)
      const container = document.getElementById('youtube-url-list');
      const ref = rows[toIdx];
      if (toIdx > fromIdx) container.insertBefore(from, ref.nextSibling);
      else container.insertBefore(from, ref);
      from.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    }, { fromIdx, toIdx });
  }

  test('先頭が変わらない並び替えは resetPosition せず継続 (再読み込みしない)', async ({ page }) => {
    await gotoWithFakeYT(page);
    await page.locator('#work-source').selectOption('youtube');
    await fillRow(page, 0, URL_A);
    await fillRow(page, 1, URL_B);
    await fillRow(page, 2, URL_C);
    await page.locator('#start-btn').click();
    await page.waitForTimeout(50);
    await page.evaluate(() => { window.__ytCalls = []; }); // ここから観測

    // 2 番目と 3 番目を入替 (A,B,C -> A,C,B)。先頭 A は不変
    await reorder(page, 1, 2);
    await page.waitForTimeout(100);
    const calls = await ytCalls(page);
    // 先頭不変なので新規再生(new)や別動画への loadVideoById は起きないことを期待
    const reloaded = calls.find((c) => c.type === 'loadVideoById' || c.type === 'new');
    expect(reloaded, '先頭不変では動画の差し替えが起きない').toBeFalsy();
  });

  test('先頭が変わる並び替えは resetPosition して新トップから再生', async ({ page }) => {
    await gotoWithFakeYT(page);
    await page.locator('#work-source').selectOption('youtube');
    await fillRow(page, 0, URL_A);
    await fillRow(page, 1, URL_B);
    await fillRow(page, 2, URL_C);
    await page.locator('#start-btn').click();
    await page.waitForTimeout(50);
    await page.evaluate(() => { window.__ytCalls = []; });

    // 2 番目を先頭へ (A,B,C -> B,A,C)。先頭が A->B に変化
    await reorder(page, 1, 0);
    await page.waitForTimeout(100);
    const calls = await ytCalls(page);
    // resetPosition 後の play() は currentVideoId=null から新規 → 既存 player があるので
    // loadVideoById(B) になるはず
    const loadedB = calls.find((c) => (c.type === 'loadVideoById' || c.type === 'new') && c.videoId === ID_B);
    expect(loadedB, '先頭変化で B へ切替わる').toBeTruthy();
  });
});

test.describe('探索: 10 秒進捗保存と復帰', () => {
  test('保存済み progress があると初回生成時 start に反映、別動画切替は loadVideoById({startSeconds})', async ({ page }) => {
    await gotoWithFakeYT(page, {
      localStorage: {
        pomodoro_youtube_progress: JSON.stringify({ [ID_A]: 123, [ID_B]: 45 }),
      },
    });
    await page.locator('#work-source').selectOption('youtube');
    await fillRow(page, 0, URL_A);
    await fillRow(page, 1, URL_B);
    await page.locator('#start-btn').click();
    await page.waitForTimeout(50);
    let calls = await ytCalls(page);
    const firstNew = calls.find((c) => c.type === 'new');
    expect(firstNew.videoId).toBe(ID_A);
    expect(firstNew.start, 'A は保存位置 123 から開始').toBe(123);

    // 別動画 B へ手動で切替: 先頭を B にする並び替えで loadVideoById({videoId:B,start:45})
    await page.evaluate(() => { window.__ytCalls = []; });
    await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#youtube-url-list .yt-url-row')];
      const from = rows[1];
      const dt = new DataTransfer();
      from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      const container = document.getElementById('youtube-url-list');
      container.insertBefore(from, rows[0]);
      from.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    });
    await page.waitForTimeout(100);
    calls = await ytCalls(page);
    const loadB = calls.find((c) => c.type === 'loadVideoById' && c.videoId === ID_B);
    expect(loadB, 'B へ loadVideoById').toBeTruthy();
    expect(loadB.start, 'B は保存位置 45 から').toBe(45);
  });

  test('ENDED で該当 videoId の保存が破棄される', async ({ page }) => {
    await gotoWithFakeYT(page, {
      localStorage: { pomodoro_youtube_progress: JSON.stringify({ [ID_A]: 99 }) },
    });
    await page.locator('#work-source').selectOption('youtube');
    await fillRow(page, 0, URL_A);
    await fillRow(page, 1, URL_B);
    await page.locator('#start-btn').click();
    await page.waitForTimeout(50);
    // A を ENDED させる
    await page.evaluate(() => window.__fireEnded());
    await page.waitForTimeout(50);
    const progress = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('pomodoro_youtube_progress') || '{}'); } catch (_) { return {}; }
    });
    expect(progress[ID_A], 'A の保存は破棄').toBeUndefined();
  });
});

test.describe('探索: 永続化フォーマットと空行', () => {
  test('空 URL 行は youtubeUrls に保存されない (末尾空欄を含めても)', async ({ page }) => {
    await gotoWithFakeYT(page);
    await fillRow(page, 0, URL_A);
    await page.waitForTimeout(50);
    const s = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), AUDIO_KEY);
    expect(s.youtubeUrls.length).toBe(1);
    expect(s.youtubeUrls[0]).toEqual({ url: URL_A, study: false });
  });

  test('新形式 {url,study} 配列はそのまま url と study を復元する', async ({ page }) => {
    await gotoWithFakeYT(page, {
      localStorage: {
        [AUDIO_KEY]: JSON.stringify({
          workSource: 'youtube',
          youtubeMode: 'study',
          youtubeUrls: [{ url: URL_A, study: true }, { url: URL_B, study: false }],
        }),
      },
    });
    await expect(page.locator('#youtube-url-list .yt-url-row')).toHaveCount(3); // 2 + 末尾空欄
    await expect(page.locator('#yt-mode-study')).toBeChecked();
    await expect(page.locator('#youtube-url-list .yt-study-check').nth(0)).toBeChecked();
    await expect(page.locator('#youtube-url-list .yt-study-check').nth(1)).not.toBeChecked();
  });

  test('旧単一文字列 youtubeUrl も移行復元される', async ({ page }) => {
    await gotoWithFakeYT(page, {
      localStorage: { [AUDIO_KEY]: JSON.stringify({ workSource: 'youtube', youtubeUrl: URL_C }) },
    });
    const inputs = page.locator('#youtube-url-list .yt-url-row input[type="url"]');
    await expect(inputs.nth(0)).toHaveValue(URL_C);
  });
});

test.describe('探索: console / pageerror 監視 (新フロー)', () => {
  test('モード切替・並び替え・ENDED の一連でエラーが出ない', async ({ page }) => {
    const errors = [];
    // 既存スイートと同様、ブロックした外部依存由来のリソース失敗ノイズは除外。
    const isBlockedNoise = (t) => /Failed to load resource|net::ERR_FAILED|ERR_BLOCKED/.test(t);
    page.on('console', (m) => { if (m.type() === 'error' && !isBlockedNoise(m.text())) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${String(e)}`));
    await gotoWithFakeYT(page);
    await page.locator('#work-source').selectOption('youtube');
    await fillRow(page, 0, URL_A);
    await fillRow(page, 1, URL_B);
    await page.locator('#youtube-url-list .yt-url-row').nth(0).locator('.yt-study-check').check();
    await page.locator('#start-btn').click();
    await page.waitForTimeout(50);
    await page.locator('label[for="yt-mode-study"]').click();
    await page.waitForTimeout(450);
    await page.locator('label[for="yt-mode-work"]').click();
    await page.waitForTimeout(450);
    await page.evaluate(() => window.__fireEnded());
    await page.waitForTimeout(100);
    await page.locator('#reset-btn').click();
    // [YouTubeManager] No valid videos の warn は error ではないため対象外
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

test.describe('探索: 空キュー→対象復活のリカバリ', () => {
  test('study で対象空(pause)→work へ戻すと再生が復帰する', async ({ page }) => {
    await page.route('**/*', (route) => {
      const u = route.request().url();
      if (/googletagmanager|google-analytics|youtube.com\/iframe_api|img.youtube|i.ytimg|voicy.jp/.test(u)) return route.abort();
      return route.continue();
    });
    await page.addInitScript(() => { try { localStorage.setItem('pomodoro_yt_ext_dismissed','true'); } catch(_){} });
    await page.addInitScript(() => {
      window.__ytCalls = [];
      function P(elId, cfg){ this._v=cfg&&cfg.videoId; this._cfg=cfg; window.__ytCalls.push({type:'new',videoId:this._v,start:cfg&&cfg.playerVars&&cfg.playerVars.start}); setTimeout(()=>{try{cfg.events&&cfg.events.onReady&&cfg.events.onReady({target:this});}catch(_){} },0); }
      P.prototype.playVideo=function(){ window.__ytCalls.push({type:'playVideo',videoId:this._v}); };
      P.prototype.pauseVideo=function(){ window.__ytCalls.push({type:'pauseVideo',videoId:this._v}); };
      P.prototype.loadVideoById=function(a){ if(typeof a==='object'){this._v=a.videoId; window.__ytCalls.push({type:'loadVideoById',videoId:a.videoId,start:a.startSeconds});} else {this._v=a; window.__ytCalls.push({type:'loadVideoById',videoId:a});} };
      P.prototype.getCurrentTime=function(){ return 0; };
      window.YT={ Player:P, PlayerState:{ENDED:0} };
    });
    await page.goto('/index.html');
    await expect(page.locator('#timer')).toHaveText(/^\d{2}:\d{2}$/);

    await page.locator('#work-source').selectOption('youtube');
    await page.locator('#youtube-url-list .yt-url-row input[type="url"]').nth(0).fill('https://www.youtube.com/watch?v=aaaaaaaaaaa');
    await page.locator('#start-btn').click();
    await page.waitForTimeout(50);
    // study へ: 対象0 → pause
    await page.locator('label[for="yt-mode-study"]').click();
    await page.waitForTimeout(450);
    await page.evaluate(() => { window.__ytCalls = []; });
    // work へ戻す → 対象復活で playVideo/loadVideoById いずれかで再生再開
    await page.locator('label[for="yt-mode-work"]').click();
    await page.waitForTimeout(450);
    const calls = await page.evaluate(() => window.__ytCalls);
    const resumed = calls.find((c) => c.type === 'playVideo' || c.type === 'loadVideoById' || c.type === 'new');
    expect(resumed, 'work へ戻すと再生が復帰する').toBeTruthy();
  });
});
