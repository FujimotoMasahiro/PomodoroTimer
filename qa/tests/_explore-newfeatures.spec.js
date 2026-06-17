// 探索用: Googleカレンダー連携（予定をタスク扱い・col-12 単独カード）の
// 見た目/レイアウト/モバイル耐性の証跡取得 spec（命名に _ を付け既存と区別）。
// ※ ToDo(Tasks) カラムは仕様削除済み。予定カードは col-12 全幅単独。
import { test, expect, gotoApp } from './fixtures.js';

const SHOT_DIR = 'reports/screenshots';
const EVENTS = [
  { id: 'e1', title: '朝会', allDay: false, start: '2026-06-18T09:00:00+09:00', colorId: '' },
  { id: 'e2', title: '設計レビュー（長めのタイトルでも折り返しを確認する想定の予定）', allDay: false, start: '2026-06-18T10:30:00+09:00', colorId: '8' },
  { id: 'e3', title: '終日タスク', allDay: true, start: '2026-06-18', colorId: '' },
];

async function setEvents(page, events) {
  await page.evaluate((ev) => window.PomodoroTimer.__setGcalEvents(ev), events);
}

// 予定カード（最寄りの .card）を id 起点で安定取得する。
const eventsCard = (page) => page.locator('#gcal-event-list').locator('xpath=ancestor::div[contains(@class,"card")][1]');

test.describe('探索: 今日の予定カード（col-12 単独）の見た目とレイアウト', () => {
  test('デスクトップ幅: 予定カードが行幅いっぱい・横はみ出しなし（証跡）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoApp(page);
    await setEvents(page, EVENTS);

    const area = page.locator('.row.g-3.mt-1').last();
    await area.scrollIntoViewIfNeeded();
    await area.screenshot({ path: `${SHOT_DIR}/calendar-desktop.png` });

    // col-12 単独: カードは行幅のほぼ全幅（>90%）。ToDo カラムは存在しない。
    const rowBox = await area.boundingBox();
    const evBox = await eventsCard(page).boundingBox();
    expect(evBox.width).toBeGreaterThan(rowBox.width * 0.9);

    // ToDo 関連要素は DOM に存在しない
    await expect(page.locator('#gtasks-list')).toHaveCount(0);
    await expect(page.locator('#gtasks-status')).toHaveCount(0);

    // 横はみ出しが無い
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await expect(page.locator('#gcal-open-full')).toBeVisible();
    await expect(page.locator('#gcal-event-list > li')).toHaveCount(3);
  });

  test('モバイル幅(390): 予定カードが全幅・横はみ出しなし（証跡）', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page);
    await setEvents(page, EVENTS);

    const area = page.locator('.row.g-3.mt-1').last();
    await area.scrollIntoViewIfNeeded();
    await area.screenshot({ path: `${SHOT_DIR}/calendar-mobile.png` });

    const rowBox = await area.boundingBox();
    const evBox = await eventsCard(page).boundingBox();
    expect(evBox.width).toBeGreaterThan(rowBox.width * 0.9);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await expect(page.locator('#gcal-open-full')).toBeVisible();
    await expect(page.locator('#gcal-event-list > li')).toHaveCount(3);
    await expect(page.locator('#gtasks-list')).toHaveCount(0);
  });

  test('設定サイドバー: OAuth クライアント ID 入力欄の証跡', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoApp(page);
    const input = page.locator('#gcal-client-id');
    await expect(input).toBeVisible();
    await input.scrollIntoViewIfNeeded();
    await input.fill('xxxxxxxx.apps.googleusercontent.com');
    await expect(page.locator('#gcal-connect-btn')).toBeEnabled();
    await page.locator('.settings-col').screenshot({ path: `${SHOT_DIR}/gcal-input.png` });
  });
});
