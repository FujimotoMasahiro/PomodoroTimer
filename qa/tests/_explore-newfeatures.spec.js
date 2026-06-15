// 探索用: 新機能エリアのレイアウト/モバイル積み重ね/UX 所見の証跡取得。
// レポート用スクショを撮るだけの非アサーション spec（命名に _ を付け既存と区別）。
import { test, expect, gotoApp } from './fixtures.js';

const EMBED_URL =
  'https://calendar.google.com/calendar/embed?src=ja.japanese%23holiday%40group.v.calendar.google.com&ctz=Asia%2FTokyo';
const SHOT_DIR = 'reports/screenshots';

test.describe('探索: 新機能の見た目とレイアウト', () => {
  test('デスクトップ幅: タスク + カレンダーの並び（証跡）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoApp(page);
    await page.locator('#task-input').fill('レポートを書く');
    await page.locator('#task-add-form button[type="submit"]').click();
    await page.locator('#task-input').fill('資料レビュー');
    await page.locator('#task-add-form button[type="submit"]').click();
    await page.locator('#task-list li').first().locator('input[type="checkbox"]').check();
    await page.locator('#gcal-url').fill(EMBED_URL);

    const area = page.locator('.row.g-3.mt-1').last();
    await area.scrollIntoViewIfNeeded();
    await area.screenshot({ path: `${SHOT_DIR}/newfeatures-desktop.png` });

    // タスク列が左 (col-lg-5)、カレンダー列が右 (col-lg-7) の横並びか確認
    const taskBox = await page.locator('#task-list').boundingBox();
    const calBox = await page.locator('#gcal-container').boundingBox();
    // 同じ行に並ぶ＝縦位置が近接
    expect(Math.abs(taskBox.y - calBox.y)).toBeLessThan(200);
    // タスクが左
    expect(taskBox.x).toBeLessThan(calBox.x);
  });

  test('モバイル幅: タスク → カレンダーの縦積み（証跡）', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page);
    await page.locator('#task-input').fill('モバイルタスク');
    await page.locator('#task-add-form button[type="submit"]').click();

    const area = page.locator('.row.g-3.mt-1').last();
    await area.scrollIntoViewIfNeeded();
    await area.screenshot({ path: `${SHOT_DIR}/newfeatures-mobile.png` });

    // 横はみ出しが無いか（body の scrollWidth が viewport 幅に収まる）
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // モバイルでは縦積み: タスク列がカレンダー列より上
    const taskBox = await page.locator('#task-list').boundingBox();
    const calBox = await page.locator('#gcal-container').boundingBox();
    expect(taskBox.y).toBeLessThan(calBox.y);
  });

  test('設定サイドバー: カレンダー入力欄の証跡', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoApp(page);
    // 設定は常時表示カラム（トグル無し）。gcal 入力欄は常に見える。
    await expect(page.locator('#gcal-url')).toBeVisible();
    await page.locator('#gcal-url').scrollIntoViewIfNeeded();
    await page.locator('#gcal-url').fill('http://calendar.google.com/calendar/embed?src=x');
    await expect(page.locator('#gcal-url-warning')).toBeVisible();
    await page.locator('.settings-col').screenshot({ path: `${SHOT_DIR}/gcal-input.png` });
  });
});
