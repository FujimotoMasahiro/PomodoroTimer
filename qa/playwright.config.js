import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// リポジトリ root（index.html がある場所）を静的サーバの公開ディレクトリにする
const REPO_ROOT = path.resolve(__dirname, '..');
const PORT = 5500;

export default defineConfig({
  testDir: './tests',
  // バグレポート用のスクショ/動画/トレースの保存先
  outputDir: './reports/test-artifacts',
  fullyParallel: false, // 状態機械を順に検証するため直列
  // 1 worker に固定。実時刻ベースの timer-drift spec は CPU 競合に弱く、
  // 複数 worker で並列実行すると visibilitychange 等のタイミング検証が flaky になる。
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: './reports/playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // 自動再生をユーザー操作なしで許可（audio の paused 検証を安定させる）
        launchOptions: { args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] },
      },
    },
  ],
  // リポジトリ root を Python の簡易 HTTP サーバで配信（追加 npm 依存なし）
  webServer: {
    command: `python3 -m http.server ${PORT}`,
    cwd: REPO_ROOT,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
