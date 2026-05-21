// PomodoroTimer ページから拡張のインストール状態を検出するためのマーカー。
// MAIN world (manifest の world: "MAIN") で document_start に走るため、
// ページの JS から同期的に window.__POMODORO_YT_EXTENSION__ を参照できる。
window.__POMODORO_YT_EXTENSION__ = { installed: true, version: '0.1.0' };
window.dispatchEvent(new CustomEvent('pomodoro-yt-extension-ready', {
    detail: { version: '0.1.0' },
}));
