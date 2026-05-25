# CLAUDE.md

ポモドーロタイマー（静的サイト）の開発ガイド。

## 構成
- `index.html` … 画面。Bootstrap 5（CDN）。
- `PomodoroTimerController.js` … 状態機械（`STATUS_ENUM`）・ボタン制御・音源切替・YouTube 再生リスト・Wake Lock・拡張モーダル。
- `MusicManager.js` … `MusicManager`（audio 要素）/ `VoicyManager`（iframe）/ `YouTubeManager`（IFrame API）。
- `extension/` … YouTube タブ一括追加の Chrome 拡張。
- `qa/` … QA / Playwright 一式（**アプリ本体ではない**）。`qa/README.md` 参照。

## 🔁 QAルール（必須・このリポジトリの取り決め）

**アプリのソース（`index.html` / `PomodoroTimerController.js` / `MusicManager.js` / `extension/` 配下）を修正したら、修正完了後に必ずテスターエージェントへサイトを投げて再検証する。**

手順:
1. 開発エージェント（メイン）が修正を実装し、自分でビルド/起動の最低限確認をする。
2. **修正完了次第**、テスター（`pomodoro-tester`）に再検証を依頼する。
   - 対話では `@pomodoro-tester` を呼ぶ。
   - 最低限の自動確認は `cd qa && npx playwright test`（変更領域に対応する spec を重点的に）。
3. テスターは**バグを直さず**構造化レポート（`qa/reports/REPORT-YYYY-MM-DD.md`）で返す。
4. レポートを受けて開発エージェントが修正 → 再びテスターへ。**緑になるまでこのループを回す。**

役割分担（厳守）:
- **テスターはアプリのソースを絶対に修正しない**（読み取り＋テストのみ。書き込みは `qa/` 配下だけ）。アプリの修正はすべて開発エージェントが行う。
- 仕様が曖昧な指摘は、テスターが「要・認識合わせ」として質問 → 開発エージェントが期待挙動を確定してからテストに反映。
- 判断軸は常に **UX 体験の最適化**。

詳細なエージェント定義は `.claude/agents/pomodoro-tester.md`、テスト手順・連携テンプレは `qa/README.md`。

## テスト実行メモ
- 静的サーバはポート 5500（`qa/playwright.config.js` の webServer が `python3 -m http.server 5500` を起動、既存の Live Server があれば再利用）。
- 外部依存（gtag / YouTube IFrame API・サムネ / Voicy）は `qa/tests/fixtures.js` でブロックして決定論化。実 YouTube/Voicy・Wake Lock は `cd qa && npm run test:headed` で手動確認。
