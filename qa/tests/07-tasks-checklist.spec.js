// 今日のタスク（簡易チェックリスト）の検証。
// 追加/完了/削除/進捗/永続化/XSS安全性をカバー。
import { test, expect, gotoApp } from './fixtures.js';

const TASKS_KEY = 'pomodoro_tasks';

async function addTask(page, text) {
  await page.locator('#task-input').fill(text);
  await page.locator('#task-add-form button[type="submit"]').click();
}

test.describe('タスク: 追加と空表示', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('初期は空・空表示あり・進捗 0/0', async ({ page }) => {
    await expect(page.locator('#task-empty')).toBeVisible();
    await expect(page.locator('#task-list li')).toHaveCount(0);
    await expect(page.locator('#task-progress-label')).toHaveText('0 / 0');
    await expect(page.locator('#task-progress-bar')).toHaveAttribute('aria-valuenow', '0');
  });

  test('タスクを追加すると行が増え、空表示が消え、進捗が更新', async ({ page }) => {
    await addTask(page, 'レポートを書く');
    await expect(page.locator('#task-list li')).toHaveCount(1);
    await expect(page.locator('#task-list li').first()).toContainText('レポートを書く');
    await expect(page.locator('#task-empty')).toBeHidden();
    await expect(page.locator('#task-progress-label')).toHaveText('0 / 1');
    await expect(page.locator('#task-input')).toHaveValue(''); // 入力欄クリア
  });

  test('複数追加できる', async ({ page }) => {
    await addTask(page, 'タスクA');
    await addTask(page, 'タスクB');
    await addTask(page, 'タスクC');
    await expect(page.locator('#task-list li')).toHaveCount(3);
    await expect(page.locator('#task-progress-label')).toHaveText('0 / 3');
  });

  test('空文字・空白のみは追加されない', async ({ page }) => {
    await addTask(page, '');
    await expect(page.locator('#task-list li')).toHaveCount(0);
    await addTask(page, '   ');
    await expect(page.locator('#task-list li')).toHaveCount(0);
    await expect(page.locator('#task-empty')).toBeVisible();
  });
});

test.describe('タスク: 完了チェックと進捗', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('チェックで取り消し線・進捗ラベル/バーが更新', async ({ page }) => {
    await addTask(page, 'タスク1');
    await addTask(page, 'タスク2');
    const firstCb = page.locator('#task-list li').first().locator('input[type="checkbox"]');
    await firstCb.check();

    await expect(page.locator('#task-progress-label')).toHaveText('1 / 2');
    await expect(page.locator('#task-progress-bar')).toHaveAttribute('aria-valuenow', '50');
    await expect(page.locator('#task-progress-bar')).toHaveAttribute('style', /width:\s*50%/);

    const firstSpan = page.locator('#task-list li').first().locator('span');
    await expect(firstSpan).toHaveClass(/text-decoration-line-through/);
  });

  test('全完了で 100%', async ({ page }) => {
    await addTask(page, 'A');
    await addTask(page, 'B');
    for (const cb of await page.locator('#task-list li input[type="checkbox"]').all()) {
      await cb.check();
    }
    await expect(page.locator('#task-progress-label')).toHaveText('2 / 2');
    await expect(page.locator('#task-progress-bar')).toHaveAttribute('aria-valuenow', '100');
  });

  test('チェックを外すと進捗が戻る', async ({ page }) => {
    await addTask(page, 'A');
    const cb = page.locator('#task-list li').first().locator('input[type="checkbox"]');
    await cb.check();
    await expect(page.locator('#task-progress-label')).toHaveText('1 / 1');
    // re-render で要素が差し替わるため取り直して uncheck
    await page.locator('#task-list li').first().locator('input[type="checkbox"]').uncheck();
    await expect(page.locator('#task-progress-label')).toHaveText('0 / 1');
    await expect(page.locator('#task-progress-bar')).toHaveAttribute('aria-valuenow', '0');
  });
});

