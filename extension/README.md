# PomodoroTimer YouTube Collector

開いている YouTube 動画タブの URL を、PomodoroTimer の再生リストに一括追加し、
追加が成功したタブは自動で閉じる Chrome 拡張機能 (Manifest V3)。

対象 PomodoroTimer: <https://fujimotomasahiro.github.io/PomodoroTimer/>

## なぜ拡張機能か

純粋な Web ページからは、ブラウザのセキュリティ仕様により以下が **原理的に不可能**:

- 他タブの URL を読む
- 開いている全タブを列挙する
- ユーザーが開いたタブを `close()` する

`chrome.tabs.query` / `chrome.tabs.remove` を利用できる拡張機能でのみ実現可能。

## インストール

### 推奨: Chrome Web Store (公開後)

ストアからインストールしてください (リンクは公開後に追記)。

### 開発者モード (ストア提出前 / ローカルテスト用)

1. Chrome (または Edge / Brave 等の Chromium 系) で `chrome://extensions/` を開く
2. 右上の **「デベロッパーモード」** を ON
3. **「パッケージ化されていない拡張機能を読み込む」** をクリック
4. このリポジトリの `extension/` ディレクトリを選択

## 使い方

1. 追加したい YouTube 動画タブを必要なだけ開いておく
   (対応 URL: `youtube.com/watch?v=`, `m.youtube.com/watch?v=`, `youtu.be/...`)
2. PomodoroTimer タブをアクティブにする
3. ツールバーの拡張アイコンをクリック
4. 再生リストに URL が追加され、対象 YouTube タブが閉じられる

## 動作仕様

- PomodoroTimer タブの判定は `window.PomodoroTimer.addYouTubeUrls` フックの存在で行う
- 既に再生リストにある動画 ID は **重複追加されない** (`extractVideoId` で正規化して比較)
- `added == 0` のとき (= 全て重複 / 全て無効) はタブを閉じない
- 末尾の空入力欄は常に 1 つ保持される
- インストール検出用に `content.js` が PomodoroTimer ページの MAIN world で
  `window.__POMODORO_YT_EXTENSION__ = { installed: true, version }` を立てる。
  PomodoroTimer ページはこれを見て、未インストール時にインストール案内モーダルを表示する。

## ファイル構成

```
extension/
├── manifest.json    # MV3 マニフェスト
├── background.js    # service worker (アイコンクリック処理)
├── content.js       # PomodoroTimer ページに注入されるインストールマーカー
├── icons/           # 拡張アイコン (16/48/128)
├── privacy.html     # プライバシーポリシー (GitHub Pages で配信)
├── README.md        # このファイル
└── STORE_LISTING.md # ストア提出用の掲載文ドラフト (配布物には含めない)
```

## プライバシー

外部サーバーへの通信は一切なく、個人情報・利用データの収集も保存もしません。
詳細: <https://fujimotomasahiro.github.io/PomodoroTimer/extension/privacy.html>

## スコープ外

- YouTube ショート (`/shorts/`) / プレイリスト (`list=`) / チャンネル URL の自動展開
- タブクローズ前の確認ダイアログ
- Firefox / Edge への正式対応 (MV3 互換だが個別検証は別途)
- ローカル `file://` 環境への対応 (Chrome Web Store ポリシーに沿って GitHub Pages 配信のみ)
