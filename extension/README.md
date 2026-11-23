# PomodoroTimer YouTube Collector

開いている YouTube 動画タブの URL を PomodoroTimer の再生リストに一括追加し、
追加が成功したタブは自動で閉じる Chrome 拡張機能 (Manifest V3)。
あわせて、PomodoroTimer で見終わった動画を YouTube の再生履歴に記録する。

対象 PomodoroTimer: <https://pomodorotimer.manabicodelab.com/>（旧 URL <https://fujimotomasahiro.github.io/PomodoroTimer/> も対象）

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
4. 再生リストに URL が追加され、対象 YouTube タブが閉じられる

## 動作仕様

- PomodoroTimer タブの判定は `window.PomodoroTimer.addYouTubeUrls` フックの存在で行う
- 既に再生リストにある動画 ID は **重複追加されない** (`extractVideoId` で正規化して比較)
- `added == 0` のとき (= 全て重複 / 全て無効) はタブを閉じない
- 末尾の空入力欄は常に 1 つ保持される
- インストール検出用に `content.js` が PomodoroTimer ページの MAIN world で
  `window.__POMODORO_YT_EXTENSION__ = { installed: true, version }` を立てる。
  PomodoroTimer ページはこれを見て、未インストール時にインストール案内モーダルを表示する。

## ツールバーアイコンに残り時間を表示

PomodoroTimer のタイマーが動いている間、ツールバーの拡張アイコンを残り時間の表示に差し替える。

- アイコンの上段に「分」、下段に「秒」を 2 段で描く (例: `24` / `59` → 24:59)。
  Chrome のバッジ (`setBadgeText`) は 4 文字程度しか入らず `24:59` が切れるため、
  アイコン画像そのものを `OffscreenCanvas` で描いて `chrome.action.setIcon` で差し替えている。
- 背景色でフェーズを区別する: 作業中 = 青 / 休憩中・長時間休憩中 = 緑 / 一時停止中 = 黄。
- マウスを乗せると「作業中 残り 24:59」のように 1 行のツールチップが出る。
- 待機中に戻したとき・PomodoroTimer タブを閉じた / リロードしたときは元のアイコンに戻る。
- アイコンをクリックしたときの動作 (YouTube タブの一括追加) は変わらない。
- 仕組み: ページ (`PomodoroTimerController.js`) が状態変化時と毎秒 `TIMER_STATE` を
  `postMessage` → `relay.js` → service worker (`timer-icon.js`) へ中継。動作中は終了時刻から
  service worker 側でも毎秒計算し直すため、ページがバックグラウンドで間引かれても表示は進む。
  一時停止中の状態は `chrome.storage.session` に残し、service worker の休止後も復元する。
- ツールバーにアイコンが出ていない場合は、パズルアイコン (拡張機能メニュー) からピン留めする。

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
├── background.js  # service worker (アイコンクリック処理 / 視聴済みマーク)
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
