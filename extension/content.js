// PomodoroTimer ページから拡張のインストール状態を検出するためのマーカー。
// MAIN world (manifest の world: "MAIN") で document_start に走るため、
// ページの JS から同期的に window.__POMODORO_YT_EXTENSION__ を参照できる。
// features: ページ側が「この拡張で使える機能」を判定するための一覧。
//   'collect' … ページ内ボタンからの YouTube タブ取り込み (COLLECT_YT_TABS, 0.3.0〜)
window.__POMODORO_YT_EXTENSION__ = { installed: true, version: '0.3.0', features: ['mark-watched', 'collect'] };
window.dispatchEvent(new CustomEvent('pomodoro-yt-extension-ready', {
    detail: { version: '0.3.0' },
}));
