# CLAUDE.md

ポモドーロタイマー（静的サイト）の開発ガイド。

## 構成
- `index.html` … 画面。Bootstrap 5（CDN）。
- `PomodoroTimerController.js` … 状態機械（`STATUS_ENUM`）・ボタン制御・音源切替・YouTube 再生リスト・Wake Lock・拡張モーダル。
- `MusicManager.js` … `MusicManager`（audio 要素）/ `VoicyManager`（iframe）/ `YouTubeManager`（IFrame API）/ `LocalMediaManager`（ローカルの音源・動画。先頭を再生し終わったら末尾へ回す「ロケットえんぴつ式」）。
- `extension/` … Chrome 拡張。YouTube タブの一括追加と、見終わった動画の再生履歴への記録 (履歴書き込み API は存在しないため、バックグラウンドタブで実再生する)。
- `qa/` … QA / Playwright 一式（**アプリ本体ではない**）。`qa/README.md` 参照。

## 🔁 QAルール（必須・このリポジトリの取り決め）

**アプリのソース（`index.html` / `PomodoroTimerController.js` / `MusicManager.js` / `extension/` 配下）を修正したら、修正完了後に必ず再検証する。ただし範囲は「今回の変更に影響する spec」に限る（下記）。**

### 実行範囲: 変更箇所に影響する spec だけ（2026-08-29 決定）

**全件実行（`npx playwright test` の引数なし）はしない。** 工数削減のため、既存機能の
回帰テストは回さず、**今回いじった箇所に影響する spec だけ**をファイル指定で実行する。

```bash
cd qa && npx playwright test tests/11-gcal-silent-auth.spec.js   # 例: 認証まわりを直したとき
```

対象 spec の選び方:
- 変更した機能に対応する spec（下の対応表）。
- 変更で**壊れうる** spec（同じ DOM / localStorage キー / 共通 fixture を触る場合）。
  例: `index.html` のレイアウトを変えた → `_explore-newfeatures.spec.js`。
  `tests/fixtures.js` を変えた → その fixture を使う spec は影響範囲なので回す。
- 新しい挙動を足したら、**その挙動の spec を新規に足す**（既存 spec の素通りを防ぐ）。
  可能なら「入れた実装を一時的に外すと落ちるか」を 1 回だけ確かめて検出力を確認する。

spec 対応表:
| 変更した場所 | 回す spec |
| --- | --- |
| タイマーの状態機械・ボタン | `01-timer-buttons` / `04-timer-drift` |
| 音源切替・BGM | `02-audio-sources` / `10-bgm-playback-rate-lock` |
| YouTube 再生リスト・モード | `03-youtube-queue` / `05-youtube-mode-progress` |
| カレンダーの描画・チェック | `06-gcal-checklist` / `09-gcal-fixes` / `12-gcal-birthday-event` |
| カレンダーの認証・トークン | `07-gcal-auth-persist` / `11-gcal-silent-auth` / `08-gcal-nomock-smoke` |
| ローカルファイル再生・一覧 | `13-local-media`（音源切替も触るなら `02-audio-sources`） |
| 画面レイアウト・サイドバー | `_explore-newfeatures` |

ハマりどころ:
- 設定は**選んでいる音源の分だけ**表示する。spec で Voicy URL / YouTube 一覧 /
  ローカル一覧を触るときは、先に `#work-source` などでその音源を選ぶこと。
- 設定アコーディオンは既定で畳まれている。`gotoApp` が `pomodoro_sidebar_panels` を
  seed して開いた状態から始める（`openSettings: false` で素の状態にできる）。
- ローカルファイルの一覧は IndexedDB (`pomodoro-local-media`) に保存する。
  書き込みは非同期なので、リロードを挟む spec は保存完了を待ってから reload する。
- Playwright の Chromium は `showOpenFilePicker` を**実装している**。フォールバック経路
  （`<input type="file">`）を試すときは `delete window.showOpenFilePicker` してから開く。

手順:
1. 開発エージェント（メイン）が修正を実装し、自分でビルド/起動の最低限確認をする。
2. **修正完了次第**、上の基準で選んだ spec だけを実行する。
   - テスター（`pomodoro-tester`）に依頼する場合も**範囲を明示して**渡す（対話では `@pomodoro-tester`）。
3. テスターは**バグを直さず**構造化レポート（`qa/reports/REPORT-YYYY-MM-DD.md`）で返す。
4. レポートを受けて開発エージェントが修正 → 再びテスターへ。**緑になるまでこのループを回す。**

全件実行してよいのは、本人から明示的に依頼されたときだけ。

役割分担（厳守）:
- **テスターはアプリのソースを絶対に修正しない**（読み取り＋テストのみ。書き込みは `qa/` 配下だけ）。アプリの修正はすべて開発エージェントが行う。
- 仕様が曖昧な指摘は、テスターが「要・認識合わせ」として質問 → 開発エージェントが期待挙動を確定してからテストに反映。
- 判断軸は常に **UX 体験の最適化**。

詳細なエージェント定義は `.claude/agents/pomodoro-tester.md`、テスト手順・連携テンプレは `qa/README.md`。

## テスト実行メモ
- 静的サーバはポート 5500（`qa/playwright.config.js` の webServer が `python3 -m http.server 5500` を起動、既存の Live Server があれば再利用）。
- 外部依存（gtag / YouTube IFrame API・サムネ / Voicy）は `qa/tests/fixtures.js` でブロックして決定論化。実 YouTube/Voicy・Wake Lock は `cd qa && npm run test:headed` で手動確認。
