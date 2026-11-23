// 拡張機能のツールバーアイコンに残り時間を出すため、ページがタイマー状態を
// TIMER_STATE メッセージで拡張 (relay.js) へ送ることの検証 (issue #28)。
// 拡張そのものは読み込まず、content.js の代わりにインストール済みマーカーを立てる。
import { test, expect, gotoApp } from './fixtures.js';

async function installFakeExtension(page) {
  await page.addInitScript(() => {
    window.__POMODORO_YT_EXTENSION__ = { installed: true, version: 'test' };
    window.__timerStates = [];
    window.addEventListener('message', (ev) => {
      const d = ev.data;
      if (d && d.__pomodoroYt === true && d.type === 'TIMER_STATE') window.__timerStates.push(d);
    });
  });
}

const lastState = (page) => page.evaluate(() => window.__timerStates[window.__timerStates.length - 1] || null);

test.describe('拡張アイコンの残り時間表示: ページからの状態送信', () => {
  test('待機中 → 作業中 → 一時停止 → 再開 → 休憩 → リセットで状態を送る', async ({ page }) => {
    await installFakeExtension(page);
    await gotoApp(page);

    await expect.poll(() => lastState(page)).toMatchObject({ phase: 'idle', paused: false, endTime: null });

    await page.locator('#start-btn').click();
    await expect.poll(() => lastState(page)).toMatchObject({ phase: 'work', paused: false });
    const running = await lastState(page);
    // 動作中は終了時刻を渡し、拡張側が自前で毎秒計算できるようにする
    expect(running.endTime).toBeGreaterThan(Date.now() + 24 * 60 * 1000);

    await page.locator('#pause-btn').click();
    await expect.poll(() => lastState(page)).toMatchObject({ phase: 'work', paused: true, endTime: null });
    const paused = await lastState(page);
    expect(paused.remainingSeconds).toBeGreaterThan(24 * 60);

    await page.locator('#restart-btn').click();
    await expect.poll(() => lastState(page)).toMatchObject({ phase: 'work', paused: false });

    await page.locator('#skip-btn').click();
    await expect.poll(() => lastState(page)).toMatchObject({ phase: 'break', paused: false });

    await page.locator('#reset-btn').click();
    await expect.poll(() => lastState(page)).toMatchObject({ phase: 'idle' });
  });

  test('動作中は毎秒送り直す (休止した service worker を起こすため)', async ({ page }) => {
    await installFakeExtension(page);
    await gotoApp(page);
    await page.locator('#start-btn').click();
    await expect.poll(() => lastState(page)).toMatchObject({ phase: 'work' });
    const before = await page.evaluate(() => window.__timerStates.length);
    await page.waitForTimeout(2300);
    const after = await page.evaluate(() => window.__timerStates.length);
    expect(after - before).toBeGreaterThanOrEqual(2);
  });

  test('拡張機能が未インストールなら何も送らない', async ({ page }) => {
    await page.addInitScript(() => {
      window.__timerStates = [];
      window.addEventListener('message', (ev) => {
        const d = ev.data;
        if (d && d.__pomodoroYt === true && d.type === 'TIMER_STATE') window.__timerStates.push(d);
      });
    });
    await gotoApp(page);
    await page.locator('#start-btn').click();
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => window.__timerStates.length)).toBe(0);
  });
});
