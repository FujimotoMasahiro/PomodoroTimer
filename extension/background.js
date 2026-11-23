importScripts('timer-icon.js');

// 拡張アイコンクリック時のメイン処理。
// アクティブタブが PomodoroTimer なら、開いている全 YouTube watch タブの URL を
// ページ側フック window.PomodoroTimer.addYouTubeUrls() に渡し、追加成功した
// 場合は対象の YouTube タブを閉じる。
chrome.action.onClicked.addListener(async (tab) => {
    if (!tab || !tab.id) return;

    // 1. アクティブタブが PomodoroTimer かをフックの存在で判定。
    //    フック window.PomodoroTimer.addYouTubeUrls はページ側スクリプトが
    //    MAIN world に立てているため、executeScript も world:'MAIN' で実行しないと
    //    isolated world の別 window が返ってきてフックが見えず誤判定する。
    let isPomodoroTab = false;
    try {
        const [result] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: () => typeof window?.PomodoroTimer?.addYouTubeUrls === 'function',
        });
        isPomodoroTab = !!(result && result.result);
    } catch (_) {
        // chrome:// 等 executeScript が拒否されるケース
    }

    if (!isPomodoroTab) {
        notify('PomodoroTimer タブをアクティブにしてから拡張アイコンを押してください。');
        return;
    }

    // 2. YouTube watch / shorts タブを列挙
    const ytTabs = await chrome.tabs.query({
        url: [
            '*://www.youtube.com/watch*',
            '*://www.youtube.com/shorts/*',
            '*://m.youtube.com/watch*',
            '*://m.youtube.com/shorts/*',
            '*://youtu.be/*',
        ],
    });

    if (ytTabs.length === 0) {
        notify('開いている YouTube 動画タブが見つかりませんでした。');
        return;
    }

    const urls = ytTabs.map((t) => t.url).filter(Boolean);

    // 3. PomodoroTimer 側のフックを呼んで URL を流し込む (MAIN world で実行)
    let added = 0;
    try {
        const [injectResult] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: (urlList) => window.PomodoroTimer.addYouTubeUrls(urlList),
            args: [urls],
        });
        added = (injectResult && injectResult.result && injectResult.result.added) || 0;
    } catch (e) {
        notify('PomodoroTimer への URL 注入に失敗しました: ' + (e && e.message || e));
        return;
    }

    // 4. 追加が 1 件でもあれば YouTube タブを閉じる
    if (added > 0) {
        await chrome.tabs.remove(ytTabs.map((t) => t.id));
        notify(`${added} 件の動画を追加し、${ytTabs.length} タブを閉じました。`);
    } else {
        notify('追加できる新規 URL がありませんでした (重複/無効)。');
    }
});

function notify(message) {
    try {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
            title: 'PomodoroTimer YouTube Collector',
            message,
        });
    } catch (_) { /* notifications 権限未許可は無視 */ }
}

// ---------------------------------------------------------------------------
// 視聴済みマーク (履歴焼き付け)
// ---------------------------------------------------------------------------
// YouTube Data API には再生履歴へ書き込む手段が存在しない (公式ドキュメントに
// 履歴のリソース/メソッドが無い)。また PomodoroTimer の IFrame 埋め込み再生は
// サードパーティ扱いのため履歴に残らない (実測済み)。
//
// そこで「見終わった動画を、ログイン済みの youtube.com 上でバックグラウンドタブ
// として少しだけ再生し、終端手前までシークしてから閉じる」ことで本物の再生履歴に
// 記録する。終端手前の位置が watchtime ping で記録されるため、サムネイルの
// 赤い進捗バーも満タン (= 見終わった表示) になる。
//
// ★実時間で終端まで再生する方式は不可 (実測): バックグラウンドタブは再生が
//   スロットリングされ、19 秒の動画が 60 秒経っても 9.8 秒までしか進まなかった。
//   そのためシークで位置を進め、実再生は数秒だけに留める。

const MARK_SEEK_MARGIN_SECONDS = 4;   // 終端の何秒手前へシークするか
const MARK_STOP_MARGIN_SECONDS = 2;   // 終端の何秒手前まで再生したら止めるか
const MARK_SHORT_VIDEO_SECONDS = 6;   // これ以下の尺はシークせず最後まで流す
const MARK_TIMEOUT_MS = 60000;        // 1 本あたりの上限待ち時間
const MARK_POLL_MS = 500;

// バックグラウンドタブが同時に何枚も開くのを防ぐため直列化する
let markQueue = Promise.resolve();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== 'MARK_WATCHED') return undefined;
    markQueue = markQueue
        .catch(() => {})
        .then(() => markWatched(msg.videoId, msg.durationSeconds));
    markQueue.then(sendResponse, (e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true; // 非同期応答
});

