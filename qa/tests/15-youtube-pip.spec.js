// YouTube のワイプ表示 (Document Picture-in-Picture) の検証。
//  - 対応ブラウザでのみ「ワイプで表示」ボタンを出す
//  - 小窓は「表示だけ」: 再生 (音・キュー・一時停止) はメインのプレイヤーのまま、
//    小窓 (pip.html) にはミュートのプレイヤーを置いてメイン側に追従させる
//    (動画の差し替え・再生/一時停止・位置ずれの補正)
//  - 小窓を閉じてもメイン側の再生には影響しない
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
  Player.prototype.seekTo = function (t) { this.t = t; this.calls.push('seek:' + Math.floor(t)); };
  Player.prototype.getVideoData = function () { return { video_id: this.videoId }; };
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

  test('ボタンで小窓を開く: メインは再生を続け、小窓はミュート・操作不可で同じ位置を表示', async ({ page }) => {
    await setupYouTubePlaying(page);
    const btn = page.locator('#yt-pip-btn');
    await expect(btn).toBeVisible();
    await btn.click();

    await expect.poll(async () => (await pipPlayer(page))?.state).toBe(1);
    const pip = await pipPlayer(page);
    expect(pip.videoId).toBe(ID_A);
    expect(pip.start).toBe(42);
    const vars = await page.evaluate(() => window.__ytPlayers.find((x) => x.inPip).opts.playerVars);
    expect(vars.mute).toBe(1);
    expect(vars.controls).toBe(0);
    // 小窓は同一オリジンの pip.html を読み込み (about:blank 直埋めはエラー 153)、クリックは受け付けない
    const frame = await page.evaluate(() => {
      const f = window.documentPictureInPicture.window.document.querySelector('iframe');
      return { src: f.src, pe: window.documentPictureInPicture.window.getComputedStyle(f).pointerEvents };
    });
    expect(frame.src).toMatch(/\/pip\.html$/);
    expect(frame.pe).toBe('none');
    // メインは止めずに再生し続ける (再生の主体はメイン)
    const main = await mainPlayer(page);
    expect(main.state).toBe(1);
    expect(main.calls).not.toContain('pause');
    await expect(btn).toHaveText('ワイプを閉じる');

    // 閉じてもメインはそのまま (読み込み直し・一時停止しない)
    await btn.click();
    await expect(btn).toHaveText('ワイプで表示');
    await expect(page.locator('#__fake-pip')).toHaveCount(0);
    const after = await mainPlayer(page);
    expect(after.state).toBe(1);
    expect(after.calls.filter((c) => c.startsWith('load:') || c.startsWith('cue:'))).toEqual(main.calls.filter((c) => c.startsWith('load:') || c.startsWith('cue:')));
  });

  test('小窓はメインに追従する: 一時停止・再開・位置ずれ・次の動画', async ({ page }) => {
    await setupYouTubePlaying(page);
    await page.click('#yt-pip-btn');
    await expect.poll(async () => (await pipPlayer(page))?.state).toBe(1);

    // タイマーの一時停止 → メインが止まり、小窓も止まる
    await page.click('#pause-btn');
    await expect.poll(async () => (await mainPlayer(page)).state).toBe(2);
    await expect.poll(async () => (await pipPlayer(page)).state).toBe(2);
    await page.click('#restart-btn');
    await expect.poll(async () => (await pipPlayer(page)).state).toBe(1);

    // メインが先へ進んだ (ずれ > 1.5 秒) → 小窓が seek して合わせる
    await page.evaluate(() => { window.__ytPlayers[0].t = 120; });
    await expect.poll(async () => (await pipPlayer(page)).t).toBe(120);

    // メインで動画 A が終了 → メインが B へ進み、小窓も B を表示
    await page.evaluate(() => window.__ytPlayers[0]._set(0));
    await expect.poll(async () => (await mainPlayer(page)).videoId).toBe(ID_B);
    await expect.poll(async () => (await pipPlayer(page)).videoId).toBe(ID_B);
    await expect(page.locator('#youtube-url-list input[type="url"]').first()).toHaveValue(URL_B);

    // 小窓側の終了イベントはキューを動かさない (再生の主体はメイン)
    const before = (await mainPlayer(page)).calls.length;
    await page.evaluate(() => window.__ytPlayers.find((x) => x.inPip)._set(0));
    await page.waitForTimeout(300);
    expect((await mainPlayer(page)).videoId).toBe(ID_B);
    expect((await mainPlayer(page)).calls.length).toBe(before);
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

    // 開ける場合 → 自動で開き、戻ると閉じる。メインは再生しっぱなし
    await page.evaluate(() => { window.__pipAllow = true; });
    await setVisibility('hidden');
    await expect.poll(async () => (await pipPlayer(page))?.state).toBe(1);
    await setVisibility('visible');
    await expect(page.locator('#__fake-pip')).toHaveCount(0);
    expect((await mainPlayer(page)).state).toBe(1);
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
