// PomodoroTimer ページ (MAIN world) と拡張の service worker を橋渡しする中継スクリプト。
//
// content.js は world:"MAIN" で走るためページ JS から同期的に見える代わりに
// chrome.runtime.* を触れない。逆にこのファイルは既定の ISOLATED world で走るので
// chrome.runtime.sendMessage が使える。両者を window.postMessage で繋ぐ。
//
// ページ側 → 拡張:
//   window.postMessage({ __pomodoroYt: true, type: 'MARK_WATCHED',
//                        videoId, durationSeconds, requestId }, '*')
// 拡張 → ページ側:
//   window.postMessage({ __pomodoroYtResult: true, requestId, ok, detail }, '*')

window.addEventListener('message', (ev) => {
    // 同一ウィンドウ発の自前メッセージだけを受ける (他オリジンの iframe を無視)
    if (ev.source !== window) return;
    const data = ev.data;
    if (!data || data.__pomodoroYt !== true || data.type !== 'MARK_WATCHED') return;

    const reply = (payload) => {
        window.postMessage(
            Object.assign({ __pomodoroYtResult: true, requestId: data.requestId }, payload),
            '*'
        );
    };

    try {
        chrome.runtime
            .sendMessage({
                type: 'MARK_WATCHED',
                videoId: data.videoId,
                durationSeconds: data.durationSeconds,
            })
            .then((res) => reply({ ok: !!(res && res.ok), detail: res || null }))
            .catch((e) => reply({ ok: false, error: String((e && e.message) || e) }));
    } catch (e) {
        // 拡張が更新/無効化された直後は sendMessage 自体が同期 throw する
        reply({ ok: false, error: String((e && e.message) || e) });
    }
});
