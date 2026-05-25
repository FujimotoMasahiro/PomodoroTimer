// 音源選択 UI・アクティブ音源カード・localStorage 永続化の検証。
import { test, expect, gotoApp, audioState } from './fixtures.js';

test.describe('音源: 選択とアクティブ音源カード表示', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('初期は作業中BGMがアクティブ表示', async ({ page }) => {
    await expect(page.locator('#active-source-label')).toHaveText('作業中BGM');
    await expect(page.locator('#workBgmWrapper')).toBeVisible();
    await expect(page.locator('#voicyWrapper')).toBeHidden();
    await expect(page.locator('#youtubeWrapper')).toBeHidden();
  });

  test('作業中音源を none にするとラベルとラッパーが切替わる', async ({ page }) => {
    await page.locator('#work-source').selectOption('none');
    await expect(page.locator('#active-source-label')).toHaveText('音なし');
    await expect(page.locator('#noneWrapper')).toBeVisible();
    await expect(page.locator('#workBgmWrapper')).toBeHidden();
  });

  test('作業中音源を youtube にすると YouTube ラッパーが出る', async ({ page }) => {
    await page.locator('#work-source').selectOption('youtube');
    await expect(page.locator('#active-source-label')).toHaveText('YouTube');
    await expect(page.locator('#youtubeWrapper')).toBeVisible();
  });

  test('スタートで作業中BGM(#audioPlayer)が再生され、一時停止で止まり位置リセット', async ({ page }) => {
    await page.locator('#start-btn').click();
    await expect.poll(async () => (await audioState(page, 'audioPlayer')).paused).toBe(false);

    await page.locator('#pause-btn').click();
    const st = await audioState(page, 'audioPlayer');
    expect(st.paused).toBe(true);
    expect(st.currentTime).toBe(0); // stop() は currentTime=0 にする
  });

  test('スタートでタイマー音(#audioPlayer2)も再生される', async ({ page }) => {
    await page.locator('#start-btn').click();
    await expect.poll(async () => (await audioState(page, 'audioPlayer2')).paused).toBe(false);
  });

  test('badge がフェーズに追従（作業中→一時停止中）', async ({ page }) => {
    await page.locator('#start-btn').click();
    await expect(page.locator('#active-phase-badge')).toHaveText('作業中');
    await page.locator('#pause-btn').click();
    await expect(page.locator('#active-phase-badge')).toHaveText('一時停止中');
  });
});

test.describe('音源: localStorage 永続化', () => {
  test('音源設定を変えてリロードすると復元される', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#work-source').selectOption('youtube');
    await page.locator('#break-source').selectOption('none');
    await page.locator('#voicy-url').fill('https://voicy.jp/embed/channel/123');

    // 保存が走るのを待ってからリロード
    await expect.poll(async () =>
      page.evaluate(() => localStorage.getItem('pomodoro_audio_source_settings'))
    ).not.toBeNull();

    await page.reload();
    await expect(page.locator('#timer')).toHaveText(/^\d{2}:\d{2}$/);
    await expect(page.locator('#work-source')).toHaveValue('youtube');
    await expect(page.locator('#break-source')).toHaveValue('none');
    await expect(page.locator('#voicy-url')).toHaveValue('https://voicy.jp/embed/channel/123');
  });
});

test.describe('UX: 注意書き', () => {
  test('音量0でタイマーが止まる旨の警告文が表示されている', async ({ page }) => {
    await gotoApp(page);
    await expect(page.getByText(/音量を0にすると/)).toBeVisible();
  });
});
