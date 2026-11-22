// 「開いているYouTube動画を取り込む」ボタン (設定 > YouTube 再生リスト見出しの右) の検証。
// 拡張そのものは Playwright から読み込めないため、
//   - content.js 相当のマーカー (window.__POMODORO_YT_EXTENSION__)
//   - 本物の extension/relay.js
//   - chrome.runtime.sendMessage のスタブ (service worker の collectYouTubeTabs 相当)
// をページに注入し、ページ → relay → 拡張 → ページの往復を検証する。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, gotoApp } from './fixtures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RELAY_SRC = fs.readFileSync(path.join(__dirname, '../../extension/relay.js'), 'utf8');

const OPEN_TABS = [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://www.youtube.com/watch?v=9bZkp7q5F1Q',
];

/** 拡張がインストールされている状態を再現する */
async function installFakeExtension(page, { features = ['mark-watched', 'collect'], tabs = OPEN_TABS } = {}) {
  await page.addInitScript(({ features, tabs, relaySrc }) => {
    window.__POMODORO_YT_EXTENSION__ = { installed: true, version: 'test', features };
    window.__collectCalls = 0;
    window.chrome = window.chrome || {};
    window.chrome.runtime = {
      // background.js の collectYouTubeTabs と同じ形の応答を返す
      sendMessage: async (msg) => {
        if (msg.type !== 'COLLECT_YT_TABS') return { ok: false };
        window.__collectCalls++;
        const { added } = window.PomodoroTimer.addYouTubeUrls(tabs);
        return added > 0
          ? { ok: true, added, closed: tabs.length, message: `${added} 件の動画を追加し、${tabs.length} タブを閉じました。` }
          : { ok: true, added: 0, closed: 0, message: '追加できる新規 URL がありませんでした (重複/無効)。' };
      },
    };
    // eslint-disable-next-line no-new-func
    new Function(relaySrc)();
  }, { features, tabs, relaySrc: RELAY_SRC });
}

const urlInputs = (page) => page.locator('#youtube-url-list .yt-url-row input[type="url"]');

test.describe('開いているYouTube動画を取り込むボタン', () => {
  test('見出し「YouTube 再生リスト」の右側に表示される', async ({ page }) => {
    await installFakeExtension(page);
    await gotoApp(page);
    await page.selectOption('#work-source', 'youtube');

    const label = page.locator('#youtube-settings label', { hasText: 'YouTube 再生リスト' });
    const btn = page.locator('#yt-collect-btn');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText('開いているYouTube動画を取り込む');
    const lb = await label.boundingBox();
    const bb = await btn.boundingBox();
    expect(bb.x).toBeGreaterThan(lb.x + lb.width);
    // 同じ行 (縦方向に重なる)
    expect(bb.y).toBeLessThan(lb.y + lb.height);
    expect(bb.y + bb.height).toBeGreaterThan(lb.y);
  });

  test('クリックで開いている動画が再生リストに追加され、結果が表示される', async ({ page }) => {
    await installFakeExtension(page);
    await gotoApp(page);
    await page.selectOption('#work-source', 'youtube');

    await page.click('#yt-collect-btn');
    await expect(page.locator('#yt-collect-status')).toHaveText('2 件の動画を追加し、2 タブを閉じました。');
    await expect(urlInputs(page)).toHaveCount(3); // 2 件 + 末尾の空欄
    await expect(urlInputs(page).nth(0)).toHaveValue(OPEN_TABS[0]);
    await expect(urlInputs(page).nth(1)).toHaveValue(OPEN_TABS[1]);
    await expect(page.locator('#yt-collect-btn')).toBeEnabled();

    // 2 回目は重複なので追加されない
    await page.click('#yt-collect-btn');
    await expect(page.locator('#yt-collect-status')).toHaveText(/追加できる新規 URL がありませんでした/);
    await expect(urlInputs(page)).toHaveCount(3);
    expect(await page.evaluate(() => window.__collectCalls)).toBe(2);
  });

  test('取り込み未対応の古い拡張では更新を案内し、拡張へは依頼しない', async ({ page }) => {
    await installFakeExtension(page, { features: null });
    await gotoApp(page);
    await page.selectOption('#work-source', 'youtube');

    await page.click('#yt-collect-btn');
    await expect(page.locator('#yt-collect-status')).toHaveText(/拡張機能が古い/);
    expect(await page.evaluate(() => window.__collectCalls)).toBe(0);
  });

  test('拡張が未インストールならインストール案内モーダルを出す', async ({ page }) => {
    await gotoApp(page); // dismissExtModal: 起動時の自動表示は抑止
    await page.selectOption('#work-source', 'youtube');

    await expect(page.locator('#extInstallModal')).toBeHidden();
    await page.click('#yt-collect-btn');
    await expect(page.locator('#extInstallModal')).toBeVisible();
    await expect(page.locator('#yt-collect-status')).toHaveText(/インストールされていません/);
  });
});
