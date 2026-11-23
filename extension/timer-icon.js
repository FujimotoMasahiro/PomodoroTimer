// ツールバーの拡張アイコンに PomodoroTimer の残り時間を表示する。
//
// Chrome のバッジ (setBadgeText) は 4 文字程度しか入らず "24:59" が切れるため、
// アイコン画像そのものを OffscreenCanvas で描いて setIcon で差し替える。
// 16px のアイコンに 5 文字は潰れて読めないので、上段に分・下段に秒の 2 段で描き、
// 背景色でフェーズ (作業 / 休憩 / 一時停止) を区別する。
// マウスを乗せたときのツールチップには "作業中 残り 24:59" を 1 行で出す。
//
// ページ (PomodoroTimerController.js) は状態が変わったときと毎秒 TIMER_STATE を送る。
// 動作中は終了時刻 (endTime) から service worker 側でも毎秒計算し直すため、
// バックグラウンドでページの tick が間引かれてもアイコンは 1 秒ごとに進む。

const DEFAULT_TITLE = 'YouTube タブを PomodoroTimer に追加';

const PHASES = {
    work: { label: '作業中', bg: '#0d6efd', fg: '#ffffff' },
    break: { label: '休憩中', bg: '#198754', fg: '#ffffff' },
    longbreak: { label: '長時間休憩中', bg: '#198754', fg: '#ffffff' },
};
const PAUSED_COLORS = { bg: '#ffc107', fg: '#212529' };

let timerState = null;      // { phase, paused, endTime, remainingSeconds }
let timerTabId = null;      // 状態を送ってきた PomodoroTimer タブ
let tickId = null;
let lastDrawnKey = '';
let gotStateSinceStartup = false;

function remainingSecondsOf(state) {
    if (state.endTime) return Math.max(0, Math.ceil((state.endTime - Date.now()) / 1000));
    return Math.max(0, Number(state.remainingSeconds) || 0);
}

function formatMmSs(sec) {
    const mm = String(Math.floor(sec / 60)).padStart(2, '0');
    const ss = String(sec % 60).padStart(2, '0');
    return { mm, ss };
}

// size x size の ImageData に「上段 mm / 下段 ss」を描く。
function drawTimerIcon(size, mm, ss, colors) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const r = Math.round(size * 0.18);
    ctx.fillStyle = colors.bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, r);
    ctx.fill();

    ctx.fillStyle = colors.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 1 行の高さ = size/2。数字の字面が行いっぱいに近づくよう少し大きめに取る。
    const fontPx = Math.round(size * 0.52);
    ctx.font = `bold ${fontPx}px "Arial Narrow", Arial, Helvetica, sans-serif`;
    const maxWidth = size - 1;
    const cx = size / 2;
    ctx.fillText(mm, cx, size * 0.29, maxWidth);
    ctx.fillText(ss, cx, size * 0.77, maxWidth);
    return ctx.getImageData(0, 0, size, size);
}

async function renderTimer() {
    if (!timerState) return;
    const sec = remainingSecondsOf(timerState);
    const { mm, ss } = formatMmSs(sec);
    const phase = PHASES[timerState.phase];
    const colors = timerState.paused ? PAUSED_COLORS : phase;
    const key = `${timerState.phase}|${timerState.paused}|${mm}:${ss}`;
    if (key === lastDrawnKey) return;
    lastDrawnKey = key;
    const status = timerState.paused ? `${phase.label} (一時停止)` : phase.label;
    try {
        await chrome.action.setIcon({
            imageData: {
                16: drawTimerIcon(16, mm, ss, colors),
                32: drawTimerIcon(32, mm, ss, colors),
            },
        });
        await chrome.action.setTitle({ title: `${status} 残り ${mm}:${ss}\nクリック: ${DEFAULT_TITLE}` });
    } catch (_) { /* 描画に失敗しても本体機能には影響させない */ }
}

// 一時停止中はページから tick が来ないため、service worker が休止→再起動しても
// 表示を復元できるよう状態を storage.session (ブラウザ終了で消える) に残す。
function saveTimerState() {
    try {
        chrome.storage.session.set({ timerState, timerTabId }).catch(() => {});
    } catch (_) { /* 無視 */ }
}

async function clearTimerIcon() {
    timerState = null;
    timerTabId = null;
    saveTimerState();
    lastDrawnKey = '';
    if (tickId) { clearInterval(tickId); tickId = null; }
    try {
        await chrome.action.setIcon({
            path: { 16: 'icons/icon-16.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
        });
        await chrome.action.setTitle({ title: DEFAULT_TITLE });
    } catch (_) { /* 無視 */ }
}

function applyTimerState(state, tabId) {
    if (!state || !PHASES[state.phase]) {
        // 待機中: 別タブの PomodoroTimer が動いているなら、そちらの表示は消さない
        if (timerTabId === null || timerTabId === tabId) clearTimerIcon();
        return;
    }
    timerState = {
        phase: state.phase,
        paused: !!state.paused,
        endTime: state.endTime || null,
        remainingSeconds: state.remainingSeconds,
    };
    timerTabId = tabId;
    saveTimerState();
    renderTimer();
    // 動作中だけ自前で毎秒描き直す (setIcon の呼び出しで service worker も維持される)
    if (state.endTime && !state.paused) {
        if (!tickId) tickId = setInterval(renderTimer, 1000);
    } else if (tickId) {
        clearInterval(tickId);
        tickId = null;
    }
}

chrome.runtime.onMessage.addListener((msg, sender) => {
    if (!msg || msg.type !== 'TIMER_STATE') return undefined;
    gotStateSinceStartup = true;
    applyTimerState(msg, sender && sender.tab ? sender.tab.id : null);
    return undefined;
});

// PomodoroTimer タブを閉じた / 別ページへ移動・リロードしたら元のアイコンに戻す
chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === timerTabId) clearTimerIcon();
});
chrome.tabs.onUpdated.addListener((tabId, info) => {
    if (tabId === timerTabId && info.status === 'loading') clearTimerIcon();
});

// service worker の起動時: 休止からの再起動なら保存しておいた状態で描き直す。
// その間にページから新しい状態が届いていれば、そちらを優先する。
(async () => {
    let saved = null;
    try { saved = await chrome.storage.session.get(['timerState', 'timerTabId']); } catch (_) { /* 無視 */ }
    if (gotStateSinceStartup) return;
    if (saved && saved.timerState && saved.timerTabId != null) {
        try {
            await chrome.tabs.get(saved.timerTabId);
            applyTimerState(saved.timerState, saved.timerTabId);
            return;
        } catch (_) { /* タブが既に無い */ }
    }
    clearTimerIcon();
})();
