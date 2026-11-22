// YouTube のワイプ表示 (Document Picture-in-Picture) の検証。
//  - 対応ブラウザでのみ「ワイプで表示」ボタンを出す
//  - ボタンで小窓 (pip.html) を開き、メインを一時停止して同じ動画を続きから再生する
//  - 小窓が開いている間の一時停止・動画終了→次の動画は小窓側に効く
//  - 小窓を閉じると小窓の再生位置からメイン側で再開する
//  - タブ切替 (hidden) で自動で開いた小窓は、タブに戻ると閉じる
// 実 YouTube / 実 PiP は使えないため、iframe_api をフェイクに差し替え、
// documentPictureInPicture.requestWindow は「ページ内の about:blank iframe の window を返す」
// スタブにする (小窓の中で pip.html が読み込まれ、そこでフェイク YT.Player が作られる)。
import { test, expect, gotoApp } from './fixtures.js';

const ID_A = 'aaaaaaaaaaa';
const ID_B = 'bbbbbbbbbbb';
const URL_A = `https://www.youtube.com/watch?v=${ID_A}`;
const URL_B = `https://www.youtube.com/watch?v=${ID_B}`;

// フェイク IFrame API。どのフレームで読み込まれても、作られたプレイヤーを top.__ytPlayers に集める。
const FAKE_IFRAME_API = `
(function () {
  var top = window.top;
  top.__ytPlayers = top.__ytPlayers || [];
  function Player(el, opts) {
    this.opts = opts || {};
    this.inPip = window !== top;
    this.videoId = this.opts.videoId || null;
    var pv = this.opts.playerVars || {};
    this.t = pv.start || 0;
    this.state = -1;
    this.calls = [];
    this.volume = 100; this.muted = false;
    top.__ytPlayers.push(this);
    var self = this;
    setTimeout(function () { var ev = self.opts.events || {}; ev.onReady && ev.onReady({ target: self }); }, 0);
  }
  Player.prototype._set = function (s) { this.state = s; var ev = this.opts.events || {}; ev.onStateChange && ev.onStateChange({ data: s, target: this }); };
  Player.prototype.playVideo = function () { this.calls.push('play'); this._set(1); };
  Player.prototype.pauseVideo = function () { this.calls.push('pause'); this._set(2); };
  Player.prototype.loadVideoById = function (a) {
    var o = typeof a === 'object' ? a : { videoId: a };
    this.videoId = o.videoId; this.t = o.startSeconds || 0; this.calls.push('load:' + o.videoId + '@' + Math.floor(this.t)); this._set(1);
  };
  Player.prototype.cueVideoById = function (a) {
    var o = typeof a === 'object' ? a : { videoId: a };
    this.videoId = o.videoId; this.t = o.startSeconds || 0; this.calls.push('cue:' + o.videoId + '@' + Math.floor(this.t)); this._set(5);
  };
  Player.prototype.getCurrentTime = function () { return this.t; };
  Player.prototype.getPlayerState = function () { return this.state; };
  Player.prototype.getDuration = function () { return 300; };
  Player.prototype.getVolume = function () { return this.volume; };
  Player.prototype.setVolume = function (v) { this.volume = v; };
  Player.prototype.isMuted = function () { return this.muted; };
  Player.prototype.mute = function () { this.muted = true; };
  Player.prototype.destroy = function () { this.calls.push('destroy'); };
  window.YT = { Player: Player, PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2 } };
  setTimeout(function () { window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady(); }, 0);
})();
`;

// documentPictureInPicture のスタブ。requestWindow はページ内 iframe の window を返す。
function stubDocumentPip() {
  window.__pipRequests = 0;
  window.__pipAllow = true; // false にすると「ユーザー操作なし」として拒否
  // 実 Chromium は documentPictureInPicture を読み取り専用で持つので defineProperty で上書きする
  const stub = {
    window: null,
    async requestWindow() {
      window.__pipRequests++;
      if (!window.__pipAllow) throw new DOMException('no user activation', 'NotAllowedError');
      const f = document.createElement('iframe');
      f.id = '__fake-pip';
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:320px;height:180px;z-index:99999';
      document.body.appendChild(f);
      const w = f.contentWindow;
      // 実 PiP の close() 相当: pagehide を出してから消す
      w.close = () => { try { w.dispatchEvent(new Event('pagehide')); } catch (_) {} f.remove(); };
      this.window = w;
      return w;
    },
  };
  Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: stub });
}

async function setupYouTubePlaying(page) {
  await page.addInitScript(stubDocumentPip);
  await gotoApp(page, {
    localStorage: {
      pomodoro_audio_source_settings: JSON.stringify({
        workSource: 'youtube',
        youtubeUrls: [{ url: URL_A, study: false }, { url: URL_B, study: false }],
      }),
    },
  });
  await page.route('**/iframe_api*', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: FAKE_IFRAME_API }));
  await page.click('#start-btn');
  await expect.poll(() => page.evaluate(() => (window.__ytPlayers || []).length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__ytPlayers[0].state)).toBe(1);
  // 再生位置 42 秒まで進んだことにする
  await page.evaluate(() => { window.__ytPlayers[0].t = 42; });
}

