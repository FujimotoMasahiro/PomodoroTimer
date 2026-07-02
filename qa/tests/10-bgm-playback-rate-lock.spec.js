// BGM (<audio>) の再生速度ロックの検証。
// 再生速度コントローラ系のブラウザ拡張が、ページ上の全メディア要素へ同じ再生速度を
// 適用することがある。その結果「作業中に YouTube の速度を変えると休憩 BGM の速度まで
// 変わる」不具合が起きていた。MusicManager は BGM の playbackRate を常に 1.0 に固定し、
// 外部から書き換えられても即座に戻す。ここではその防御が効いていることを確認する。
import { test, expect, gotoApp } from './fixtures.js';

// 外部拡張による書き換えを模して playbackRate をセットする。
async function forceRate(page, id, rate) {
  await page.evaluate(({ elId, r }) => {
    const a = document.getElementById(elId);
    if (a) a.playbackRate = r;
  }, { elId: id, r: rate });
}

const rateOf = (page, id) =>
  page.evaluate((elId) => {
    const a = document.getElementById(elId);
    return a ? a.playbackRate : null;
  }, id);

test.describe('BGM: 再生速度ロック (拡張機能の速度変更に追従しない)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  // 休憩 BGM (#audioPlayer3) を含む全 BGM/アラーム要素で、外部が速度を上げても 1.0 に戻る。
  for (const id of ['audioPlayer', 'audioPlayer2', 'audioPlayer3']) {
    test(`${id}: 外部が playbackRate=2 にしても 1.0 に戻る`, async ({ page }) => {
      await forceRate(page, id, 2);
      await expect.poll(() => rateOf(page, id)).toBe(1);
    });
  }

  test('再生開始時にも等速へ戻る (再生中に上げられても 1.0)', async ({ page }) => {
    await page.locator('#start-btn').click();
    // 再生中に拡張が速度を上げた想定
    await forceRate(page, 'audioPlayer', 1.75);
    await expect.poll(() => rateOf(page, 'audioPlayer')).toBe(1);
  });
});
