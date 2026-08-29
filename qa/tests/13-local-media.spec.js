// ローカルファイル（音源 / 動画）の再生リストの検証。
//
// 仕様（2026-08-29 追加）:
//  - 音源設定に「ローカルファイル (音源・動画)」を追加（作業中 / 休憩中の両方）。
//  - ファイルはユーザーが選ぶ（https のページからパス文字列では読めないため）。
//    File System Access API があれば showOpenFilePicker、無ければ <input type="file">。
//  - 一覧は上から順が再生順。ドラッグで並び替え、行ごとに削除できる。
//  - 再生は「ロケットえんぴつ式」= 常に先頭を再生し、1 本終わったらその行を末尾へ回す。
//  - 拡張子 / MIME で音源と動画を出し分ける（<audio> / <video>）。
//
// 決定論化:
//  - <input type="file"> 経路に setInputFiles でダミーを流し込む（実ファイル不要）。
//  - 実際の再生（play()）はヘッドレスでは走らないが、src の設定と ended の扱いは検証できる。
//    ended は JS から dispatchEvent して「終わったあと」を再現する。
import { test, expect, gotoApp } from './fixtures.js';

const AUDIO_FILE = { name: 'track-a.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from([0xff, 0xfb, 0x90, 0x00]) };
const AUDIO_FILE_2 = { name: 'track-b.m4a', mimeType: 'audio/mp4', buffer: Buffer.from([0x00, 0x00, 0x00, 0x18]) };
const VIDEO_FILE = { name: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.from([0x00, 0x00, 0x00, 0x18]) };

const rows = (page) => page.locator('.local-file-row');
const rowNames = (page) => rows(page).locator('span.flex-grow-1');

// 一覧の名前を上から順に配列で返す
const listedNames = async (page) => rowNames(page).allTextContents();

// LocalMediaManager が今つかんでいる項目 id
const currentId = (page) => page.evaluate(() => window.PomodoroTimer.__localState().currentId);
const queueIds = (page) => page.evaluate(() => window.PomodoroTimer.__localState().queueIds);

// 再生終了を再現する（表示中の要素に ended を投げる）
async function fireEnded(page) {
  await page.evaluate(() => {
    const st = window.PomodoroTimer.__localState();
    const el = document.getElementById(st.usingVideo ? 'localVideoPlayer' : 'localAudioPlayer');
    el.dispatchEvent(new Event('ended'));
  });
}

// ---------------------------------------------------------------------------
test.describe('ローカルファイル: 設定 UI', () => {
  test('作業中 / 休憩中の音源に「ローカルファイル」を選べる', async ({ page }) => {
    await gotoApp(page);
    for (const id of ['#work-source', '#break-source']) {
      await expect(page.locator(`${id} option[value="local"]`)).toHaveCount(1);
      await page.selectOption(id, 'local');
      await expect(page.locator(id)).toHaveValue('local');
    }
  });

  test('選んだ音源はリロード後も復元される', async ({ page }) => {
    await gotoApp(page);
    await page.selectOption('#work-source', 'local');
    await page.reload();
    await expect(page.locator('#timer')).toHaveText(/^\d{2}:\d{2}$/);
    await expect(page.locator('#work-source')).toHaveValue('local');
  });

  test('作業中に選ぶとローカル用の再生エリアが出る', async ({ page }) => {
    await gotoApp(page);
    await expect(page.locator('#localWrapper')).toBeHidden();
    await page.selectOption('#work-source', 'local');
    await expect(page.locator('#localWrapper')).toBeVisible();
    await expect(page.locator('#active-source-label')).toHaveText('ローカルファイル');
  });

  test('ファイルが無いうちは案内文が出る', async ({ page }) => {
    await gotoApp(page);
    await page.selectOption('#work-source', 'local');
    await expect(page.locator('#local-file-list')).toContainText('まだファイルがありません');
  });
});

// ---------------------------------------------------------------------------
test.describe('ローカルファイル: 一覧の管理', () => {
  // 設定は選んでいる音源の分だけ出るので、ローカルを選んでから一覧を触る
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await page.selectOption('#work-source', 'local');
  });

  test('複数ファイルを追加すると順番付きで一覧に並ぶ', async ({ page }) => {
    await page.locator('#local-file-input').setInputFiles([AUDIO_FILE, VIDEO_FILE]);

    await expect(rows(page)).toHaveCount(2);
    expect(await listedNames(page)).toEqual(['track-a.mp3', 'clip.mp4']);
    // 並び順の番号
    await expect(rows(page).nth(0).locator('.badge').first()).toHaveText('1');
    await expect(rows(page).nth(1).locator('.badge').first()).toHaveText('2');
  });

  test('音源と動画を種別バッジで見分けられる', async ({ page }) => {
    await page.locator('#local-file-input').setInputFiles([AUDIO_FILE, VIDEO_FILE]);

    await expect(rows(page).nth(0)).toContainText('音源');
    await expect(rows(page).nth(1)).toContainText('動画');
  });

  test('行ごとに削除できる', async ({ page }) => {
    await page.locator('#local-file-input').setInputFiles([AUDIO_FILE, AUDIO_FILE_2, VIDEO_FILE]);
    await expect(rows(page)).toHaveCount(3);

    await rows(page).nth(1).getByRole('button', { name: '削除' }).click();

    await expect(rows(page)).toHaveCount(2);
    expect(await listedNames(page)).toEqual(['track-a.mp3', 'clip.mp4']);
  });

  test('「すべて削除」で空になる', async ({ page }) => {
    await page.locator('#local-file-input').setInputFiles([AUDIO_FILE, VIDEO_FILE]);
    await expect(rows(page)).toHaveCount(2);

    await page.locator('#local-clear-btn').click();

    await expect(rows(page)).toHaveCount(0);
    await expect(page.locator('#local-file-list')).toContainText('まだファイルがありません');
  });

  test('ハンドルを保存できない経路では、その旨を伝える', async ({ page }) => {
    await page.locator('#local-file-input').setInputFiles([AUDIO_FILE]);
    await expect(page.locator('#local-file-note')).toContainText('次回まで覚えられません');
  });
});

