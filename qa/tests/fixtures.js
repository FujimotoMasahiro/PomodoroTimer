// テストを決定論的・オフライン耐性のあるものにするための共通ヘルパー。
// 外部依存（gtag / YouTube IFrame API・サムネ / Voicy）はブロックし、
// Bootstrap CDN だけは通す（モーダル・レイアウト確認に必要なため）。
import { test as base, expect } from '@playwright/test';

const NOISE_HOSTS = [
  'googletagmanager.com',
  'google-analytics.com',
  'www.youtube.com/iframe_api',
  'img.youtube.com',
  'i.ytimg.com',
  'voicy.jp',
  // Google カレンダー連携の OAuth ライブラリ / API（実通信は QA では不可）。
  // 決定論化のためブロックし、描画は window.PomodoroTimer.__setGcalEvents フックで検証する。
  'accounts.google.com/gsi/client',
  'apis.google.com',
  'www.googleapis.com',
];

/**
 * 外部ノイズをブロックして index.html を開く。
 * @param {import('@playwright/test').Page} page
 * @param {object} opts
 * @param {boolean} opts.dismissExtModal 拡張モーダルを出さない（既定 true）
 * @param {Record<string,string>} opts.localStorage 事前に流し込む localStorage
 */
export async function gotoApp(page, opts = {}) {
  const { dismissExtModal = true, localStorage: ls = {} } = opts;

  // 外部リクエストはアプリのロジックに影響しない範囲でブロックして高速・安定化
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (NOISE_HOSTS.some((h) => url.includes(h))) return route.abort();
    return route.continue();
  });

  const seed = { ...ls };
  if (dismissExtModal) seed['pomodoro_yt_ext_dismissed'] = 'true';
  await page.addInitScript((entries) => {
    try {
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    } catch (_) {}
  }, seed);

  await page.goto('/index.html');
  // モジュール初期化（main() / observer 登録）の完了を待つ
  await expect(page.locator('#timer')).toHaveText(/^\d{2}:\d{2}$/);
}

/** 表示中（display !== none）のボタン id 一覧を返す */
export async function visibleButtons(page) {
  return page.evaluate(() => {
    const ids = ['start-btn', 'pause-btn', 'restart-btn', 'skip-btn', 'reset-btn'];
    return ids.filter((id) => {
      const el = document.getElementById(id);
      return el && getComputedStyle(el).display !== 'none';
    });
  });
}

/** #audioPlayer 系の再生状態を覗く（paused / currentTime） */
export async function audioState(page, id) {
  return page.evaluate((elId) => {
    const a = document.getElementById(elId);
    if (!a) return null;
    return { paused: a.paused, currentTime: a.currentTime, src: a.getAttribute('src') };
  }, id);
}

export const test = base;
export { expect };