async function markWatched(videoId, durationSeconds) {
    if (!/^[\w-]{11}$/.test(String(videoId || ''))) {
        return { ok: false, reason: 'invalid videoId', videoId };
    }
    // 序盤の読み込みを避けたいので、尺が分かっていれば終盤から開く。
    // 分からなくても後段のシークで終端手前まで進めるため必須ではない。
    const dur = Number(durationSeconds);
    const start = Number.isFinite(dur) && dur > 30 ? Math.floor(dur - 30) : 0;
    const url = `https://www.youtube.com/watch?v=${videoId}&t=${start}s`;

    const tab = await chrome.tabs.create({ url, active: false });
    // 不意に音が出ないようタブ単位でもミュートする (要素側の muted は inject 側で立てる)
    try { await chrome.tabs.update(tab.id, { muted: true }); } catch (_) { /* 無視 */ }

    try {
        const state = await waitUntilWatched(tab.id);
        return { ok: state.satisfied, videoId, startSeconds: start, ...state };
    } finally {
        try { await chrome.tabs.remove(tab.id); } catch (_) { /* 既に閉じられている */ }
    }
}

// バックグラウンドタブ内のプレイヤーを監視し、履歴に「ほぼ見終わった」位置が
// 記録されるところまで進める。
async function waitUntilWatched(tabId) {
    const deadline = Date.now() + MARK_TIMEOUT_MS;
    let last = { reason: 'no player' };

    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, MARK_POLL_MS));
        let res;
        try {
            [res] = await chrome.scripting.executeScript({
                target: { tabId },
                world: 'MAIN',
                func: drivePlayerToEnd,
                args: [MARK_SEEK_MARGIN_SECONDS, MARK_STOP_MARGIN_SECONDS, MARK_SHORT_VIDEO_SECONDS],
            });
        } catch (_) {
            continue; // ナビゲーション中などで一時的に注入できないことがある
        }
        const s = (res && res.result) || null;
        if (!s) continue;
        last = s;
        if (s.done) return { satisfied: true, ...s };
    }
    return { satisfied: false, timedOut: true, ...last };
}

// バックグラウンドタブの MAIN world で実行される。関数本体はシリアライズされて
// 送られるため、外側のスコープを参照してはいけない。
// 呼び出しをまたぐ状態は window に置く (同じ MAIN world が再利用されるため)。
function drivePlayerToEnd(seekMargin, stopMargin, shortVideoSeconds) {
    const v = document.querySelector('video');
    if (!v) return { done: false, reason: 'no video element', hidden: document.hidden };

    const st = window.__pomodoroMark || (window.__pomodoroMark = { seeked: false, stopped: false });
    const player = document.getElementById('movie_player');
    let duration = v.duration;
    try {
        if (player && typeof player.getDuration === 'function') {
            const d = player.getDuration();
            if (Number.isFinite(d) && d > 0) duration = d;
        }
    } catch (_) { /* 内部 API が使えなければ video 要素の値を使う */ }

    // 常にミュート。音漏れ防止に加え、ミュート再生は Chrome の autoplay policy で
    // 無条件に許可されるため、非表示タブで自動再生がブロックされても play() が通る。
    v.muted = true;
    if (v.paused && !v.ended && !st.stopped) {
        try { v.play(); } catch (_) { /* 無視 */ }
    }

    const read = (extra) => Object.assign({
        hidden: document.hidden,
        currentVideoId: new URLSearchParams(location.search).get('v'),
        currentTime: v.currentTime,
        duration,
        paused: v.paused,
        ended: v.ended,
        muted: v.muted,
        seeked: st.seeked,
    }, extra);

    // 尺が取れないうちは何もしない (プレイヤー初期化待ち)
    if (!Number.isFinite(duration) || duration <= 0) return read({ done: false, reason: 'duration unknown' });

    // ごく短い動画はシークせず最後まで流す
    if (duration <= shortVideoSeconds) {
        return read({ done: v.ended || v.currentTime >= duration - 0.3 });
    }

    // 再生が始まったことを確認してから終端手前へシークする。
    // 再生前にシークすると位置が巻き戻されることがあるため順序が重要。
    if (!st.seeked) {
        if (v.paused || !(v.currentTime > 0)) return read({ done: false, reason: 'waiting playback' });
        const target = Math.max(0, duration - seekMargin);
        try {
            if (player && typeof player.seekTo === 'function') player.seekTo(target, true);
            else v.currentTime = target;
        } catch (_) {
            try { v.currentTime = target; } catch (__) { /* 無視 */ }
        }
        st.seeked = true;
        return read({ done: false, reason: 'seeked', seekTarget: target });
    }

    // シーク後、終端手前まで再生できたら停止する。
    // この pause で watchtime ping が飛び、その位置が履歴に記録される。
    if (!st.stopped && v.currentTime >= duration - stopMargin) {
        st.stopped = true;
        try { v.pause(); } catch (_) { /* 無視 */ }
        return read({ done: false, reason: 'stopped at near end' });
    }
    // 停止した次のポーリングで完了とする (ping が飛ぶ猶予を 1 周期分とる)
    return read({ done: st.stopped });
}
