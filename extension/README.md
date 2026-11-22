# PomodoroTimer YouTube Collector

開いている YouTube 動画タブの URL を PomodoroTimer の再生リストに一括追加し、
追加が成功したタブは自動で閉じる Chrome 拡張機能 (Manifest V3)。
あわせて、PomodoroTimer で見終わった動画を YouTube の再生履歴に記録する。

対象 PomodoroTimer: <https://fujimotomasahiro.github.io/PomodoroTimer/>

## なぜ拡張機能か

純粋な Web ページからは、ブラウザのセキュリティ仕様により以下が **原理的に不可能**:

- 他タブの URL を読む
- 開いている全タブを列挙する
- ユーザーが開いたタブを `close()` する

`chrome.tabs.query` / `chrome.tabs.remove` を利用できる拡張機能でのみ実現可能。

## インストール (開発者モード)

1. Chrome (または Edge / Brave 等の Chromium 系) で `chrome://extensions/` を開く
2. 右上の **「デベロッパーモード」** を ON
3. **「パッケージ化されていない拡張機能を読み込む」** をクリック
4. このリポジトリの `extension/` ディレクトリを選択

## 使い方

1. 追加したい YouTube 動画タブを必要なだけ開いておく
   (対応 URL: `youtube.com/watch?v=`, `m.youtube.com/watch?v=`, `youtu.be/...`)
2. PomodoroTimer タブをアクティブにする
3. ツールバーの拡張アイコンをクリック
   (または、設定の「YouTube 再生リスト」右にある **「開いているYouTube動画を取り込む」** ボタンを押す)
4. 再生リストに URL が追加され、対象 YouTube タブが閉じられる

### ページ内ボタン (0.3.0〜)

ページ内ボタンは `relay.js` 経由で service worker に `COLLECT_YT_TABS` を送り、
アイコンクリックと同じ処理 (`collectYouTubeTabs`) を実行する。結果は通知ではなく
ボタンの下に表示する。拡張が未インストールならインストール案内モーダルを、
0.3.0 より古い拡張 (`window.__POMODORO_YT_EXTENSION__.features` に `collect` が無い)
なら更新の案内を表示する。

**更新時の注意:** 開発者モードで読み込んでいる場合、リポジトリを pull したあと
`chrome://extensions/` で本拡張の「再読み込み」ボタンを押し、PomodoroTimer タブも
再読み込みする。

## 動作仕様

- PomodoroTimer タブの判定は `window.PomodoroTimer.addYouTubeUrls` フックの存在で行う
- 既に再生リストにある動画 ID は **重複追加されない** (`extractVideoId` で正規化して比較)
- `added == 0` のとき (= 全て重複 / 全て無効) はタブを閉じない
- 末尾の空入力欄は常に 1 つ保持される
- インストール検出用に `content.js` が PomodoroTimer ページの MAIN world で
  `window.__POMODORO_YT_EXTENSION__ = { installed: true, version }` を立てる。
  PomodoroTimer ページはこれを見て、未インストール時にインストール案内モーダルを表示する。

## 視聴済みマーク (再生履歴への記録)

PomodoroTimer で動画を最後まで再生すると、その動画を YouTube の再生履歴に
「視聴済み」として記録する。

### なぜ拡張機能が必要か

- **YouTube Data API v3 には再生履歴へ書き込む手段が存在しない。**
  API リファレンスに履歴のリソース/メソッドが無く、かつて `channels.list` が返した
  `relatedPlaylists.watchHistory` も現在の公式ドキュメントから記載が削除されている。
- PomodoroTimer の IFrame 埋め込み再生はサードパーティ扱いのため履歴に残らない (実測)。

したがって「ログイン済みの youtube.com 上で実際に再生する」しかなく、
そのためのタブ操作は拡張機能でしか行えない。

### 動作仕様

1. ページ側が `window.postMessage({ __pomodoroYt: true, type: 'MARK_WATCHED', ... })` を送る
2. `relay.js` (ISOLATED world) が受けて service worker に転送する
3. service worker が `chrome.tabs.create({ active: false })` で
   `watch?v=<id>&t=<尺-30秒>` をバックグラウンドタブとして開く
4. タブをミュートし、`<video>` を `muted = true` にしてから `play()` を呼ぶ
   (ミュート再生は Chrome の autoplay policy で無条件に許可されるため、
   非表示タブで自動再生がブロックされても確実に再生できる)
5. 再生開始を確認したら**終端の 4 秒手前へシークする**
6. 終端の 2 秒手前まで来たら pause する (この pause で watchtime ping が飛び、
   その位置が履歴に記録される)。1 ポーリング分待ってタブを閉じる

### 実測メモ

- **★実時間で終端まで再生させる方式は使えない。**
  バックグラウンドタブは再生がスロットリングされ、19 秒の動画が 60 秒経っても
  9.8 秒までしか進まなかった。そのためシークで位置を進め、実再生は数秒に留める。
  この変更で 1 本あたり 60 秒タイムアウト → 8 秒完了になった。
- **終端まで再生し切る必要はない。** 終端の 2 秒手前で止めれば進捗バーは満タンになる
  (3.6 秒手前で止めた例でも満タンを確認)。
- **★履歴ページへの反映には数十秒〜数分の遅延がある。**
  再生直後に確認すると進捗バーが最小幅 (13% 相当) のままに見えるため、
  「終端まで再生しないとバーが伸びない」と誤診しやすい。直後の値で判断しないこと。
- 複数本が同時に走らないよう service worker 側で直列化している。

## ファイル構成

```
extension/
├── manifest.json  # MV3 マニフェスト
├── background.js  # service worker (YouTube タブ取り込み / 視聴済みマーク)
├── content.js     # PomodoroTimer ページに注入されるインストールマーカー (MAIN world)
├── relay.js       # ページ ⇔ service worker の橋渡し (ISOLATED world)
├── icons/         # 拡張アイコン (16/48/128)
└── README.md      # このファイル
```

## プライバシー

外部サーバーへの通信は一切なく、個人情報・利用データの収集も保存もしません。
すべての処理はブラウザ内で完結します。

## スコープ外

- YouTube ショート (`/shorts/`) / プレイリスト (`list=`) / チャンネル URL の自動展開
- タブクローズ前の確認ダイアログ
- Firefox / Edge への正式対応 (MV3 互換だが個別検証は別途)
- ローカル `file://` 環境への対応 (GitHub Pages 配信版のみ対象)
