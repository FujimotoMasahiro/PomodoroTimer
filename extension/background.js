// 拡張アイコンクリック時のメイン処理。
// アクティブタブが PomodoroTimer なら、開いている全 YouTube watch タブの URL を
// ページ側フック window.PomodoroTimer.addYouTubeUrls() に渡し、追加成功した
// 場合は対象の YouTube タブを閉じる。
chrome.action.onClicked.addListener(async (tab) => {
    if (!tab || !tab.id) return;

    // 1. アクティブタブが PomodoroTimer かをフックの存在で判定
    let isPomodoroTab = false;
    try {
        const [result] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => typeof window?.PomodoroTimer?.addYouTubeUrls === 'function',
        });
        isPomodoroTab = !!(result && result.result);
    } catch (_) {
        // file:// のファイルアクセス未許可、chrome:// ページ等で executeScript が拒否されるケース
    }

    if (!isPomodoroTab) {
        notify('PomodoroTimer タブをアクティブにしてから拡張アイコンを押してください。');
        return;
    }

    // 2. YouTube watch タブを列挙
    const ytTabs = await chrome.tabs.query({
        url: [
            '*://www.youtube.com/watch*',
            '*://m.youtube.com/watch*',
            '*://youtu.be/*',
        ],
    });

    if (ytTabs.length === 0) {
        notify('開いている YouTube 動画タブが見つかりませんでした。');
        return;
    }

    const urls = ytTabs.map((t) => t.url).filter(Boolean);

    // 3. PomodoroTimer 側のフックを呼んで URL を流し込む
    let added = 0;
    try {
        const [injectResult] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
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
