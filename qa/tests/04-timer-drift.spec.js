// 実時刻ベースのカウントダウン (ドリフト解消) の検証。
//
// 修正背景: 旧実装は setInterval の tick 回数を経過秒数として time を 1 ずつ減算
// していたため、バックグラウンドタブで setInterval が間引かれると tick 回数 < 実経過秒数
// となりタイマーが実時計より遅れた (ユーザー報告: 「時計は3分進むのにタイマーは2分」)。
//
// 新実装: endTime = Date.now() + time*1000 を確定し、timer() は毎 tick
//   remaining = ceil((endTime - Date.now())/1000) を再計算する。
//
// 本 spec は Playwright Clock API で「実時刻 (Date.now)」と「タイマー tick (setInterval)」
// を分離して制御し、tick が間引かれても表示残り時間が実経過に追従することを検証する。
//
// 重要: page.clock.install() は page.goto より前 (= addInitScript フェーズ) に
// 行う必要があるため、共通の gotoApp は使わず、各テストで明示的に install してから
// fixtures の route ブロックと localStorage seed を再現する。

import { test, expect } from './fixtures.js';

const NOISE_HOSTS = [
  'googletagmanager.com',
  'google-analytics.com',
  'www.youtube.com/iframe_api',
  'img.youtube.com',
  'i.ytimg.com',
  'voicy.jp',
];

// Clock を固定時刻でインストールしてから index.html を開く。
async function gotoAppWithClock(page, opts = {}) {
  const { dismissExtModal = true, localStorage: ls = {} } = opts;

  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (NOISE_HOSTS.some((h) => url.includes(h))) return route.abort();
    return route.continue();
  });

  const seed = { ...ls };
  if (dismissExtModal) seed['pomodoro_yt_ext_dismissed'] = 'true';
  await page.addInitScript((entries) => {
    try {
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    } catch (_) {}
  }, seed);

  // 固定起点。Date.now()/performance.now()/setInterval すべてが Clock 制御下に入る。
  await page.clock.install({ time: new Date('2026-06-01T09:00:00.000Z') });
  await page.goto('/index.html');
  await expect(page.locator('#timer')).toHaveText(/^\d{2}:\d{2}$/);
}

// mm:ss を秒に変換
function toSeconds(text) {
  const [m, s] = text.split(':').map((n) => parseInt(n, 10));
  return m * 60 + s;
}

// Clock 注記:
//   page.clock.fastForward(ms) は「ms 進めて保留タイマーを発火」させるが、その後は
//   実時間レートで時刻が進み続ける (frozen ではない)。残り時間の "厳密な値" を
//   アサートしたい箇所では、CPU 負荷で実時間が経過すると Date.now() が進み表示が
//   ずれてフレーキーになる。そこで、残り時間スナップショットの検証には
//   page.clock.pauseAt(date) で時刻を凍結し、その瞬間の表示を読む方式に統一する。
//   (フェーズ遷移後の #status は一度遷移すれば値が安定するので fastForward で可。)
//
// pauseTo(page, baseMs, deltaMs): start クリック時刻 baseMs から deltaMs 経過した
//   時点で Date.now を凍結し、保留タイマーを発火させて表示を確定させる。
async function pauseTo(page, baseMs, deltaMs) {
  await page.clock.pauseAt(new Date(baseMs + deltaMs));
}

