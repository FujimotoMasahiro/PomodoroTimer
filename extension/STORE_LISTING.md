# Chrome Web Store 掲載文ドラフト

ストア提出フォームに貼り付ける用の文言と、提出時に求められる Justification (権限の正当化) をまとめたメモ。

---

## 1. ストア基本情報

| 項目 | 値 |
|---|---|
| Name | PomodoroTimer YouTube Collector |
| Summary (短) | 開いている YouTube タブを PomodoroTimer の再生リストへ一括追加 |
| Category | Productivity (生産性) |
| Language | 日本語 (primary) |
| 公式ページ | https://fujimotomasahiro.github.io/PomodoroTimer/ |
| サポート URL | https://github.com/FujimotoMasahiro/PomodoroTimer/issues |
| プライバシーポリシー URL | https://fujimotomasahiro.github.io/PomodoroTimer/extension/privacy.html |

## 2. 詳細説明 (Description)

```
PomodoroTimer (https://fujimotomasahiro.github.io/PomodoroTimer/) の
YouTube 再生リスト機能と連携する Chrome 拡張機能です。

■ できること
作業用 BGM に使いたい YouTube 動画を別タブで開いておき、
拡張アイコンをワンクリック ─ これだけで、開いている全 YouTube 動画タブが
PomodoroTimer の再生リストに自動追加され、追加が成功した YouTube タブは
自動で閉じられます。

■ こんなときに便利
・複数の YouTube 動画を BGM として連続再生したい
・URL を 1 件ずつコピペするのが面倒
・聴き終わったタブの後片付けをまとめてやりたい

■ 使い方
1. 追加したい YouTube 動画タブを必要なだけ開く
   (対応 URL: youtube.com/watch, m.youtube.com/watch, youtu.be/...)
2. PomodoroTimer タブをアクティブにする
3. ツールバーの拡張アイコンをクリック
   → 再生リストに URL が追加され、対象タブが自動で閉じる

■ プライバシー
本拡張機能は外部サーバーへの通信を一切行わず、
個人情報・利用データの収集も送信も保存もしません。
すべての処理はブラウザ内で完結します。
詳細: https://fujimotomasahiro.github.io/PomodoroTimer/extension/privacy.html

■ 動作要件
PomodoroTimer (https://fujimotomasahiro.github.io/PomodoroTimer/) を
別タブで開いた状態で使用してください。
```

## 3. 権限の正当化 (Single Purpose & Permission Justification)

ストア提出時に必須の質問への回答ドラフト。

### Single purpose description
> 開いている YouTube 動画タブの URL を、ユーザーが指定した PomodoroTimer ページの再生リストに一括追加し、追加が成功した YouTube タブを自動的に閉じる。これ以外の機能は持たない。

### `tabs` permission justification
> 開いている YouTube watch ページのタブ URL を `chrome.tabs.query` で取得するため。取得した URL は同一ブラウザ内の PomodoroTimer タブにのみ渡し、外部送信は行わない。

### `scripting` permission justification
> ユーザーがアクティブにしている PomodoroTimer タブに対し、`chrome.scripting.executeScript` で取得済み URL 配列を引数にしてページ側のフック関数 `window.PomodoroTimer.addYouTubeUrls` を呼び出すため。

### `activeTab` permission justification
> 拡張アイコンクリック (user gesture) 時にだけアクティブタブへ一時的にアクセスし、それが PomodoroTimer ページかを判定するため。常時のホスト権限を回避する目的で `activeTab` を採用している。

### `notifications` permission justification
> 「N 件追加し M タブを閉じました」「YouTube タブが見つかりません」等の処理結果をユーザーに通知するため。

### `host_permissions` (youtube.com / youtu.be) justification
> `chrome.tabs.query({ url: ... })` で YouTube watch タブを列挙するために必要。これらのドメイン以外へのアクセスは行わない。

### Remote code use
> 使用しない。すべてのロジックは拡張パッケージに同梱された JS のみ。

### Data usage disclosure
> "I do not collect or transmit user data."

## 4. スクリーンショット案 (1280×800 を 3〜5 枚)

1. PomodoroTimer の YouTube 再生リスト UI (空欄 1 行の状態)
2. YouTube タブを 3〜5 個開いてる状態 (タブストリップが見える画面)
3. 拡張アイコンをクリックした直後 (リストに URL が並んだ状態 + サムネ表示)
4. 完了通知のトースト (右下に「N 件追加し M タブを閉じました」)
5. (任意) 再生中の状態

## 5. 提出前チェックリスト

- [ ] $5 デベロッパー登録完了 (https://chrome.google.com/webstore/devconsole/)
- [ ] `extension/` を zip 化 (`.git` / `STORE_LISTING.md` は zip から除外)
- [ ] manifest の `version` を上げてリリースごとに重複しないように
- [ ] GitHub Pages で `extension/privacy.html` がアクセス可能なことを確認
- [ ] スクリーンショット 1280×800 を 3〜5 枚撮影
- [ ] アイコン 128×128 (`icons/icon-128.png`) がストア掲載用にも見栄え良いか確認
- [ ] 上記 Description 文を貼り付け
- [ ] 上記 Justification 文を各項目に貼り付け
- [ ] Single purpose に上記文を貼り付け
- [ ] プライバシー > 「私は個人情報を収集していません」にチェック

## 6. zip 化コマンド (mac)

```sh
cd /Users/fujimotomasahiro/Documents/Claude/PomodoroTimer
zip -r pomodoro-youtube-collector.zip extension \
    -x 'extension/STORE_LISTING.md' 'extension/.DS_Store' 'extension/**/.DS_Store'
```

このスクリプトで生成された zip をストアにアップロード。
