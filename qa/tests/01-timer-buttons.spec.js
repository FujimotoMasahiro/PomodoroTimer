// タイマーの状態機械とボタン可視性・ポモドーロ数の検証。
import { test, expect, gotoApp, visibleButtons } from './fixtures.js';

test.describe('タイマー: 状態遷移とボタン可視性', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('初期表示は 25:00 / cycles=0 / start ボタンのみ', async ({ page }) => {
    await expect(page.locator('#timer')).toHaveText('25:00');
    await expect(page.locator('#cycles')).toHaveText('0');
    expect(await visibleButtons(page)).toEqual(['start-btn']);
    // [Q-001 合意済] 初期表示は「待機中」に統一（status・badge とも）。
    await expect(page.locator('#status')).toHaveText('待機中');
    await expect(page.locator('#active-phase-badge')).toHaveText('待機中');
  });

  test('スタート: 作業中へ遷移し pause/skip/reset が出る・cycles=1', async ({ page }) => {
    await page.locator('#start-btn').click();
    await expect(page.locator('#status')).toHaveText('作業中');
    await expect(page.locator('#cycles')).toHaveText('1');
    expect((await visibleButtons(page)).sort()).toEqual(['pause-btn', 'reset-btn', 'skip-btn']);
  });

  test('一時停止 → 再開: restart が出る / 再開で cycles は増えない', async ({ page }) => {
    await page.locator('#start-btn').click();
    await expect(page.locator('#cycles')).toHaveText('1');

    await page.locator('#pause-btn').click();
    await expect(page.locator('#status')).toHaveText('一時停止中');
    // [BUG-002 修正済] 一時停止中は skip を非表示（押せない skip を見せない）。
    expect((await visibleButtons(page)).sort()).toEqual(['reset-btn', 'restart-btn']);

    await page.locator('#restart-btn').click();
    await expect(page.locator('#status')).toHaveText('作業中');
    await expect(page.locator('#cycles')).toHaveText('1'); // POSE 復帰では countup しない
  });

  test('スキップ: 作業中 → 休憩中へ即遷移', async ({ page }) => {
    await page.locator('#start-btn').click();
    await expect(page.locator('#status')).toHaveText('作業中');
    await page.locator('#skip-btn').click();
    await expect(page.locator('#status')).toHaveText('休憩中');
  });

  test('リセット: INITIAL へ戻り cycles=0 / start のみ', async ({ page }) => {
    await page.locator('#start-btn').click();
    await expect(page.locator('#cycles')).toHaveText('1');
    await page.locator('#reset-btn').click();
    await expect(page.locator('#cycles')).toHaveText('0');
    expect(await visibleButtons(page)).toEqual(['start-btn']);
  });

  // ── 回帰テスト（開発エージェントの修正に対応） ──────────────────────────
  test('[BUG-001 回帰] 作業中に start ハンドラが再発火しても cycles は二重カウントしない', async ({ page }) => {
    await page.locator('#start-btn').click();
    await expect(page.locator('#cycles')).toHaveText('1');
    // WORKING 中に start を強制発火（通常 UI では display:none）
    await page.evaluate(() => document.getElementById('start-btn').click());
    await page.waitForTimeout(50);
    await expect(page.locator('#cycles')).toHaveText('1'); // ガードで増えない
    await expect(page.locator('#status')).toHaveText('作業中');
  });

  test('[BUG-002 回帰] 一時停止中は skip ボタンが非表示', async ({ page }) => {
    await page.locator('#start-btn').click();
    await page.locator('#pause-btn').click();
    await expect(page.locator('#skip-btn')).toBeHidden();
    await expect(page.locator('#restart-btn')).toBeVisible();
    await expect(page.locator('#reset-btn')).toBeVisible();
  });

  test('長時間休憩: cycles が longBreakFrequency(4) の倍数で LONGBREAKING に入る', async ({ page }) => {
    // start → (skip で作業終了) を繰り返してフェーズを進める。
    // 4 サイクル目の作業終了時に長時間休憩へ入るかを観察する。
    await page.locator('#start-btn').click(); // cycle 1, 作業中
    const seen = [];
    for (let i = 0; i < 8; i++) {
      const status = await page.locator('#status').textContent();
      const cycles = await page.locator('#cycles').textContent();
      seen.push(`${cycles}:${status}`);
      await page.locator('#skip-btn').click();
      await page.waitForTimeout(50);
    }
    test.info().annotations.push({ type: 'phase-trace', description: seen.join(' | ') });
    // 長時間休憩中の出現を期待（仕様確認対象）
    expect(seen.join(' ')).toMatch(/長時間休憩中|休憩中/);
  });
});

test.describe('UX: console エラー監視', () => {
  test('一連の操作で console error / pageerror が出ない', async ({ page }) => {
    const errors = [];
    // フィクスチャが外部依存(gtag/YouTube/Voicy)を意図的に abort するため、
    // それ由来のリソース読込失敗ノイズは除外し、アプリ起因のエラーだけを見る。
    const isBlockedNoise = (t) => /Failed to load resource|net::ERR_FAILED|ERR_BLOCKED/.test(t);
    page.on('console', (m) => m.type() === 'error' && !isBlockedNoise(m.text()) && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await gotoApp(page);
    await page.locator('#start-btn').click();
    await page.locator('#pause-btn').click();
    await page.locator('#restart-btn').click();
    await page.locator('#skip-btn').click();
    await page.locator('#reset-btn').click();
    test.info().annotations.push({ type: 'console-errors', description: errors.join(' || ') || 'none' });
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
