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
    // Voicy URL 欄は Voicy を選んでいるときだけ出るので、休憩側を Voicy にする
    await page.locator('#break-source').selectOption('voicy');
    await page.locator('#voicy-url').fill('https://voicy.jp/embed/channel/123');

    // 保存が走るのを待ってからリロード
    await expect.poll(async () =>
      page.evaluate(() => localStorage.getItem('pomodoro_audio_source_settings'))
    ).not.toBeNull();

    await page.reload();
    await expect(page.locator('#timer')).toHaveText(/^\d{2}:\d{2}$/);
    await expect(page.locator('#work-source')).toHaveValue('youtube');
    await expect(page.locator('#break-source')).toHaveValue('voicy');
    await expect(page.locator('#voicy-url')).toHaveValue('https://voicy.jp/embed/channel/123');
  });
});

test.describe('UX: 注意書き', () => {
  test('音量0でタイマーが止まる旨の警告文が表示されている', async ({ page }) => {
    await gotoApp(page);
    await expect(page.getByText(/音量を0にすると/)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 選んでいる音源に関係する設定だけを出す（2026-08-29 追加）。
// 作業中 / 休憩中のどちらかで選ばれていれば表示する。
// BGM と「音なし」は固有の設定項目を持たないので、その場合は 3 つとも畳まれる。
test.describe('音源: 選択に応じた設定項目の出し分け', () => {
  const voicy = (page) => page.locator('#voicy-settings');
  const youtube = (page) => page.locator('#youtube-settings');
  const local = (page) => page.locator('#local-settings');

  test('既定 (BGM / BGM) では Voicy・YouTube・ローカルのどれも出ない', async ({ page }) => {
    await gotoApp(page);
    await expect(voicy(page)).toBeHidden();
    await expect(youtube(page)).toBeHidden();
    await expect(local(page)).toBeHidden();
    // 音源の選択そのものは常に出ている
    await expect(page.locator('#work-source')).toBeVisible();
    await expect(page.locator('#break-source')).toBeVisible();
  });

  test('作業中に Voicy を選ぶと Voicy URL だけ出る', async ({ page }) => {
    await gotoApp(page);
    await page.selectOption('#work-source', 'voicy');
    await expect(voicy(page)).toBeVisible();
    await expect(youtube(page)).toBeHidden();
    await expect(local(page)).toBeHidden();
  });

  test('休憩中の選択でも出る（作業中は BGM のままでも YouTube 一覧が出る）', async ({ page }) => {
    await gotoApp(page);
    await page.selectOption('#break-source', 'youtube');
    await expect(youtube(page)).toBeVisible();
    await expect(voicy(page)).toBeHidden();
    await expect(local(page)).toBeHidden();
  });

  test('作業中と休憩中で別々に選ぶと、両方の設定が出る', async ({ page }) => {
    await gotoApp(page);
    await page.selectOption('#work-source', 'voicy');
    await page.selectOption('#break-source', 'youtube');
    await expect(voicy(page)).toBeVisible();
    await expect(youtube(page)).toBeVisible();
    await expect(local(page)).toBeHidden();
  });

  test('ローカルファイルを選ぶとローカルの設定だけ出る', async ({ page }) => {
    await gotoApp(page);
    await page.selectOption('#work-source', 'local');
    await expect(local(page)).toBeVisible();
    await expect(voicy(page)).toBeHidden();
    await expect(youtube(page)).toBeHidden();
  });

  test('BGM に戻すと畳まれる', async ({ page }) => {
    await gotoApp(page);
    await page.selectOption('#work-source', 'voicy');
    await expect(voicy(page)).toBeVisible();
    await page.selectOption('#work-source', 'bgm');
    await expect(voicy(page)).toBeHidden();
  });

  test('リロードしても選択に応じた出し分けが復元される', async ({ page }) => {
    await gotoApp(page);
    await page.selectOption('#work-source', 'local');
    await expect(local(page)).toBeVisible();

    await page.reload();
    await expect(page.locator('#timer')).toHaveText(/^\d{2}:\d{2}$/);
    await expect(page.locator('#work-source')).toHaveValue('local');
    await expect(local(page)).toBeVisible();
    await expect(voicy(page)).toBeHidden();
    await expect(youtube(page)).toBeHidden();
  });
});
