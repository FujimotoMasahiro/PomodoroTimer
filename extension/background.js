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
// 履歴リソース/メソッドが無い)。また PomodoroTimer の IFrame 埋め込み再生は
// サードパーティ扱いのため履歴に残らない (実測済み)。
//
// そこで「見終わった動画を、ログイン済みの youtube.com 上でバックグラウンドタブ
// として終盤だけ再生し、閉じる」ことで本物の再生履歴に記録する。
// 終盤 (duration - MARK_TAIL_SECONDS) から再生するので、サムネイルの赤い進捗バーも
// ほぼ満タン = 「見終わった」表示になる。

// 終端から何秒手前を再生開始位置にするか。
// 再生位置は watchtime ping で確定するため、ping が最低 1〜2 回飛ぶだけの
// 尺 (十数秒) を残しておかないとサムネイルの進捗バーが伸びない。
const MARK_TAIL_SECONDS = 20;
const MARK_MIN_PLAY_SECONDS = 30;   // duration が取れない等の異常時の打ち切り秒数
const MARK_END_MARGIN_SECONDS = 0.3; // 終端の何秒手前で「見終わった」とみなすか
const MARK_TIMEOUT_MS = 60000;      // 1 本あたりの上限待ち時間
// 終端到達を検知したら即座にタブを閉じて自動再生 (次の動画) を防ぐ必要があるため
// 終盤は細かくポーリングする。
const MARK_POLL_MS = 250;

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
    const dur = Number(durationSeconds);
    const start = Number.isFinite(dur) && dur > MARK_TAIL_SECONDS
        ? Math.floor(dur - MARK_TAIL_SECONDS)
        : 0;
    const url = `https://www.youtube.com/watch?v=${videoId}&t=${start}s`;

    const tab = await chrome.tabs.create({ url, active: false });
    // 不意に音が出ないようタブ単位でもミュートする (要素側の muted は下の inject で立てる)
    try { await chrome.tabs.update(tab.id, { muted: true }); } catch (_) { /* 無視 */ }

    try {
        const state = await waitUntilWatched(tab.id, start);
        return { ok: state.satisfied, videoId, startSeconds: start, ...state };
    } finally {
        try { await chrome.tabs.remove(tab.id); } catch (_) { /* 既に閉じられている */ }
    }
}

// バックグラウンドタブ内の <video> を監視し、履歴記録に足るまで再生させる。
// 自動再生がブロックされている場合に備えて muted+play() を毎回叩く
// (ミュート再生は Chrome の autoplay policy で許可されるため)。
async function waitUntilWatched(tabId, startSeconds) {
    const deadline = Date.now() + MARK_TIMEOUT_MS;
    let last = { reason: 'no player' };

    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, MARK_POLL_MS));
        let res;
        try {
            [res] = await chrome.scripting.executeScript({
                target: { tabId },
                world: 'MAIN',
                func: kickAndReadPlayer,
            });
        } catch (_) {
            continue; // ナビゲーション中などで一時的に注入できないことがある
        }
        const s = (res && res.result) || null;
        if (!s) continue;
        last = s;
        const played = (s.currentTime != null) ? s.currentTime - startSeconds : 0;
        // 終端付近まで到達していれば、その位置が watchtime ping で記録され
        // サムネイルの進捗バーが満タン (= 見終わった表示) になる。
        const nearEnd = s.duration > 0 && s.currentTime >= s.duration - MARK_END_MARGIN_SECONDS;
        if (s.ended || nearEnd || played >= MARK_MIN_PLAY_SECONDS) {
            return { satisfied: true, ...s, playedSeconds: Math.round(played * 100) / 100 };
        }
    }
    return { satisfied: false, timedOut: true, ...last };
}

// バックグラウンドタブの MAIN world で実行される。関数本体はシリアライズされて
// 送られるため、外側のスコープを参照してはいけない。
function kickAndReadPlayer() {
    const v = document.querySelector('video');
    if (!v) return { currentTime: null, watchtimePings: 0, reason: 'no video element', hidden: document.hidden };
    // 常にミュートしておく。音が漏れないだけでなく、ミュート再生は Chrome の
    // autoplay policy で無条件に許可されるため、非表示タブで自動再生が
    // ブロックされた場合でも play() が確実に通る。
    v.muted = true;
    if (v.paused && !v.ended) {
        try { v.play(); } catch (_) { /* 無視 */ }
    }
    // 終端まで再生し切らないとサムネイルの進捗バーが「見終わった」表示にならない
    // (実測: 途中で止めると赤バーが伸びない)。到達したら即 pause して、
    // 呼び出し側がタブを閉じるまでの間に自動再生が始まるのを抑える。
    if (v.ended || (v.duration > 0 && v.currentTime >= v.duration - 0.2)) {
        try { v.pause(); } catch (_) { /* 無視 */ }
    }
    let pings = 0;
    try {
        pings = performance.getEntriesByType('resource')
            .filter((e) => e.name.indexOf('/api/stats/watchtime') !== -1).length;
    } catch (_) { /* バッファ溢れ等は 0 のまま */ }
    return {
        hidden: document.hidden,
        currentVideoId: new URLSearchParams(location.search).get('v'),
        currentTime: v.currentTime,
        duration: v.duration,
        paused: v.paused,
        ended: v.ended,
        muted: v.muted,
        watchtimePings: pings,
    };
}
