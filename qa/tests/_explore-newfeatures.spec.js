// 探索用: 予定エリア（Googleカレンダー A+C 併用）のレイアウト/モバイル耐性/UX 所見の証跡取得。
// レポート用スクショ＋横はみ出し検証の spec（命名に _ を付け既存と区別）。
// ※ 旧「今日のタスク」チェックリストは仕様削除済みのため、参照は持たない。
import { test, expect, gotoApp } from './fixtures.js';

const EMBED_URL =
  'https://calendar.google.com/calendar/embed?src=ja.japanese%23holiday%40group.v.calendar.google.com&ctz=Asia%2FTokyo';
const SHOT_DIR = 'reports/screenshots';

test.describe('探索: 予定エリアの見た目とレイアウト', () => {
  test('デスクトップ幅: 予定カードが横幅いっぱい・横はみ出しなし（証跡）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoApp(page);
    await page.locator('#gcal-url').fill(EMBED_URL);

    const area = page.locator('.row.g-3.mt-1').last();
    await area.scrollIntoViewIfNeeded();
    await area.screenshot({ path: `${SHOT_DIR}/calendar-desktop.png` });

    // 予定カード (#gcal-container) が行内でほぼ全幅を占める（col-12 単独カード）
    const rowBox = await area.boundingBox();
    const calBox = await page.locator('#gcal-container').boundingBox();
    expect(calBox.width).toBeGreaterThan(rowBox.width * 0.9);

    // 横はみ出しが無い
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // 「通常のカレンダーを開く」ボタンが見出し右に表示されている
    await expect(page.locator('#gcal-open-full')).toBeVisible();
  });

  test('モバイル幅(390): 予定カード表示・横はみ出しなし（証跡）', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page);
    await page.locator('#gcal-url').fill(EMBED_URL);

    const area = page.locator('.row.g-3.mt-1').last();
    await area.scrollIntoViewIfNeeded();
    await area.screenshot({ path: `${SHOT_DIR}/calendar-mobile.png` });

    // 横はみ出しが無いか（body の scrollWidth が viewport 幅に収まる）
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // モバイルでもボタンと iframe が存在
    await expect(page.locator('#gcal-open-full')).toBeVisible();
    await expect(page.locator('#gcal-container iframe')).toHaveCount(1);
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
