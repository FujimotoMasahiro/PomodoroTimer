// 探索用: サイドバー（今日の予定 / 設定のトグル式アコーディオン）の
// 見た目/レイアウト/モバイル耐性の証跡取得 spec（命名に _ を付け既存と区別）。
//
// レイアウト仕様（2026-08-29）:
//  - 右カラム(.settings-col)に「今日の予定」「設定」の 2 パネルをアコーディオンで並べる。
//  - 既定は 今日の予定=開く / 設定=畳む。ページを開いた瞬間に予定が目に入るようにするため。
//  - data-bs-parent を使わないので、片方を開いてももう片方は閉じない（独立トグル）。
//  - 開閉状態は localStorage['pomodoro_sidebar_panels'] に保存され、次回もその状態で開く。
//  - ToDo(Tasks) カラムは仕様削除済み。
import { test, expect, gotoApp } from './fixtures.js';

const SHOT_DIR = 'reports/screenshots';
const PANELS_KEY = 'pomodoro_sidebar_panels';
const EVENTS = [
  { id: 'e1', title: '朝会', allDay: false, start: '2026-06-18T09:00:00+09:00', colorId: '' },
  { id: 'e2', title: '設計レビュー（長めのタイトルでも折り返しを確認する想定の予定）', allDay: false, start: '2026-06-18T10:30:00+09:00', colorId: '8' },
  { id: 'e3', title: '終日タスク', allDay: true, start: '2026-06-18', colorId: '' },
];

async function setEvents(page, events) {
  await page.evaluate((ev) => window.PomodoroTimer.__setGcalEvents(ev), events);
}

// 各パネル（accordion-item）を id 起点で安定取得する。
const todayItem = (page) => page.locator('#panel-today').locator('xpath=ancestor::div[contains(@class,"accordion-item")][1]');
const savedPanels = (page) =>
  page.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } }, PANELS_KEY);

// 素の既定状態（seed 無し）で開く
const gotoRaw = (page) => gotoApp(page, { openSettings: false });

test.describe('探索: サイドバーのアコーディオン（今日の予定 / 設定）', () => {
  test('デスクトップ幅: 予定が既定で開き設定は畳まれている（証跡）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoRaw(page);
    await setEvents(page, EVENTS);

    const col = page.locator('.settings-col');
    await col.scrollIntoViewIfNeeded();
    await col.screenshot({ path: `${SHOT_DIR}/sidebar-desktop.png` });

    // 予定は開いている = ファーストビューで中身が見える
    await expect(page.locator('#panel-today')).toHaveClass(/show/);
    await expect(page.locator('#gcal-event-list > li')).toHaveCount(3);
    await expect(page.locator('#gcal-open-full')).toBeVisible();
    // 設定は畳まれている
    await expect(page.locator('#panel-settings')).not.toHaveClass(/show/);
    await expect(page.locator('#gcal-client-id')).toBeHidden();

    // 予定パネルは列幅のほぼ全幅（>90%）
    const colBox = await col.boundingBox();
    const itemBox = await todayItem(page).boundingBox();
    expect(itemBox.width).toBeGreaterThan(colBox.width * 0.9);

    // 予定は右カラムの中にある（左カラムには無い）
    await expect(col.locator('#gcal-event-list')).toHaveCount(1);
    await expect(page.locator('.main-col #gcal-event-list')).toHaveCount(0);

    // ToDo 関連要素は DOM に存在しない
    await expect(page.locator('#gtasks-list')).toHaveCount(0);
    await expect(page.locator('#gtasks-status')).toHaveCount(0);

    // 横はみ出しが無い
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('デスクトップ幅: 予定は画面を開いた直後（スクロール無し）で見えている', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoRaw(page);
    await setEvents(page, EVENTS);

    // ファーストビュー = スクロールせずに予定の 1 件目が可視領域に入っていること
    const box = await page.locator('#gcal-event-list > li').first().boundingBox();
    expect(box).not.toBeNull();
    expect(box.y).toBeLessThan(900);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('モバイル幅(390): 予定パネルが全幅・横はみ出しなし（証跡）', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoRaw(page);
    await setEvents(page, EVENTS);

    const col = page.locator('.settings-col');
    await col.scrollIntoViewIfNeeded();
    await col.screenshot({ path: `${SHOT_DIR}/sidebar-mobile.png` });

    const colBox = await col.boundingBox();
    const itemBox = await todayItem(page).boundingBox();
    expect(itemBox.width).toBeGreaterThan(colBox.width * 0.9);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await expect(page.locator('#gcal-open-full')).toBeVisible();
    await expect(page.locator('#gcal-event-list > li')).toHaveCount(3);
    await expect(page.locator('#gtasks-list')).toHaveCount(0);
  });

  test('設定を開くと入力欄が使える（証跡）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoRaw(page);

    await page.locator('#panel-settings-toggle').click();
    const input = page.locator('#gcal-client-id');
    await expect(input).toBeVisible();
    await input.fill('xxxxxxxx.apps.googleusercontent.com');
    await expect(page.locator('#gcal-connect-btn')).toBeEnabled();
    await page.locator('.settings-col').screenshot({ path: `${SHOT_DIR}/gcal-input.png` });
  });
});