// ---------------------------------------------------------------------------
test.describe('ローカルファイル: 再生と出し分け', () => {
  test('音源は <audio>、動画は <video> で再生する', async ({ page }) => {
    await gotoApp(page);
    await page.selectOption('#work-source', 'local');
    await page.locator('#local-file-input').setInputFiles([AUDIO_FILE, VIDEO_FILE]);
    await page.locator('#start-btn').click();

    // 先頭は音源
    await expect.poll(() => currentId(page)).not.toBeNull();
    await expect(page.locator('#localAudioPlayer')).toBeVisible();
    await expect(page.locator('#localVideoContainer')).toBeHidden();
    await expect.poll(() => page.locator('#localAudioPlayer').getAttribute('src')).toMatch(/^blob:/);
  });

  test('動画が先頭なら <video> 側に出る', async ({ page }) => {
    await gotoApp(page);
    await page.selectOption('#work-source', 'local');
    await page.locator('#local-file-input').setInputFiles([VIDEO_FILE, AUDIO_FILE]);
    await page.locator('#start-btn').click();

    await expect(page.locator('#localVideoContainer')).toBeVisible();
    await expect(page.locator('#localAudioPlayer')).toBeHidden();
    await expect.poll(() => page.locator('#localVideoPlayer').getAttribute('src')).toMatch(/^blob:/);
  });

  test('ファイルが無い状態で開始しても落ちない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await gotoApp(page);
    await page.selectOption('#work-source', 'local');
    await page.locator('#start-btn').click();
    await expect(page.locator('#status')).toHaveText('作業中');
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
test.describe('ローカルファイル: ロケットえんぴつ式の送り', () => {
  test('1 本終わるとその行が一番下へ回り、次が先頭になる', async ({ page }) => {
    await gotoApp(page);
    await page.selectOption('#work-source', 'local');
    await page.locator('#local-file-input').setInputFiles([AUDIO_FILE, AUDIO_FILE_2, VIDEO_FILE]);
    await page.locator('#start-btn').click();
    await expect.poll(() => currentId(page)).not.toBeNull();

    expect(await listedNames(page)).toEqual(['track-a.mp3', 'track-b.m4a', 'clip.mp4']);

    await fireEnded(page);

    // 終わった track-a が末尾へ回る
    await expect.poll(() => listedNames(page))
      .toEqual(['track-b.m4a', 'clip.mp4', 'track-a.mp3']);
  });

  test('一周すると元の順番に戻る（捨てずに回し続ける）', async ({ page }) => {
    await gotoApp(page);
    await page.selectOption('#work-source', 'local');
    await page.locator('#local-file-input').setInputFiles([AUDIO_FILE, AUDIO_FILE_2, VIDEO_FILE]);
    await page.locator('#start-btn').click();
    await expect.poll(() => currentId(page)).not.toBeNull();

    for (let i = 0; i < 3; i++) {
      await fireEnded(page);
      await page.waitForTimeout(50);
    }

    // 3 本とも残ったまま、順番は一周して元通り
    await expect(rows(page)).toHaveCount(3);
    await expect.poll(() => listedNames(page))
      .toEqual(['track-a.mp3', 'track-b.m4a', 'clip.mp4']);
  });

  test('動画へ回ると <video> 側へ切り替わる', async ({ page }) => {
    await gotoApp(page);
    await page.selectOption('#work-source', 'local');
    await page.locator('#local-file-input').setInputFiles([AUDIO_FILE, VIDEO_FILE]);
    await page.locator('#start-btn').click();
    await expect(page.locator('#localAudioPlayer')).toBeVisible();

    await fireEnded(page);

    await expect(page.locator('#localVideoContainer')).toBeVisible();
    await expect(page.locator('#localAudioPlayer')).toBeHidden();
  });

  test('1 本だけなら同じファイルを繰り返す', async ({ page }) => {
    await gotoApp(page);
    await page.selectOption('#work-source', 'local');
    await page.locator('#local-file-input').setInputFiles([AUDIO_FILE]);
    await page.locator('#start-btn').click();
    await expect.poll(() => currentId(page)).not.toBeNull();

    const idBefore = await currentId(page);
    await fireEnded(page);
    await page.waitForTimeout(50);

    await expect(rows(page)).toHaveCount(1);
    expect(await currentId(page)).toBe(idBefore);
  });

  test('再生キューは一覧の並びと一致する', async ({ page }) => {
    await gotoApp(page);
    await page.selectOption('#work-source', 'local');
    await page.locator('#local-file-input').setInputFiles([AUDIO_FILE, AUDIO_FILE_2]);
    await page.locator('#start-btn').click();
    await expect.poll(() => currentId(page)).not.toBeNull();

    const before = await queueIds(page);
    await fireEnded(page);
    await expect.poll(() => queueIds(page)).toEqual([before[1], before[0]]);
  });
});

// ---------------------------------------------------------------------------
test.describe('ローカルファイル: console / pageerror 監視', () => {
  test('追加→再生→送り→削除の一連でエラーが出ない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await gotoApp(page);
    await page.selectOption('#work-source', 'local');
    await page.locator('#local-file-input').setInputFiles([AUDIO_FILE, VIDEO_FILE]);
    await page.locator('#start-btn').click();
    await expect.poll(() => currentId(page)).not.toBeNull();
    await fireEnded(page);
    await page.waitForTimeout(100);
    await page.locator('#local-clear-btn').click();
    await expect(rows(page)).toHaveCount(0);

    const real = errors.filter(
      (e) => !/iframe_api|ytimg|voicy|gtag|gsi\/client|accounts\.google|googleapis|net::ERR_FAILED|Failed to load resource|play\(\)|NotSupportedError|no supported source/i.test(e)
    );
    expect(real, JSON.stringify(real, null, 2)).toEqual([]);
  });
});
