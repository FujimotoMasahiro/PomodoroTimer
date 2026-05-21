# PomodoroTimer YouTube Collector

開いている YouTube 動画タブの URL を、PomodoroTimer の再生リストに一括追加し、
追加が成功したタブは自動で閉じる Chrome 拡張機能 (Manifest V3)。

## なぜ拡張機能か

純粋な Web ページからは、ブラウザのセキュリティ仕様により以下が **原理的に不可能**:

- 他タブの URL を読む
- 開いている全タブを列挙する
- ユーザーが開いたタブを `close()` する

`chrome.tabs.query` / `chrome.tabs.remove` を利用できる拡張機能でのみ実現可能。

## インストール

1. Chrome (または Edge / Brave 等の Chromium 系) で `chrome://extensions/` を開く
2. 右上の **「デベロッパーモード」** を ON
3. **「パッケージ化されていない拡張機能を読み込む」** をクリック
4. このリポジトリの `extension/` ディレクトリを選択
5. PomodoroTimer を `file://` で開いている場合は、拡張一覧で本拡張の「詳細」を開き、
   **「ファイルの URL へのアクセスを許可」** を ON にする

## 使い方

1. 追加したい YouTube 動画タブを必要なだけ開いておく
   (対応 URL: `youtube.com/watch?v=`, `m.youtube.com/watch?v=`, `youtu.be/...`)
2. PomodoroTimer タブをアクティブにする
3. ツールバーの拡張アイコンをクリック
4. 再生リストに URL が追加され、対象 YouTube タブが閉じられる

## 動作仕様

- PomodoroTimer タブの判定は `window.PomodoroTimer.addYouTubeUrls` フックの存在で行う
  (URL ハードコード無しのため `file://` / `localhost` / GitHub Pages いずれでも動く)
- 既に再生リストにある動画 ID は **重複追加されない**
  (`extractVideoId` で正規化して比較)
- `added == 0` のとき (= 全て重複 / 全て無効) はタブを閉じない
- 末尾の空入力欄は常に 1 つ保持される
- インストール検出用に `content.js` が全ページの MAIN world で
  `window.__POMODORO_YT_EXTENSION__ = { installed: true, version }` を立てる。
  PomodoroTimer ページはこれを見て、未インストール時にインストール案内モーダルを表示する。

## スコープ外

- YouTube ショート (`/shorts/`) / プレイリスト (`list=`) / チャンネル URL の自動展開
- タブクローズ前の確認ダイアログ
- Chrome Web Store 公開 (デベロッパーモード読み込みのみ想定)