test.describe('タスク: 削除', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('× で行削除・進捗更新', async ({ page }) => {
    await addTask(page, 'A');
    await addTask(page, 'B');
    await page.locator('#task-list li').first().locator('button[aria-label="削除"]').click();
    await expect(page.locator('#task-list li')).toHaveCount(1);
    await expect(page.locator('#task-list li').first()).toContainText('B');
    await expect(page.locator('#task-progress-label')).toHaveText('0 / 1');
  });

  test('全削除で空表示が再表示・進捗 0/0', async ({ page }) => {
    await addTask(page, 'A');
    await page.locator('#task-list li').first().locator('button[aria-label="削除"]').click();
    await expect(page.locator('#task-list li')).toHaveCount(0);
    await expect(page.locator('#task-empty')).toBeVisible();
    await expect(page.locator('#task-progress-label')).toHaveText('0 / 0');
  });
});

test.describe('タスク: 永続化', () => {
  test('追加・完了してリロードすると復元される', async ({ page }) => {
    await gotoApp(page);
    await addTask(page, '残すタスク1');
    await addTask(page, '残すタスク2');
    await page.locator('#task-list li').first().locator('input[type="checkbox"]').check();

    await expect
      .poll(async () => page.evaluate((k) => localStorage.getItem(k), TASKS_KEY))
      .not.toBeNull();

    await page.reload();
    await expect(page.locator('#timer')).toHaveText(/^\d{2}:\d{2}$/);
    await expect(page.locator('#task-list li')).toHaveCount(2);
    await expect(page.locator('#task-list li').first()).toContainText('残すタスク1');
    await expect(page.locator('#task-progress-label')).toHaveText('1 / 2');
    await expect(
      page.locator('#task-list li').first().locator('input[type="checkbox"]')
    ).toBeChecked();
  });

  test('localStorage に {id,text,done}[] で保存される', async ({ page }) => {
    await gotoApp(page);
    await addTask(page, 'X');
    const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), TASKS_KEY);
    expect(Array.isArray(stored)).toBe(true);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toHaveProperty('id');
    expect(stored[0]).toHaveProperty('text', 'X');
    expect(stored[0]).toHaveProperty('done', false);
  });

  test('壊れた localStorage 値でも落ちず空リストで起動', async ({ page }) => {
    const errors = [];
    await gotoApp(page, { localStorage: { [TASKS_KEY]: '{not valid json' } });
    page.on('pageerror', (e) => errors.push(String(e)));
    await expect(page.locator('#task-empty')).toBeVisible();
    await expect(page.locator('#task-list li')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe('タスク: XSS 安全性', () => {
  test('タグ文字列はテキストとして表示され HTML 実行されない', async ({ page }) => {
    await gotoApp(page);
    const payload = '<img src=x onerror="window.__xss=1">';
    await addTask(page, payload);

    // テキストとしてそのまま表示
    await expect(page.locator('#task-list li').first().locator('span')).toHaveText(payload);
    // img 要素は生成されない
    await expect(page.locator('#task-list li img')).toHaveCount(0);
    // onerror も発火しない
    const xss = await page.evaluate(() => window.__xss);
    expect(xss).toBeUndefined();
  });

  test('script タグ文字列も実行されずテキスト表示', async ({ page }) => {
    await gotoApp(page);
    const payload = '<script>window.__xss2=1<\/script>';
    await addTask(page, payload);
    await expect(page.locator('#task-list li').first().locator('span')).toHaveText(payload);
    await expect(page.locator('#task-list li script')).toHaveCount(0);
    const xss = await page.evaluate(() => window.__xss2);
    expect(xss).toBeUndefined();
  });
});

test.describe('タスク: a11y / UX', () => {
  test('チェックボックスと削除ボタンに aria-label がある', async ({ page }) => {
    await gotoApp(page);
    await addTask(page, 'A');
    const li = page.locator('#task-list li').first();
    await expect(li.locator('input[type="checkbox"]')).toHaveAttribute('aria-label', '完了');
    await expect(li.locator('button')).toHaveAttribute('aria-label', '削除');
  });

  test('Enter キーで追加できる（form submit）', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#task-input').fill('Enterで追加');
    await page.locator('#task-input').press('Enter');
    await expect(page.locator('#task-list li')).toHaveCount(1);
    await expect(page.locator('#task-list li').first()).toContainText('Enterで追加');
  });
});
