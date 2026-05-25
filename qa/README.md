# QA / テスト一式（pomodoro-tester エージェント専用）

このディレクトリは **テスト専用**です。アプリ本体（`../index.html`, `../*.js`, `../extension/`）のコードはここには置かず、**修正もしません**。
バグは「直さず」レポートにして、開発エージェント（メインセッション）へ引き渡します。

## セットアップ

```bash
cd qa
npm install
npx playwright install chromium
```

## 実行

```bash
npm test            # 全テスト（ヘッドレス）
npm run test:headed # ブラウザを見ながら
npm run report      # 直近の HTML レポートを開く
npx playwright test 03-youtube-queue   # 個別
```

- 静的サーバは `playwright.config.js` の `webServer` が `python3 -m http.server 5500`（リポジトリ root を配信）を自動起動します。VSCode Live Server を 5500 で立てっぱなしでも `reuseExistingServer` で再利用します。
- 外部依存（gtag / YouTube IFrame API・サムネ / Voicy）は `tests/fixtures.js` でブロックして決定論化しています。Bootstrap CDN だけは通します（モーダル表示の確認に必要）。本物の YouTube/Voicy 再生を見たいときは `--headed` で手動探索してください。

## 開発エージェントとの連携（「やりとり」ルール）

テスターは **直接コードを修正しません**。流れは次の通り：

1. **認識合わせ** — 仕様が曖昧な観点は、テスト前に期待挙動を 1 行で言語化し、開発エージェントに確認 → 各テストの `expected` に反映。
2. **検証** — Playwright を実行。失敗・異常は再現手順・証拠（スクショ / console / network / テスト名）を固める。
3. **バグレポート** — 下記テンプレで `reports/REPORT-YYYY-MM-DD.md` に追記（1 件 = 1 ブロック）。
4. **引き渡し** — 呼び出し元への最終メッセージに「テスト数 / pass / fail・新規&未解決バグ一覧（ID と severity）・レポートパス」を必ず書く。
5. **再検証ループ** — 開発エージェントが修正したら該当バグを再実行し `fixed ✅ / 再現 ❌` を返す。直ったら `resolved` に更新。

### バグレポート テンプレート

```
## [BUG-001] <一行サマリ>
- severity: blocker | high | medium | low | ux-nit
- area: timer / audio / youtube / voicy / persistence / ux / a11y
- repro:
  1. ...
  2. ...
- expected: <開発エージェントと合意した期待挙動>
- actual: <実際の挙動 / console ログ / スクショパス>
- evidence: reports/test-artifacts/..., テスト名
- 仮説(任意): <原因の見立て。ただし修正はしない>
- status: open | resolved
```

## ディレクトリ

```
qa/
├── package.json
├── playwright.config.js
├── tests/
│   ├── fixtures.js              共通ヘルパー（外部依存ブロック / 状態ヘルパー）
│   ├── 01-timer-buttons.spec.js タイマー状態機械・ボタン可視性・console エラー
│   ├── 02-audio-sources.spec.js 音源切替・アクティブ音源カード・永続化
│   └── 03-youtube-queue.spec.js YouTube 再生リスト・extractVideoId・拡張フック・モーダル
└── reports/                     バグレポート / スクショ / Playwright レポート
```
