// 一般公開向けの初期値 (#15)
//  - 画面は日本語なので <html lang="ja">
//  - Voicy は特定チャンネルを既定にしない。未入力なら iframe を出さず案内を表示し、
//    URL を入れたらその URL で再生する。
import { test, expect, gotoApp } from './fixtures.js';

test('html の lang が ja', async ({ page }) => {
  await gotoApp(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
});

test('OGP の基本メタ情報がある', async ({ page }) => {
  await gotoApp(page);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /ポモドーロタイマー/);
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', /.+/);
  await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'ja_JP');
});

test.describe('Voicy の既定値', () => {
  test('初回は Voicy URL が空で、個人のチャンネルを既定にしていない', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#work-source').selectOption('voicy');
    await expect(page.locator('#voicy-url')).toHaveValue('');
    expect(await page.content()).not.toContain('channel/941');
  });

  test('URL 未入力で Voicy を再生すると iframe を出さず案内を表示する', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#work-source').selectOption('voicy');
    await page.locator('#start-btn').click();
    await expect(page.locator('#voicyContainer .voicy-empty-note')).toBeVisible();
    await expect(page.locator('#voicyContainer iframe')).toHaveCount(0);
  });

  test('URL を入れるとその URL で iframe を表示する', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#work-source').selectOption('voicy');
    await page.locator('#start-btn').click();
    await expect(page.locator('#voicyContainer .voicy-empty-note')).toBeVisible();
    await page.locator('#voicy-url').fill('https://voicy.jp/embed/channel/123');
    await expect(page.locator('#voicyContainer iframe'))
      .toHaveAttribute('src', 'https://voicy.jp/embed/channel/123');
    await expect(page.locator('#voicyContainer .voicy-empty-note')).toHaveCount(0);
  });

  test('保存済みの Voicy URL はそのまま復元される (既存ユーザーに影響しない)', async ({ page }) => {
    await gotoApp(page, {
      localStorage: {
        pomodoro_audio_source_settings: JSON.stringify({
          workSource: 'voicy', breakSource: 'bgm', voicyUrl: 'https://voicy.jp/embed/channel/941',
        }),
      },
    });
    await expect(page.locator('#voicy-url')).toHaveValue('https://voicy.jp/embed/channel/941');
  });
});