test.describe('タイマー: 実時刻ベースのカウントダウン (ドリフト解消)', () => {
  test('実時刻が進んだ分だけ残り時間が減る (10秒・60秒)', async ({ page }) => {
    await gotoAppWithClock(page);
    await expect(page.locator('#timer')).toHaveText('25:00');

    await page.locator('#start-btn').click();
    await expect(page.locator('#status')).toHaveText('作業中');
    await expect(page.locator('#timer')).toHaveText('25:00');
    const base = await page.evaluate(() => Date.now());

    // 実時刻を 10 秒進めた時点で凍結 → 表示を確定して読む
    await pauseTo(page, base, 10_000);
    await expect(page.locator('#timer')).toHaveText('24:50');

    await pauseTo(page, base, 60_000); // 計 60 秒
    await expect(page.locator('#timer')).toHaveText('24:00');
  });

  test('[ドリフト核心] tick が間引かれても実経過に追従して飛ぶ (90秒一気に進める)', async ({ page }) => {
    await gotoAppWithClock(page);
    await page.locator('#start-btn').click();
    await expect(page.locator('#timer')).toHaveText('25:00');
    const base = await page.evaluate(() => Date.now());

    // start から +90 秒の時点で時刻を凍結。
    // 旧実装は tick 回数で減算するため、tick が間引かれると 24:59 に取り残されたはず。
    // 新実装は endTime 基準なので 90 秒ぶん飛んで 23:30 になるべき。
    await pauseTo(page, base, 90_000);

    await expect(page.locator('#timer')).toHaveText('23:30');
    // 「24:xx に取り残されていない」ことを明示確認
    const secs = toSeconds(await page.locator('#timer').textContent());
    expect(secs).toBe(25 * 60 - 90);
  });

  test('複数段階で時刻を進めてもズレが累積しない', async ({ page }) => {
    await gotoAppWithClock(page);
    await page.locator('#start-btn').click();
    const base = await page.evaluate(() => Date.now());

    await pauseTo(page, base, 30_000);  // 24:30
    await expect(page.locator('#timer')).toHaveText('24:30');
    await pauseTo(page, base, 105_000); // 23:15
    await expect(page.locator('#timer')).toHaveText('23:15');
    await pauseTo(page, base, 225_000); // 21:15
    await expect(page.locator('#timer')).toHaveText('21:15');

    // 累積誤差なし: 始点からの絶対経過で残りが決まる (前段の端数を引き継がない)
    const secs = toSeconds(await page.locator('#timer').textContent());
    expect(secs).toBe(25 * 60 - 225);
  });
});

test.describe('タイマー: 0 到達でフェーズ遷移', () => {
  test('作業時間を一気に進めると休憩へ遷移する (cycle1: 4の倍数でないので休憩)', async ({ page }) => {
    await gotoAppWithClock(page);
    await page.locator('#start-btn').click();
    await expect(page.locator('#status')).toHaveText('作業中');
    await expect(page.locator('#cycles')).toHaveText('1');
    const base = await page.evaluate(() => Date.now());

    // 作業 25 分 (1500秒) ちょうどで凍結 → 休憩へ遷移
    await pauseTo(page, base, 1500_000);
    await expect(page.locator('#status')).toHaveText('休憩中');
    // 休憩タイマーは 5 分から開始 (時刻凍結中なので表示も安定)
    await expect(page.locator('#timer')).toHaveText('05:00');
  });

  test('作業 → 休憩 → 作業 を実時刻ですべて遷移できる', async ({ page }) => {
    await gotoAppWithClock(page);
    await page.locator('#start-btn').click();
    await expect(page.locator('#status')).toHaveText('作業中');

    await page.clock.fastForward('25:00'); // 作業終了
    await expect(page.locator('#status')).toHaveText('休憩中');

    await page.clock.fastForward('05:00'); // 休憩終了
    await expect(page.locator('#status')).toHaveText('作業中');
    // 休憩→作業の遷移では cycles がカウントアップ (POSE 復帰ではないため)
    await expect(page.locator('#cycles')).toHaveText('2');
  });

  test('遷移直前 (残り1秒) は 00:01 表示、ちょうどで遷移', async ({ page }) => {
    await gotoAppWithClock(page);
    await page.locator('#start-btn').click();
    const base = await page.evaluate(() => Date.now());

    // 1499 秒で凍結 → 残り 1 秒 (00:01)
    await pauseTo(page, base, 1499_000);
    await expect(page.locator('#timer')).toHaveText('00:01');
    await expect(page.locator('#status')).toHaveText('作業中');

    // 残り 1 秒を消化 → 遷移
    await page.clock.fastForward(1_000);
    await expect(page.locator('#status')).toHaveText('休憩中');
  });
});

test.describe('タイマー: スキップは実時刻に依存せず即時遷移', () => {
  test('Clock 下でも skip で即座に次フェーズへ', async ({ page }) => {
    await gotoAppWithClock(page);
    await page.locator('#start-btn').click();
    await expect(page.locator('#status')).toHaveText('作業中');

    // 時刻を進めずに skip → 即遷移。表示値は遷移直後の 1 回読みで確認
    // (real-time tick による減算が入る前に読む。状態テキストはそのまま安定)。
    await page.locator('#skip-btn').click();
    await expect(page.locator('#status')).toHaveText('休憩中');
    expect(await page.locator('#timer').textContent()).toBe('05:00');

    await page.locator('#skip-btn').click();
    await expect(page.locator('#status')).toHaveText('作業中');
    expect(await page.locator('#timer').textContent()).toBe('25:00');
  });
});

