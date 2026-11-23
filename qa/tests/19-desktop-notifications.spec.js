// デスクトップ通知 (issue #26) の検証。
//
// タイマーが終わって作業・休憩が切り替わったとき、設定の「デスクトップ通知」が
// オンかつ許可済みなら Web Notifications API で通知を出す。
// 実ブラウザの通知許可ダイアログは自動操作できないため、window.Notification を
// 偽物に差し替えて「許可の要求」「通知の生成」を記録する。

import { test, expect, gotoApp } from './fixtures.js';

// perm: 現在の許可状態 / answer: requestPermission() の返答 / supported: false で API 自体を消す
async function installFakeNotification(page, { perm = 'default', answer = 'granted', supported = true } = {}) {
  await page.addInitScript(({ perm, answer, supported }) => {
    window.__notifs = [];
    window.__permRequests = 0;
    if (!supported) {
      delete window.Notification;
      return;
    }
    window.__perm = perm;
    class FakeNotification {
      constructor(title, opts = {}) {
        this.rec = { title, body: opts.body, tag: opts.tag, silent: opts.silent, renotify: opts.renotify, closed: false };
        window.__notifs.push(this.rec);
      }
      addEventListener() {}
      close() { this.rec.closed = true; }
      static get permission() { return window.__perm; }
      static requestPermission() {
        window.__permRequests++;
        window.__perm = answer;
        return Promise.resolve(answer);
      }
    }
    window.Notification = FakeNotification;
  }, { perm, answer, supported });
}

const notifs = (page) => page.evaluate(() => window.__notifs);

async function startAndFinishWork(page) {
  await page.locator('#start-btn').click();
  await expect(page.locator('#status')).toHaveText('作業中');
  await page.clock.fastForward('25:01');
  await expect(page.locator('#status')).toHaveText('休憩中');
}

test.describe('デスクトップ通知', () => {
  test('オンにすると許可を求め、作業→休憩→作業の切替ごとに通知する', async ({ page }) => {
    await installFakeNotification(page, { perm: 'default', answer: 'granted' });
    await page.clock.install({ time: new Date('2026-06-01T09:00:00.000Z') });
    await gotoApp(page);

    const toggle = page.locator('#notify-toggle');
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await expect(toggle).toBeChecked();
    expect(await page.evaluate(() => window.__permRequests)).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem('pomodoro_notifications_enabled'))).toBe('true');

    // 開始ボタンでは通知しない (画面を見ている)
    await startAndFinishWork(page);
    let list = await notifs(page);
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('休憩の時間です');
    expect(list[0].body).toContain('5分');
    // tag 固定の置き換えは macOS でバナーが出ないため、毎回別の tag で出す (issue #30)
    expect(list[0].tag).toMatch(/^pomodoro-phase-/);
    expect(list[0].renotify).toBeUndefined();
    expect(list[0].silent).toBe(true);

    await page.clock.fastForward('05:01');
    await expect(page.locator('#status')).toHaveText('作業中');
    list = await notifs(page);
    expect(list).toHaveLength(2);
    expect(list[1].title).toBe('作業の時間です');
    expect(list[1].body).toContain('2 回目');
    expect(list[1].tag).not.toBe(list[0].tag);
    // 前回の通知は閉じてから出す (通知センターに溜めない)
    expect(list[0].closed).toBe(true);
    expect(list[1].closed).toBe(false);
  });

  test('スイッチがオフなら、許可済みでも通知しない', async ({ page }) => {
    await installFakeNotification(page, { perm: 'granted' });
    await page.clock.install({ time: new Date('2026-06-01T09:00:00.000Z') });
    await gotoApp(page);

    await expect(page.locator('#notify-toggle')).not.toBeChecked();
    await startAndFinishWork(page);
    expect(await notifs(page)).toHaveLength(0);
  });

  test('スキップで切り替えたときは通知しない', async ({ page }) => {
    await installFakeNotification(page, { perm: 'granted' });
    await gotoApp(page, { localStorage: { pomodoro_notifications_enabled: 'true' } });

    await expect(page.locator('#notify-toggle')).toBeChecked();
    await page.locator('#start-btn').click();
    await expect(page.locator('#status')).toHaveText('作業中');
    await page.locator('#skip-btn').click();
    await expect(page.locator('#status')).toHaveText('休憩中');
    expect(await notifs(page)).toHaveLength(0);
  });

  test('許可が拒否されたらスイッチをオフに戻して理由を出し、通知しない', async ({ page }) => {
    await installFakeNotification(page, { perm: 'default', answer: 'denied' });
    await page.clock.install({ time: new Date('2026-06-01T09:00:00.000Z') });
    await gotoApp(page);

    const toggle = page.locator('#notify-toggle');
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect(page.locator('#notify-status')).toContainText('ブロック');

    await startAndFinishWork(page);
    expect(await notifs(page)).toHaveLength(0);
  });

  test('非対応ブラウザではスイッチを無効にして理由を出す (音は従来どおり)', async ({ page }) => {
    await installFakeNotification(page, { supported: false });
    await gotoApp(page);

    await expect(page.locator('#notify-toggle')).toBeDisabled();
    await expect(page.locator('#notify-status')).toContainText('対応していません');
  });

  test('オンの設定はリロード後も残る', async ({ page }) => {
    await installFakeNotification(page, { perm: 'default', answer: 'granted' });
    await gotoApp(page);
    await page.locator('#notify-toggle').check();
    await expect(page.locator('#notify-toggle')).toBeChecked();

    // 許可済みとして開き直す
    await page.addInitScript(() => { window.__perm = 'granted'; });
    await page.reload();
    await expect(page.locator('#notify-toggle')).toBeChecked();
  });
});