const pipPlayer = (page) => page.evaluate(() => {
  const p = (window.__ytPlayers || []).find((x) => x.inPip);
  return p ? { videoId: p.videoId, t: p.t, state: p.state, start: p.opts.playerVars.start, calls: p.calls } : null;
});
const mainPlayer = (page) => page.evaluate(() => {
  const p = window.__ytPlayers[0];
  return { videoId: p.videoId, t: p.t, state: p.state, calls: p.calls };
});

test.describe('YouTube ワイプ表示 (Document PiP)', () => {
  test('非対応ブラウザではワイプボタンを出さない', async ({ page }) => {
    await page.addInitScript(() => { delete window.documentPictureInPicture; });
    await gotoApp(page);
    await page.selectOption('#work-source', 'youtube');
    await expect(page.locator('#yt-pip-btn')).toBeHidden();
  });

  test('ボタンで小窓を開き、メインを止めて続きから再生 → 閉じるとメインで続きから再開', async ({ page }) => {
    await setupYouTubePlaying(page);
    const btn = page.locator('#yt-pip-btn');
    await expect(btn).toBeVisible();
    await btn.click();
    await expect.poll(() => pipPlayer(page)).not.toBeNull();
    await expect.poll(async () => (await pipPlayer(page)).state).toBe(1);
    const pip = await pipPlayer(page);
    expect(pip.videoId).toBe(ID_A);
    expect(pip.start).toBe(42);
    // 小窓は同一オリジンの pip.html を読み込んでいる (about:blank 直埋めはエラー 153 になるため)
    const src = await page.evaluate(() => window.documentPictureInPicture.window.document.querySelector('iframe').src);
    expect(src).toMatch(/\/pip\.html$/);
    // メインは一時停止
    expect((await mainPlayer(page)).state).toBe(2);
    await expect(btn).toHaveText('ワイプを閉じる');

    // 小窓で 100 秒まで進めてから閉じる
    await page.evaluate(() => { window.__ytPlayers.find((x) => x.inPip).t = 100; });
    await btn.click();
    await expect(btn).toHaveText('ワイプで表示');
    await expect(page.locator('#__fake-pip')).toHaveCount(0);
    const main = await mainPlayer(page);
    expect(main.calls).toContain(`load:${ID_A}@100`);
    expect(main.state).toBe(1);
  });

  test('小窓表示中の一時停止・動画終了は小窓側に効き、次の動画へ進む', async ({ page }) => {
    await setupYouTubePlaying(page);
    await page.click('#yt-pip-btn');
    await expect.poll(async () => (await pipPlayer(page))?.state).toBe(1);

    // タイマーの一時停止 → 小窓側が止まる
    await page.click('#pause-btn');
    await expect.poll(async () => (await pipPlayer(page)).state).toBe(2);
    await page.click('#restart-btn');
    await expect.poll(async () => (await pipPlayer(page)).state).toBe(1);

    // 小窓で動画 A が終了 → 小窓で B を読み込み、一覧から A が消える
    await page.evaluate(() => window.__ytPlayers.find((x) => x.inPip)._set(0));
    await expect.poll(async () => (await pipPlayer(page)).videoId).toBe(ID_B);
    await expect(page.locator('#youtube-url-list input[type="url"]').first()).toHaveValue(URL_B);

    // 小窓を × で閉じた (pagehide) → メインは B の続きから
    await page.evaluate(() => { window.__ytPlayers.find((x) => x.inPip).t = 7; window.documentPictureInPicture.window.close(); });
    await expect.poll(async () => (await mainPlayer(page)).calls).toContain(`load:${ID_B}@7`);
  });

  test('タブ切替で自動表示した小窓はタブに戻ると閉じる / 操作なしで開けない場合は何もしない', async ({ page }) => {
    await setupYouTubePlaying(page);
    const setVisibility = (state) => page.evaluate((s) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);

    // ユーザー操作なし扱い → requestWindow は拒否され、メインは再生を続ける
    await page.evaluate(() => { window.__pipAllow = false; });
    await setVisibility('hidden');
    await expect.poll(() => page.evaluate(() => window.__pipRequests)).toBe(1);
    expect((await mainPlayer(page)).state).toBe(1);
    expect(await pipPlayer(page)).toBeNull();
    await setVisibility('visible');

    // 開ける場合 → 自動で開き、戻ると閉じてメインで続きから
    await page.evaluate(() => { window.__pipAllow = true; });
    await setVisibility('hidden');
    await expect.poll(async () => (await pipPlayer(page))?.state).toBe(1);
    await page.evaluate(() => { window.__ytPlayers.find((x) => x.inPip).t = 55; });
    await setVisibility('visible');
    await expect(page.locator('#__fake-pip')).toHaveCount(0);
    expect((await mainPlayer(page)).calls).toContain(`load:${ID_A}@55`);
  });

  test('ボタンで開いた小窓はタブに戻っても閉じない', async ({ page }) => {
    await setupYouTubePlaying(page);
    await page.click('#yt-pip-btn');
    await expect.poll(async () => (await pipPlayer(page))?.state).toBe(1);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.locator('#__fake-pip')).toHaveCount(1);
  });
});