test.describe('タイマー: 一時停止 → 再開で残り時間を保持', () => {
  test('一時停止中は実時刻が進んでも残り時間が減らず、再開後そこから継続', async ({ page }) => {
    await gotoAppWithClock(page);
    await page.locator('#start-btn').click();
    const base = await page.evaluate(() => Date.now());

    await pauseTo(page, base, 100_000); // 23:20 で凍結
    await expect(page.locator('#timer')).toHaveText('23:20');

    await page.locator('#pause-btn').click();
    await expect(page.locator('#status')).toHaveText('一時停止中');

    // 一時停止中に実時刻を大きく進めても残り時間は据え置きであるべき
    // (pause で MutationObserver が clearInterval、timer も走らないため不変)
    await page.clock.pauseAt(new Date(base + 100_000 + 300_000)); // +5 分
    await page.waitForTimeout(50);
    await expect(page.locator('#timer')).toHaveText('23:20');

    // 再開: cycles は増えない (POSE 復帰)。restart 時点 (= base+400s) で endTime が
    // 再計算され、残り 23:20 (1400秒) から再カウントされる。
    const resumeAt = base + 400_000;
    await page.locator('#restart-btn').click();
    await expect(page.locator('#status')).toHaveText('作業中');
    await expect(page.locator('#cycles')).toHaveText('1');

    // 再開後 20 秒で凍結 → 残り 23:00
    await page.clock.pauseAt(new Date(resumeAt + 20_000));
    await expect(page.locator('#timer')).toHaveText('23:00');
  });
});

test.describe('タイマー: タブ復帰 (visibilitychange) で残り時間を即再同期', () => {
  test('非表示中に進んだ実時刻が、可視化時の timer() 即時実行で補正される', async ({ page }) => {
    await gotoAppWithClock(page);
    await page.locator('#start-btn').click();
    await expect(page.locator('#timer')).toHaveText('25:00');

    // タブ起動からタイマー開始までに消費される仮想時間 (端数ミリ秒) は run ごとに揺れるため、
    // 絶対時刻ではなく「start クリック時点の Date.now() からの相対オフセット」で時刻を進めて
    // アサートを決定論的にする (絶対時刻だと ceil の端数で 21:40/21:41 が揺れフレーキーになる)。
    const tAfterStart = await page.evaluate(() => Date.now());

    // タブを hidden にし、tick を一切発火させずに実時刻だけ進める状況を作る。
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // hidden 中に Clock の Date.now を「start から +200 秒ちょうど」へ飛ばす。
    // setSystemTime は時刻だけを動かし保留タイマーを発火させない (= バックグラウンドで
    // setInterval が間引かれ、表示更新が走っていない状態の再現)。
    // ※ pauseAt は移動中に保留タイマーを発火してしまい「表示が古いまま」の前提を壊すため不可。
    await page.clock.setSystemTime(new Date(tAfterStart + 200_000));

    // この時点では timer() が呼ばれていない (hidden + tick 抑制) ので表示は古い 25:00 のまま。
    const beforeVisible = await page.locator('#timer').textContent();
    expect(beforeVisible).toBe('25:00'); // resync テストが空振りでないことを担保

    // 可視化 → visibilitychange ハンドラが isPlayingState() && visible で timer() を即時実行。
    // 戻り値で「visibilitychange 同期処理直後の表示」を取得し、その場で確定値を読む
    // (toHaveText の poll 中に real-time tick が入って 21:39 へ進むのを避ける)。
    const afterVisible = await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
      return document.getElementById('timer').textContent;
    });

    // 復帰直後に残り時間が実経過 (200秒ちょうど) ぶん補正される: 25:00 - 200s = 21:40
    expect(afterVisible).toBe('21:40');
    test.info().annotations.push({
      type: 'resync',
      description: `hidden中表示=${beforeVisible} → 可視化後=${afterVisible}`,
    });
  });
});

test.describe('UX: Clock 下の一連操作で console エラーが出ない', () => {
  test('start→fastForward(遷移)→skip→pause→restart→reset でエラーなし', async ({ page }) => {
    const errors = [];
    const isBlockedNoise = (t) => /Failed to load resource|net::ERR_FAILED|ERR_BLOCKED/.test(t);
    page.on('console', (m) => m.type() === 'error' && !isBlockedNoise(m.text()) && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

    await gotoAppWithClock(page);
    await page.locator('#start-btn').click();
    await page.clock.fastForward('25:00'); // 作業→休憩
    await expect(page.locator('#status')).toHaveText('休憩中');
    await page.locator('#skip-btn').click(); // 休憩→作業
    await page.locator('#pause-btn').click();
    await page.locator('#restart-btn').click();
    await page.locator('#reset-btn').click();
    await expect(page.locator('#status')).toHaveText('待機中');

    expect(errors, errors.join('\n')).toEqual([]);
  });
});