test.describe('探索: アコーディオンのトグルと状態保存', () => {
  test('設定を開いても予定は閉じない（独立トグル）', async ({ page }) => {
    await gotoRaw(page);
    await expect(page.locator('#panel-today')).toHaveClass(/show/);

    await page.locator('#panel-settings-toggle').click();
    await expect(page.locator('#panel-settings')).toHaveClass(/show/);
    // 予定は開いたまま
    await expect(page.locator('#panel-today')).toHaveClass(/show/);
  });

  test('予定を閉じても設定は開いたまま（独立トグル）', async ({ page }) => {
    await gotoApp(page, { localStorage: { [PANELS_KEY]: JSON.stringify({ today: true, settings: true }) } });
    await expect(page.locator('#panel-settings')).toHaveClass(/show/);

    await page.locator('#panel-today-toggle').click();
    await expect(page.locator('#panel-today')).not.toHaveClass(/show/);
    await expect(page.locator('#panel-settings')).toHaveClass(/show/);
  });

  test('開閉は localStorage に保存され、リロードで復元される', async ({ page }) => {
    await gotoRaw(page);

    // 設定を開き、予定を閉じる
    await page.locator('#panel-settings-toggle').click();
    await expect(page.locator('#panel-settings')).toHaveClass(/show/);
    await page.locator('#panel-today-toggle').click();
    await expect(page.locator('#panel-today')).not.toHaveClass(/show/);

    await expect.poll(async () => await savedPanels(page)).toEqual({ today: false, settings: true });

    // リロードしてもその状態
    await page.reload();
    await expect(page.locator('#timer')).toHaveText(/^\d{2}:\d{2}$/);
    await expect(page.locator('#panel-settings')).toHaveClass(/show/);
    await expect(page.locator('#panel-today')).not.toHaveClass(/show/);
  });

  test('保存値が壊れていても既定（予定=開 / 設定=畳む）で描画される', async ({ page }) => {
    await gotoApp(page, { openSettings: false, localStorage: { [PANELS_KEY]: 'not-json' } });
    await expect(page.locator('#panel-today')).toHaveClass(/show/);
    await expect(page.locator('#panel-settings')).not.toHaveClass(/show/);
  });

  test('進捗バッジはヘッダーにあり、予定を畳んでも見える', async ({ page }) => {
    await gotoRaw(page);
    await setEvents(page, EVENTS);
    // 3 件中 1 件がグレー(colorId 8)=完了
    await expect(page.locator('#gcal-progress-label')).toHaveText('1 / 3');

    await page.locator('#panel-today-toggle').click();
    await expect(page.locator('#panel-today')).not.toHaveClass(/show/);
    await expect(page.locator('#gcal-progress-label')).toBeVisible();
  });
});
