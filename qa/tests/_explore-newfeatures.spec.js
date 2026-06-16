// 探索用: Googleカレンダー連携（読み取り専用チェックリスト）の見た目/レイアウト/
// モバイル耐性の証跡取得 spec（命名に _ を付け既存と区別）。
// ※ 旧「埋め込み iframe + 週表示」UI は仕様削除済みのため参照しない。
import { test, expect, gotoApp } from './fixtures.js';

const SHOT_DIR = 'reports/screenshots';
const EVENTS = [
  { id: 'e1', title: '朝会', allDay: false, start: '2026-06-17T09:00:00+09:00' },
  { id: 'e2', title: '設計レビュー（長めのタイトルでも折り返しを確認する想定の予定）', allDay: false, start: '2026-06-17T10:30:00+09:00' },
  { id: 'e3', title: '終日タスク', allDay: true, start: '2026-06-17' },
];

async function setEvents(page, events) {
  await page.evaluate((ev) => window.PomodoroTimer.__setGcalEvents(ev), events);
}

test.describe('探索: 今日の予定カードの見た目とレイアウト', () => {
  test('デスクトップ幅: 予定カードが横幅いっぱい・横はみ出しなし（証跡）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoApp(page);
    await setEvents(page, EVENTS);

    const area = page.locator('.row.g-3.mt-1').last();
    await area.scrollIntoViewIfNeeded();
    await area.screenshot({ path: `${SHOT_DIR}/calendar-desktop.png` });

    // 予定カード（card）が行内でほぼ全幅を占める（col-12 単独カード）
    const rowBox = await area.boundingBox();
    const cardBox = await area.locator('.card').boundingBox();
    expect(cardBox.width).toBeGreaterThan(rowBox.width * 0.9);

    // 横はみ出しが無い
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await expect(page.locator('#gcal-open-full')).toBeVisible();
    await expect(page.locator('#gcal-event-list > li')).toHaveCount(3);
  });

  test('モバイル幅(390): 予定リスト表示・横はみ出しなし（証跡）', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page);
    await setEvents(page, EVENTS);

    const area = page.locator('.row.g-3.mt-1').last();
    await area.scrollIntoViewIfNeeded();
    await area.screenshot({ path: `${SHOT_DIR}/calendar-mobile.png` });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await expect(page.locator('#gcal-open-full')).toBeVisible();
    await expect(page.locator('#gcal-event-list > li')).toHaveCount(3);
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
