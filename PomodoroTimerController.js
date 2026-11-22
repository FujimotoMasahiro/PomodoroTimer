import { MusicManager, VoicyManager, YouTubeManager, LocalMediaManager } from "./MusicManager.js";

// 定義 なので、constを用いる
const STATUS_ENUM = {
    INITIAL: {
        rawValue: 1,
        string: "待機中",
    },
    WORKING: {
        rawValue: 2,
        string: "作業中",
    },
    WORKING_POSE: {
        rawValue: 21,
        string: "一時停止中",
    },
    BREAKING: {
        rawValue: 3,
        string: "休憩中"
    },
    BREAKING_POSE: {
        rawValue: 31,
        string: "一時停止中"
    },
    LONGBREAKING: {
        rawValue: 4,
        string: "長時間休憩中"
    },
    LONGBREAKING_POSE: {
        rawValue: 41,
        string: "一時停止中"
    },
};

// 音楽プレイヤーのnode取得
const MUSIC_MANAGER = new MusicManager(document.getElementById('audioPlayer'));
const MUSIC_MANAGER2 = new MusicManager(document.getElementById('audioPlayer2'));
const MUSIC_MANAGER3 = new MusicManager(document.getElementById('audioPlayer3'));
const VOICY_MANAGER = new VoicyManager(document.getElementById('voicyContainer'));
const YOUTUBE_MANAGER = new YouTubeManager(
    document.getElementById('youtubeContainer'),
    {
        onVideoEnded: (videoId, durationSeconds) => {
            removeYouTubeUrlByVideoId(videoId);
            markYouTubeVideoWatched(videoId, durationSeconds);
        },
    }
);

// 音源設定 UI
const workSourceSelect = document.getElementById('work-source');
const breakSourceSelect = document.getElementById('break-source');
const voicyUrlInput = document.getElementById('voicy-url');
const youtubeListContainer = document.getElementById('youtube-url-list');

const DEFAULT_VOICY_URL = 'https://voicy.jp/embed/channel/941';

// 音源設定の localStorage 永続化
const AUDIO_SETTINGS_KEY = 'pomodoro_audio_source_settings';
const VALID_SOURCES = ['bgm', 'voicy', 'youtube', 'local', 'none'];

function loadAudioSourceSettings() {
    // restoredEntries: { url: string, study: boolean }[]
    let restoredEntries = [];
    try {
        const raw = localStorage.getItem(AUDIO_SETTINGS_KEY);
        if (raw) {
            const s = JSON.parse(raw);
            if (workSourceSelect && VALID_SOURCES.includes(s.workSource)) {
                workSourceSelect.value = s.workSource;
            }
            if (breakSourceSelect && VALID_SOURCES.includes(s.breakSource)) {
                breakSourceSelect.value = s.breakSource;
            }
            if (voicyUrlInput && typeof s.voicyUrl === 'string' && s.voicyUrl.trim()) {
                voicyUrlInput.value = s.voicyUrl;
            }
            if (Array.isArray(s.youtubeUrls)) {
                // 新形式 ({url, study}) と旧形式 (文字列) の両方を受け付ける
                restoredEntries = s.youtubeUrls
                    .map((item) => {
                        if (typeof item === 'string') return { url: item, study: false };
                        if (item && typeof item.url === 'string') return { url: item.url, study: !!item.study };
                        return null;
                    })
                    .filter(Boolean);
            } else if (typeof s.youtubeUrl === 'string' && s.youtubeUrl) {
                // 旧データ (単一文字列) からの移行
                restoredEntries = [{ url: s.youtubeUrl, study: false }];
            }
            if (s.youtubeMode === 'study' || s.youtubeMode === 'work') {
                setYouTubeMode(s.youtubeMode);
            }
        }
    } catch (_) { /* localStorage 不可・JSON 不正は既定値で続行 */ }
    // YouTube URL 入力欄を復元。末尾には常に空欄を 1 つ保持する
    if (youtubeListContainer) {
        youtubeListContainer.innerHTML = '';
        restoredEntries.forEach((e) => addYouTubeUrlInput(e.url, e.study));
        addYouTubeUrlInput('');
        // 復元後、現在モードに合わせて一覧を絞り込む
        applyYouTubeModeFilter();
    }
}

function saveAudioSourceSettings() {
    try {
        const data = {
            workSource: workSourceSelect ? workSourceSelect.value : 'bgm',
            breakSource: breakSourceSelect ? breakSourceSelect.value : 'bgm',
            voicyUrl: voicyUrlInput ? voicyUrlInput.value : '',
            youtubeUrls: getYouTubeEntries(),
            youtubeMode: currentYouTubeMode(),
        };
        localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(data));
    } catch (_) { /* localStorage 不可は無視 */ }
}

// ----------------------------------------------------------------------------
// YouTube 再生モード (勉強 / 作業) の管理
// ----------------------------------------------------------------------------
// 'study' … チェック済み(勉強用)動画だけを再生対象にする
// 'work'  … 未チェック(垂れ流し用)動画だけを再生対象にする
function currentYouTubeMode() {
    const checked = document.querySelector('input[name="yt-mode"]:checked');
    return checked && checked.value === 'study' ? 'study' : 'work';
}

function setYouTubeMode(mode) {
    const el = document.getElementById(mode === 'study' ? 'yt-mode-study' : 'yt-mode-work');
    if (el) el.checked = true;
}

// ----------------------------------------------------------------------------
// YouTube URL 入力欄の動的管理 (キュー入力)
// ----------------------------------------------------------------------------
// 各行を { url, study } として取り出す (空 URL 行は除外)。
function getYouTubeEntries() {
    if (!youtubeListContainer) return [];
    return Array.from(youtubeListContainer.querySelectorAll('.yt-url-row'))
        .map((row) => {
            const input = row.querySelector('input[type="url"]');
            const check = row.querySelector('.yt-study-check');
            return {
                url: input ? input.value.trim() : '',
                study: check ? check.checked : false,
            };
        })
        .filter((e) => e.url.length > 0);
}

// すべての URL (モード非依存)。拡張フックの重複判定などに使う。
function getYouTubeUrls() {
    return getYouTubeEntries().map((e) => e.url);
}

// 現在のモードで実際に再生対象となる URL のみを上から順に返す。
function getActiveYouTubeUrls() {
    const study = currentYouTubeMode() === 'study';
    return getYouTubeEntries()
        .filter((e) => (study ? e.study : !e.study))
        .map((e) => e.url);
}

// 現在モードに合わせて一覧の各行の表示/非表示を切り替える。
// ・勉強モード … チェック済み(勉強用)の行だけ表示
// ・作業モード … 未チェック(垂れ流し用)の行だけ表示
// 空行(主に末尾の追加用)はどちらのモードでも常に表示し、チェック状態を現在モードに
// 合わせておく。こうすると、その行に URL を入れた瞬間から現在モードの一覧に残る。
function applyYouTubeModeFilter() {
    if (!youtubeListContainer) return;
    const study = currentYouTubeMode() === 'study';
    youtubeListContainer.querySelectorAll('.yt-url-row').forEach((row) => {
        const input = row.querySelector('input[type="url"]');
        const check = row.querySelector('.yt-study-check');
        const isEmpty = !input || input.value.trim() === '';
        if (isEmpty) {
            if (check) check.checked = study;
            row.style.display = '';
            return;
        }
        const matches = check ? (study ? check.checked : !check.checked) : !study;
        row.style.display = matches ? '' : 'none';
    });
}

// 新規行の既定チェック状態は現在モードに従う (勉強モードで足した動画は勉強用)。
// 復元時は呼び出し側が明示的に study を渡すため、保存値が優先される。
function addYouTubeUrlInput(initialValue = '', study = (currentYouTubeMode() === 'study')) {
    if (!youtubeListContainer) return;
    const row = document.createElement('div');
    row.className = 'yt-url-row mb-2';
    row.innerHTML = `
        <div class="input-group input-group-sm">
            <span class="input-group-text drag-handle" style="cursor: grab; user-select: none;" title="ドラッグで並び替え">≡</span>
            <span class="input-group-text yt-study-cell" title="チェックすると勉強用（しっかり見る）として扱います">
                <input class="form-check-input mt-0 yt-study-check" type="checkbox" aria-label="勉強用">
            </span>
            <span class="input-group-text p-0 yt-thumb-cell" style="display:none;">
                <img class="yt-thumb" alt="" style="width: 60px; height: 45px; object-fit: cover; display: block;">
            </span>
            <input type="url" class="form-control" placeholder="https://www.youtube.com/watch?v=...">
            <button type="button" class="btn btn-outline-danger" aria-label="削除">×</button>
        </div>
        <div class="form-text text-danger yt-url-warning mt-1" style="display:none;">
            動画 URL を解析できませんでした。YouTube の URL を入力してください。
        </div>
    `;
    const input = row.querySelector('input[type="url"]');
    const removeBtn = row.querySelector('button');
    const handle = row.querySelector('.drag-handle');
    const thumbCell = row.querySelector('.yt-thumb-cell');
    const thumbImg = row.querySelector('.yt-thumb');
    const warningEl = row.querySelector('.yt-url-warning');
    const studyCheck = row.querySelector('.yt-study-check');

    // 勉強用フラグ: チェック変更で保存し、現在モードの再生対象が変わるので
    // 再生中なら反映する (現在再生中の動画が対象に残っていれば中断しない)。
    studyCheck.checked = !!study;
    studyCheck.addEventListener('change', () => {
        saveAudioSourceSettings();
        scheduleUrlRefresh();
        // 区分が変わると現在モードの一覧から外れる場合があるので再フィルタ
        applyYouTubeModeFilter();
    });

    // 入力値からサムネ表示・警告表示を更新し、有効な videoId なら true を返す
    function updateValidation() {
        const trimmed = input.value.trim();
        const id = YOUTUBE_MANAGER.extractVideoId(trimmed);
        if (id) {
            thumbImg.src = `https://img.youtube.com/vi/${id}/default.jpg`;
            thumbCell.style.display = '';
            warningEl.style.display = 'none';
            return true;
        }
        thumbImg.removeAttribute('src');
        thumbCell.style.display = 'none';
        // 空欄は警告対象外 (空のままの行は常に許容)
        warningEl.style.display = trimmed ? '' : 'none';
        return false;
    }

    input.value = initialValue;
    updateValidation();
    input.addEventListener('input', () => {
        const isValid = updateValidation();
        saveAudioSourceSettings();
        scheduleUrlRefresh();
        // 末尾の行が有効 URL になったら、新しい空欄を末尾に追加
        if (isValid && row === youtubeListContainer.lastElementChild) {
            addYouTubeUrlInput('');
        }
        // URL の入力/消去で空行判定が変わるため表示を更新
        applyYouTubeModeFilter();
    });
    removeBtn.addEventListener('click', () => {
        row.remove();
        ensureTrailingEmpty();
        saveAudioSourceSettings();
        scheduleUrlRefresh();
    });

    // ハンドル上で押下したときだけ draggable=true にし、input 内のテキスト選択と
    // ドラッグ操作が競合しないようにする。
    handle.addEventListener('mousedown', () => row.setAttribute('draggable', 'true'));
    handle.addEventListener('mouseup', () => row.removeAttribute('draggable'));
    row.addEventListener('dragstart', (e) => {
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        // Firefox は dataTransfer に何か入れないと drag が始まらない
        e.dataTransfer.setData('text/plain', '');
        // 並び替え検知用に、ドラッグ開始時点の「再生対象(アクティブ)」順序を控えておく
        _dragStartActiveIds = youtubeQueueIds();
    });
    row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        row.removeAttribute('draggable');
        ensureTrailingEmpty();
        saveAudioSourceSettings();
        // アクティブ(再生対象)リストの変化だけを見る。
        // ・順序に変化なし            → 何もしない
        // ・先頭が変わった            → 新トップから再生し直す (再読み込み)
        // ・先頭は同じで順序だけ変化  → 再生は止めずキュー順だけ更新 (再読み込みしない)
        const before = _dragStartActiveIds || [];
        const after = youtubeQueueIds();
        _dragStartActiveIds = null;
        if (after.join(',') === before.join(',')) return;
        const firstChanged = (after[0] || null) !== (before[0] || null);
        reorderYouTubeQueue(firstChanged);
    });

    youtubeListContainer.appendChild(row);
    // 追加直後の行も現在モードに合わせて表示/非表示を整える
    applyYouTubeModeFilter();
}

// 末尾に空の入力欄が無ければ追加して、常に「末尾は空欄」の状態を保つ
function ensureTrailingEmpty() {
    if (!youtubeListContainer) return;
    const last = youtubeListContainer.lastElementChild;
    if (!last) {
        addYouTubeUrlInput('');
        return;
    }
    const lastInput = last.querySelector('input[type="url"]');
    if (lastInput && lastInput.value.trim() !== '') {
        addYouTubeUrlInput('');
    }
}

// ドラッグ開始時点のアクティブ(再生対象)動画 ID 列。dragend で比較し並び替え検知に使う
let _dragStartActiveIds = null;

// 並び替えを再生に反映する。
// restartFromTop=true (先頭が変わった) のときは内部位置をリセットし、
// 新リストの先頭から再生し直す (= 再読み込み)。
// restartFromTop=false (先頭は同じ) のときは位置をリセットせず、現在の動画を
// 止めずにキュー順だけ更新する (= 再読み込みしない)。
// いずれも一時停止中・別音源フェーズなら、次に YouTube がアクティブになった
// 時点で新しい順序が反映される。
function reorderYouTubeQueue(restartFromTop) {
    if (restartFromTop) YOUTUBE_MANAGER.resetPosition();
    if (!isPlayingState()) return;
    const phaseKey = sourceKeyFor(currentPhase());
    if (!phaseKey.startsWith('youtube:')) return;
    currentSourceKey = phaseKey;
    YOUTUBE_MANAGER.play(getActiveYouTubeUrls());
}

// 並び替え時に、ドラッグ中の行を挿入すべき次兄弟要素を返す
function getDragAfterElement(container, y) {
    const rows = [...container.querySelectorAll('.yt-url-row:not(.dragging)')];
    return rows.reduce((closest, row) => {
        const box = row.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset, element: row };
        }
        return closest;
    }, { offset: -Infinity, element: null }).element;
}

if (youtubeListContainer) {
    youtubeListContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        const dragging = youtubeListContainer.querySelector('.yt-url-row.dragging');
        if (!dragging) return;
        const after = getDragAfterElement(youtubeListContainer, e.clientY);
        if (after == null) {
            youtubeListContainer.appendChild(dragging);
        } else {
            youtubeListContainer.insertBefore(dragging, after);
        }
    });
}

// 見終わった動画を YouTube の再生履歴に「視聴済み」として記録する。
//
// YouTube Data API には再生履歴へ書き込む手段が無く、このページの IFrame 埋め込み
// 再生はサードパーティ扱いのため履歴に残らない (実測済み)。そこで拡張機能に依頼し、
// ログイン済みの youtube.com をバックグラウンドタブで開いて終盤だけミュート再生させ、
// 終わったらタブを閉じる。これで本物の再生履歴に載り、サムネイルの赤い進捗バーも
// 満タン (= 見終わった表示) になる。
//
// 拡張機能が未インストールなら何もしない (再生リストからの削除は従来どおり動く)。
function markYouTubeVideoWatched(videoId, durationSeconds) {
    if (!videoId) return;
    if (!window.__POMODORO_YT_EXTENSION__) return;

    const requestId = 'pomodoro-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    // 応答が返らないまま listener が残り続けないよう、上限時間で必ず外す。
    const timeoutId = setTimeout(() => {
        window.removeEventListener('message', onReply);
        console.warn('[PomodoroTimer] 視聴済みマークの応答がありませんでした:', videoId);
    }, 90000);

    function onReply(ev) {
        if (ev.source !== window) return;
        const d = ev.data;
        if (!d || d.__pomodoroYtResult !== true || d.requestId !== requestId) return;
        clearTimeout(timeoutId);
        window.removeEventListener('message', onReply);
        if (d.ok) {
            console.info('[PomodoroTimer] 再生履歴に記録しました:', videoId, d.detail);
        } else {
            console.warn('[PomodoroTimer] 再生履歴への記録に失敗しました:', videoId, d);
        }
    }

    window.addEventListener('message', onReply);
    window.postMessage(
        {
            __pomodoroYt: true,
            type: 'MARK_WATCHED',
            videoId,
            durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
            requestId,
        },
        '*'
    );
}

// 動画再生終了時に該当 URL 行を入力欄から取り除く。
// YouTubeManager 側で _advance() が既に次の動画を読み込んでいるため、
// scheduleUrlRefresh は呼ばない (キュー編集中の再ロードを避ける)。
function removeYouTubeUrlByVideoId(videoId) {
    if (!youtubeListContainer || !videoId) return;
    const inputs = youtubeListContainer.querySelectorAll('input[type="url"]');
    for (const input of inputs) {
        if (YOUTUBE_MANAGER.extractVideoId(input.value.trim()) === videoId) {
            const row = input.closest('.yt-url-row');
            if (row) row.remove();
            break;
        }
    }
    ensureTrailingEmpty();
    saveAudioSourceSettings();
}

// ----------------------------------------------------------------------------
// ローカルファイル (音源 / 動画) の再生リスト
// ----------------------------------------------------------------------------
// ブラウザは「パス文字列」からローカルファイルを読めない (https のページから
// file:// は参照できない)。そこでファイルはユーザーに選んでもらい、
//   - File System Access API がある環境: FileSystemFileHandle を IndexedDB に保存し、
//     次回起動時は「読み込みを許可」を 1 回押すだけで同じ一覧をそのまま使える。
//   - 無い環境 (Safari / Firefox 等): <input type="file"> で選んだ File をメモリに持つ。
//     一覧はリロードで消えるため、その旨を画面に出す。
// 再生は「ロケットえんぴつ式」: 常にリスト先頭を再生し、終わったらその行を末尾へ回す。
const LOCAL_DB_NAME = 'pomodoro-local-media';
const LOCAL_DB_STORE = 'items';
const LOCAL_DB_VERSION = 1;

const localFileListContainer = document.getElementById('local-file-list');
const localAddBtn = document.getElementById('local-add-btn');
const localGrantBtn = document.getElementById('local-grant-btn');
const localClearBtn = document.getElementById('local-clear-btn');
const localFileInput = document.getElementById('local-file-input');
const localFileNote = document.getElementById('local-file-note');
const localNowPlaying = document.getElementById('local-now-playing');

// 一覧の実体。UI の並び順がそのまま再生順。
// { id, name, kind: 'audio'|'video', handle: FileSystemFileHandle|null }
let localItems = [];
// <input type="file"> 経由で選んだ File (ハンドルを保存できない環境用・メモリのみ)
const localFileCache = new Map();

const supportsFileSystemAccess = () => typeof window.showOpenFilePicker === 'function';

function newLocalId() {
    try {
        if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    } catch (_) { /* 無視 */ }
    return `lf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---- IndexedDB (ハンドルの永続化) ------------------------------------------
// ハンドルは JSON にできないので localStorage ではなく IndexedDB に置く。
function openLocalDb() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) { reject(new Error('no indexedDB')); return; }
        const req = indexedDB.open(LOCAL_DB_NAME, LOCAL_DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(LOCAL_DB_STORE)) {
                db.createObjectStore(LOCAL_DB_STORE, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('indexedDB open failed'));
    });
}

async function readLocalItemsFromDb() {
    try {
        const db = await openLocalDb();
        const rows = await new Promise((resolve, reject) => {
            const tx = db.transaction(LOCAL_DB_STORE, 'readonly');
            const req = tx.objectStore(LOCAL_DB_STORE).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
        db.close();
        return rows
            .filter((r) => r && r.id)
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map((r) => ({ id: r.id, name: r.name || '', kind: r.kind === 'video' ? 'video' : 'audio', handle: r.handle || null }));
    } catch (_) {
        return [];
    }
}

// 一覧をまるごと書き直す。並び順は order で保存する。
async function writeLocalItemsToDb() {
    try {
        const db = await openLocalDb();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(LOCAL_DB_STORE, 'readwrite');
            const store = tx.objectStore(LOCAL_DB_STORE);
            store.clear();
            localItems.forEach((it, i) => {
                // ハンドルが無い (= <input type="file"> 経由) 項目も、名前と並び順は
                // 残しておく。次に開いたとき一覧をそのまま再表示し、行ごとに
                // 「選び直す」でファイルを紐付け直せるようにするため。
                store.put({ id: it.id, name: it.name, kind: it.kind, order: i, handle: it.handle || null });
            });
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    } catch (_) { /* 保存できなくても再生自体は続けられる */ }
}

// ---- ファイルの取り出し ------------------------------------------------------
// 再生直前に呼ばれる。ハンドルがあれば毎回 getFile() で読み直す
// (ファイルが差し替えられていても最新が読める)。
async function resolveLocalFile(id) {
    const cached = localFileCache.get(id);
    if (cached) return cached;
    const item = localItems.find((it) => it.id === id);
    if (!item) return null;
    if (!item.handle) {
        // 一覧は残っているがファイルの実体がまだ無い状態
        setLocalNote(`「${item.name}」は行の「選び直す」からファイルを指定してください。`);
        return null;
    }
    try {
        const perm = await queryLocalPermission(item.handle);
        if (perm !== 'granted') { showLocalGrantButton(true); return null; }
        return await item.handle.getFile();
    } catch (_) {
        return null;
    }
}

// その項目が今すぐ再生できるか (ハンドルがある / この画面でファイルを選び直した)
function isLocalItemReady(item) {
    return !!(item && (item.handle || localFileCache.has(item.id)));
}

async function queryLocalPermission(handle) {
    if (!handle || typeof handle.queryPermission !== 'function') return 'granted';
    try { return await handle.queryPermission({ mode: 'read' }); } catch (_) { return 'denied'; }
}

// 保存済みハンドルの読み取り許可をまとめて求める (ユーザー操作の中でのみ通る)
async function requestLocalPermissions() {
    let ok = true;
    for (const it of localItems) {
        if (!it.handle || typeof it.handle.requestPermission !== 'function') continue;
        try {
            const res = await it.handle.requestPermission({ mode: 'read' });
            if (res !== 'granted') ok = false;
        } catch (_) { ok = false; }
    }
    showLocalGrantButton(!ok);
    if (ok) {
        setLocalNote('');
        refreshActiveSourceIfPlaying();
    } else {
        setLocalNote('読み込みが許可されなかったファイルがあります。もう一度お試しください。');
    }
    return ok;
}

function showLocalGrantButton(show) {
    if (localGrantBtn) localGrantBtn.style.display = show ? '' : 'none';
}

function setLocalNote(msg) {
    if (!localFileNote) return;
    localFileNote.textContent = msg || '';
    localFileNote.style.display = msg ? '' : 'none';
}

function setLocalNowPlaying(msg) {
    if (localNowPlaying) localNowPlaying.textContent = msg;
}

// ---- 一覧 UI ----------------------------------------------------------------
function renderLocalFileList() {
    if (!localFileListContainer) return;
    localFileListContainer.innerHTML = '';

    if (localItems.length === 0) {
        const p = document.createElement('p');
        p.className = 'text-muted small mb-0';
        p.textContent = 'まだファイルがありません。「ファイルを追加」から選んでください。';
        localFileListContainer.appendChild(p);
        updateLocalNowPlayingLabel();
        return;
    }

    localItems.forEach((item, i) => {
        const row = document.createElement('div');
        row.className = 'local-file-row d-flex align-items-center gap-2 mb-1';
        row.draggable = true;
        row.dataset.id = item.id;

        const handle = document.createElement('span');
        handle.className = 'drag-handle text-muted';
        handle.textContent = '⋮⋮';
        handle.title = 'ドラッグで並び替え';

        const order = document.createElement('span');
        order.className = 'badge bg-secondary flex-shrink-0';
        order.textContent = String(i + 1);

        const name = document.createElement('span');
        name.className = 'flex-grow-1 text-truncate small';
        name.textContent = item.name;
        name.title = item.name;

        const kind = document.createElement('span');
        kind.className = 'badge bg-light text-dark flex-shrink-0';
        kind.textContent = item.kind === 'video' ? '動画' : '音源';

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn btn-sm btn-outline-danger flex-shrink-0';
        del.textContent = '削除';
        del.addEventListener('click', () => removeLocalItem(item.id));

        row.append(handle, order, name, kind);

        // 一覧は覚えていても、ファイルの実体を持てていない項目がある
        // (<input type="file"> 経由で追加し、ページを開き直したときなど)。
        // その行だけ選び直せるようにする。
        if (!isLocalItemReady(item)) {
            row.classList.add('local-file-row-unlinked');
            const warn = document.createElement('span');
            warn.className = 'badge bg-warning text-dark flex-shrink-0';
            warn.textContent = '要再選択';
            row.append(warn, buildRelinkControl(item.id));
            name.classList.add('text-muted');
        }

        row.append(del);
        localFileListContainer.appendChild(row);
    });
    updateLocalNowPlayingLabel();
}

function updateLocalNowPlayingLabel() {
    if (localItems.length === 0) {
        setLocalNowPlaying('設定の「ローカルファイル」からファイルを追加してください。');
        return;
    }
    const queue = getLocalQueue();
    if (queue.length === 0) {
        setLocalNowPlaying('一覧は残っていますが、ファイルが選ばれていません。設定の「選び直す」から指定してください。');
        return;
    }
    setLocalNowPlaying(`再生中: ${queue[0].name}（終わると一番下へ回ります）`);
}

// ドラッグ並び替え (YouTube 一覧と同じ操作感)
if (localFileListContainer) {
    localFileListContainer.addEventListener('dragstart', (e) => {
        const row = e.target.closest('.local-file-row');
        if (!row) return;
        row.classList.add('dragging');
    });
    localFileListContainer.addEventListener('dragend', (e) => {
        const row = e.target.closest('.local-file-row');
        if (!row) return;
        row.classList.remove('dragging');
        syncLocalItemsFromDom();
    });
    localFileListContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        const dragging = localFileListContainer.querySelector('.local-file-row.dragging');
        if (!dragging) return;
        const after = getLocalDragAfterElement(localFileListContainer, e.clientY);
        if (after == null) localFileListContainer.appendChild(dragging);
        else localFileListContainer.insertBefore(dragging, after);
    });
}

function getLocalDragAfterElement(container, y) {
    const rows = [...container.querySelectorAll('.local-file-row:not(.dragging)')];
    return rows.reduce((closest, row) => {
        const box = row.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) return { offset, element: row };
        return closest;
    }, { offset: -Infinity, element: null }).element;
}

// DOM の並びを localItems に反映して保存・再生へ反映する
function syncLocalItemsFromDom() {
    if (!localFileListContainer) return;
    const ids = [...localFileListContainer.querySelectorAll('.local-file-row')].map((r) => r.dataset.id);
    const byId = new Map(localItems.map((it) => [it.id, it]));
    const next = ids.map((id) => byId.get(id)).filter(Boolean);
    if (next.length !== localItems.length) return;
    localItems = next;
    renderLocalFileList();
    writeLocalItemsToDb();
    refreshActiveSourceIfPlaying();
}

// ---- 追加 / 削除 -------------------------------------------------------------
async function addLocalFilesViaPicker() {
    try {
        const handles = await window.showOpenFilePicker({
            multiple: true,
            types: [{
                description: '音源・動画',
                accept: {
                    'audio/*': ['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.flac'],
                    'video/*': ['.mp4', '.m4v', '.mov', '.webm', '.mkv'],
                },
            }],
        });
        for (const handle of handles) {
            let file = null;
            try { file = await handle.getFile(); } catch (_) { /* 無視 */ }
            const name = (file && file.name) || handle.name || '';
            const kind = LocalMediaManager.isVideoFile(name, file && file.type) ? 'video' : 'audio';
            localItems.push({ id: newLocalId(), name, kind, handle });
        }
        setLocalNote('');
        renderLocalFileList();
        await writeLocalItemsToDb();
        refreshActiveSourceIfPlaying();
    } catch (_) {
        // ユーザーがキャンセルした場合もここに来る。何もしない。
    }
}

function addLocalFilesFromInput(files) {
    const list = [...(files || [])];
    if (list.length === 0) return;
    list.forEach((file) => {
        const id = newLocalId();
        const kind = LocalMediaManager.isVideoFile(file.name, file.type) ? 'video' : 'audio';
        localFileCache.set(id, file);
        localItems.push({ id, name: file.name, kind, handle: null });
    });
    // 一覧は次回も残るが、ファイルの実体までは覚えられない経路
    setLocalNote('このブラウザでは一覧は覚えますが、ファイルの中身までは覚えられません。'
        + '次に開いたときは各行の「選び直す」でファイルを指定してください。');
    renderLocalFileList();
    writeLocalItemsToDb();   // 名前と並び順は残して次回に一覧を再表示する
    refreshActiveSourceIfPlaying();
}

// 「選び直す」の操作部品を作る。
// File System Access API がある環境ではピッカーを開いてハンドルごと覚え直す
// (次回からは選び直しが不要になる)。無い環境では行に <input type="file"> を
// 直接置く: 隠し input を script から click しても環境によってはダイアログが
// 開かないため、label で包んだ実物のほうが確実。
function buildRelinkControl(id) {
    if (supportsFileSystemAccess()) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-sm btn-outline-secondary flex-shrink-0 local-relink-btn';
        btn.textContent = '選び直す';
        btn.addEventListener('click', () => relinkLocalItem(id));
        return btn;
    }
    const label = document.createElement('label');
    label.className = 'btn btn-sm btn-outline-secondary flex-shrink-0 mb-0 local-relink-btn';
    label.textContent = '選び直す';
    const input = document.createElement('input');
    input.type = 'file';
    input.className = 'd-none local-relink-input';
    input.accept = 'audio/*,video/*';
    input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (file) attachFileToLocalItem(id, file);
        input.value = '';
    });
    label.appendChild(input);
    return label;
}

// ピッカーで選び直してハンドルを覚え直す (File System Access API 環境のみ)
async function relinkLocalItem(id) {
    if (!localItems.some((it) => it.id === id)) return;
    try {
        const [handle] = await window.showOpenFilePicker({ multiple: false });
        if (handle) await attachHandleToLocalItem(id, handle);
    } catch (_) { /* キャンセルは何もしない */ }
}

async function attachHandleToLocalItem(id, handle) {
    const item = localItems.find((it) => it.id === id);
    if (!item) return;
    let file = null;
    try { file = await handle.getFile(); } catch (_) { /* 無視 */ }
    item.handle = handle;
    item.name = (file && file.name) || handle.name || item.name;
    item.kind = LocalMediaManager.isVideoFile(item.name, file && file.type) ? 'video' : 'audio';
    localFileCache.delete(id);
    setLocalNote('');
    renderLocalFileList();
    await writeLocalItemsToDb();
    refreshActiveSourceIfPlaying();
}

function attachFileToLocalItem(id, file) {
    const item = localItems.find((it) => it.id === id);
    if (!item || !file) return;
    localFileCache.set(id, file);
    item.name = file.name;
    item.kind = LocalMediaManager.isVideoFile(file.name, file.type) ? 'video' : 'audio';
    setLocalNote(localUnlinkedNote());
    renderLocalFileList();
    writeLocalItemsToDb();
    refreshActiveSourceIfPlaying();
}

// 実体を持てていない行がいくつあるかに応じた案内文
function localUnlinkedNote() {
    const unlinked = localItems.filter((it) => !isLocalItemReady(it)).length;
    if (unlinked === 0) return '';
    return `このブラウザではファイルの中身までは覚えられません。${unlinked} 件は「選び直す」でファイルを指定してください。`;
}

function removeLocalItem(id) {
    const before = localItems.length;
    localItems = localItems.filter((it) => it.id !== id);
    localFileCache.delete(id);
    if (localItems.length === before) return;
    renderLocalFileList();
    writeLocalItemsToDb();
    refreshActiveSourceIfPlaying();
}

function clearLocalItems() {
    localItems = [];
    localFileCache.clear();
    LOCAL_MANAGER.stop();
    setLocalNote('');
    showLocalGrantButton(false);
    renderLocalFileList();
    writeLocalItemsToDb();
    refreshActiveSourceIfPlaying();
}

// ---- 再生キュー / ロケットえんぴつ -------------------------------------------
// 再生キューは一覧の並び順のまま。ただし実体を持てていない行 (要再選択) は
// 鳴らせないので飛ばす。並び替え / ロケットえんぴつの回転は一覧全体で行うため、
// 選び直せばそのままの位置で再生対象に戻る。
function getLocalQueue() {
    return localItems.filter(isLocalItemReady).map((it) => ({ id: it.id, name: it.name }));
}

function localQueueIds() {
    return localItems.filter(isLocalItemReady).map((it) => it.id);
}

// 1 本再生し終わったら、その行を一番下へ回して次を再生する。
function rotateLocalItemToEnd(id) {
    const idx = localItems.findIndex((it) => it.id === id);
    if (idx === -1) return;
    const [item] = localItems.splice(idx, 1);
    localItems.push(item);
    renderLocalFileList();
    writeLocalItemsToDb();
    // 並びが変わった = sourceKey が変わるので、再生中なら新しい先頭へ進む
    refreshActiveSourceIfPlaying();
}

const LOCAL_MANAGER = new LocalMediaManager(
    {
        audio: document.getElementById('localAudioPlayer'),
        video: document.getElementById('localVideoPlayer'),
        videoContainer: document.getElementById('localVideoContainer'),
    },
    {
        resolveFile: resolveLocalFile,
        onEnded: (id) => rotateLocalItemToEnd(id),
        onError: (_id, message) => setLocalNote(message),
    }
);

if (localAddBtn) {
    localAddBtn.addEventListener('click', () => {
        if (supportsFileSystemAccess()) addLocalFilesViaPicker();
        else if (localFileInput) localFileInput.click();
    });
}
if (localFileInput) {
    localFileInput.addEventListener('change', () => {
        addLocalFilesFromInput(localFileInput.files);
        localFileInput.value = '';
    });
}
if (localGrantBtn) localGrantBtn.addEventListener('click', () => requestLocalPermissions());
if (localClearBtn) localClearBtn.addEventListener('click', () => clearLocalItems());

// 起動時: 保存済みハンドルを読み戻す。許可が切れていれば「読み込みを許可」を出す。
async function initLocalMediaList() {
    localItems = await readLocalItemsFromDb();
    renderLocalFileList();
    if (localItems.length === 0) return;
    let needGrant = false;
    for (const it of localItems) {
        if (!it.handle) continue;
        if (await queryLocalPermission(it.handle) !== 'granted') { needGrant = true; break; }
    }
    showLocalGrantButton(needGrant);
    if (needGrant) setLocalNote('前回のファイルを読み込むには「読み込みを許可」を押してください。');
    else setLocalNote(localUnlinkedNote());
}
initLocalMediaList();


loadAudioSourceSettings();

// アクティブ音源カードの表示要素
const activeSourceLabel = document.getElementById('active-source-label');
const activePhaseBadge = document.getElementById('active-phase-badge');
const sourceWrappers = {
    bgmWork: document.getElementById('workBgmWrapper'),
    bgmBreak: document.getElementById('breakBgmWrapper'),
    voicy: document.getElementById('voicyWrapper'),
    youtube: document.getElementById('youtubeWrapper'),
    local: document.getElementById('localWrapper'),
    none: document.getElementById('noneWrapper'),
};

function updateActiveSourceDisplay() {
    let phase, sourceValue;
    switch (status) {
        case STATUS_ENUM.BREAKING.rawValue:
        case STATUS_ENUM.BREAKING_POSE.rawValue:
        case STATUS_ENUM.LONGBREAKING.rawValue:
        case STATUS_ENUM.LONGBREAKING_POSE.rawValue:
            phase = 'break';
            sourceValue = breakSourceSelect ? breakSourceSelect.value : 'bgm';
            break;
        default:
            phase = 'work';
            sourceValue = workSourceSelect ? workSourceSelect.value : 'bgm';
    }

    let activeKey, label;
    if (sourceValue === 'voicy') { activeKey = 'voicy'; label = 'Voicy'; }
    else if (sourceValue === 'youtube') { activeKey = 'youtube'; label = 'YouTube'; }
    else if (sourceValue === 'local') { activeKey = 'local'; label = 'ローカルファイル'; }
    else if (sourceValue === 'none') { activeKey = 'none'; label = '音なし'; }
    else if (phase === 'break') { activeKey = 'bgmBreak'; label = '休憩中BGM'; }
    else { activeKey = 'bgmWork'; label = '作業中BGM'; }

    for (const key in sourceWrappers) {
        if (sourceWrappers[key]) sourceWrappers[key].style.display = (key === activeKey) ? 'block' : 'none';
    }
    if (activeSourceLabel) activeSourceLabel.textContent = label;

    if (activePhaseBadge) {
        const map = {
            [STATUS_ENUM.INITIAL.rawValue]: { text: '待機中', cls: 'bg-secondary' },
            [STATUS_ENUM.WORKING.rawValue]: { text: '作業中', cls: 'bg-primary' },
            [STATUS_ENUM.WORKING_POSE.rawValue]: { text: '一時停止中', cls: 'bg-warning' },
            [STATUS_ENUM.BREAKING.rawValue]: { text: '休憩中', cls: 'bg-success' },
            [STATUS_ENUM.BREAKING_POSE.rawValue]: { text: '一時停止中', cls: 'bg-warning' },
            [STATUS_ENUM.LONGBREAKING.rawValue]: { text: '長時間休憩中', cls: 'bg-success' },
            [STATUS_ENUM.LONGBREAKING_POSE.rawValue]: { text: '一時停止中', cls: 'bg-warning' },
        };
        const m = map[status] || { text: '-', cls: 'bg-secondary' };
        activePhaseBadge.className = `badge ${m.cls}`;
        activePhaseBadge.textContent = m.text;
    }
}

// 選んでいる音源に関係する設定だけを見せる。
// 作業中 / 休憩中のどちらかで選ばれていれば表示 (両方見比べる必要があるため)。
// BGM と「音なし」は設定項目を持たないので、何も選ばれていなければ全部畳まれる。
function updateSourceSettingVisibility() {
    const selected = new Set([
        workSourceSelect ? workSourceSelect.value : '',
        breakSourceSelect ? breakSourceSelect.value : '',
    ]);
    document.querySelectorAll('.source-setting').forEach((el) => {
        el.style.display = selected.has(el.dataset.source) ? '' : 'none';
    });
}

function onSourceSettingChange() {
    saveAudioSourceSettings();
    updateSourceSettingVisibility();
    updateActiveSourceDisplay();
}

updateSourceSettingVisibility();

if (workSourceSelect) workSourceSelect.addEventListener('change', onSourceSettingChange);
if (breakSourceSelect) breakSourceSelect.addEventListener('change', onSourceSettingChange);
if (voicyUrlInput) voicyUrlInput.addEventListener('input', () => {
    saveAudioSourceSettings();
    scheduleUrlRefresh();
});

// 勉強 / 作業 モード切替: 再生対象が変わるので保存しつつ、再生中なら新モードの
// 対象キューへ即座に差し替える (refreshActiveSourceIfPlaying 経由)。
document.querySelectorAll('input[name="yt-mode"]').forEach((radio) => {
    radio.addEventListener('change', () => {
        // 一覧をモードで絞り込み直してから保存・再生反映
        applyYouTubeModeFilter();
        saveAudioSourceSettings();
        scheduleUrlRefresh();
    });
});

function getVoicyUrl() {
    const v = (voicyUrlInput && voicyUrlInput.value || '').trim();
    return v || DEFAULT_VOICY_URL;
}

// ----------------------------------------------------------------------------
// アクティブな音源を 1 つの文字列キーで管理する
// ----------------------------------------------------------------------------
// currentSourceKey の取り得る値:
//   null                       何も再生していない
//   'bgm-work'                 作業中BGM (MUSIC_MANAGER / audioPlayer)
//   'bgm-break'                休憩中BGM (MUSIC_MANAGER3 / audioPlayer3)
//   'voicy:<URL>'              Voicy iframe (URL ごとに別キー)
//   'youtube:<ID,ID,...>'      YouTube キュー (動画 ID 列ごとに別キー)
//   'none'                     「音なし」(stop/start は no-op)
//
// 同じキーのままフェーズ切替する場合は何もしない (位置維持で継続再生)。
// キーが変わる場合は旧キーの停止 + 新キーの開始を行う。
let currentSourceKey = null;

// 現在のモードで実際に再生対象となる動画 ID 列 (sourceKey の一部に使う)。
// モードを切り替えると対象が変わり key も変わるため、再生中なら自動で差し替わる。
function youtubeQueueIds() {
    return getActiveYouTubeUrls()
        .map((u) => YOUTUBE_MANAGER.extractVideoId(u))
        .filter((id) => !!id);
}

function sourceKeyFor(phase) {
    const sel = phase === 'break' ? breakSourceSelect : workSourceSelect;
    const v = sel ? sel.value : 'bgm';
    if (v === 'bgm')     return phase === 'break' ? 'bgm-break' : 'bgm-work';
    if (v === 'voicy')   return `voicy:${getVoicyUrl()}`;
    if (v === 'youtube') return `youtube:${youtubeQueueIds().join(',')}`;
    // ローカルは並び順そのものが再生順なので、順序が変われば key も変わる
    // (= ロケットえんぴつで next へ進む)
    if (v === 'local')   return `local:${localQueueIds().join(',')}`;
    return 'none';
}

function startSource(key) {
    if (!key || key === 'none') return;
    if (key === 'bgm-work')              MUSIC_MANAGER.play();
    else if (key === 'bgm-break')        MUSIC_MANAGER3.play();
    else if (key.startsWith('voicy:'))   VOICY_MANAGER.play(key.slice('voicy:'.length));
    else if (key.startsWith('youtube:')) {
        // 現在のモードで再生対象がある場合のみ再生。対象が空 (例: 勉強モードだが
        // チェック済み動画が無い) なら何も鳴らさず一時停止しておく。
        const urls = getActiveYouTubeUrls();
        if (urls.length) YOUTUBE_MANAGER.play(urls);
        else YOUTUBE_MANAGER.pause();
    }
    else if (key.startsWith('local:')) {
        // 常にリスト先頭を再生する。空なら何も鳴らさない。
        const queue = getLocalQueue();
        if (queue.length) LOCAL_MANAGER.play(queue);
        else LOCAL_MANAGER.pause();
        updateLocalNowPlayingLabel();
    }
}

function stopSource(key) {
    if (!key || key === 'none') return;
    if (key === 'bgm-work')              MUSIC_MANAGER.stop();
    else if (key === 'bgm-break')        MUSIC_MANAGER3.stop();
    else if (key.startsWith('voicy:'))   VOICY_MANAGER.destroy();  // iframe を DOM から削除
    else if (key.startsWith('youtube:')) YOUTUBE_MANAGER.pause();  // iframe は保持し pauseVideo()
    else if (key.startsWith('local:'))   LOCAL_MANAGER.pause();    // 要素は保持し pause()
}

function setActiveSource(phase) {
    const nextKey = sourceKeyFor(phase);
    // キーが変わるときだけ旧 source を停止する (同一キーの音は維持)
    if (currentSourceKey !== nextKey) {
        if (currentSourceKey) stopSource(currentSourceKey);
        currentSourceKey = nextKey;
    }
    // startSource は同一キーでも常に呼ぶ。各 manager の play() は
    // 既に再生中なら no-op / 状態維持なので連続再生時の音飛びはなく、
    // 一時停止後の restart や iframe 破棄後の復帰でも確実に再開できる。
    startSource(nextKey);
}

// 一時停止: currentSourceKey は維持し、音だけ止める
function pauseAllSources() {
    if (currentSourceKey) stopSource(currentSourceKey);
}

// リセット: 音を止めて currentSourceKey もクリア
function resetSources() {
    if (currentSourceKey) stopSource(currentSourceKey);
    currentSourceKey = null;
}

// 現在のフェーズを判定 ('work' / 'break')
function currentPhase() {
    switch (status) {
        case STATUS_ENUM.BREAKING.rawValue:
        case STATUS_ENUM.BREAKING_POSE.rawValue:
        case STATUS_ENUM.LONGBREAKING.rawValue:
        case STATUS_ENUM.LONGBREAKING_POSE.rawValue:
            return 'break';
        default:
            return 'work';
    }
}

// 再生中フェーズか (一時停止中・INITIAL を除く)
function isPlayingState() {
    return status === STATUS_ENUM.WORKING.rawValue
        || status === STATUS_ENUM.BREAKING.rawValue
        || status === STATUS_ENUM.LONGBREAKING.rawValue;
}

// URL/キュー変更時に、再生中なら iframe を新内容で差し替える。
// stopSource を経由せず直接 startSource を呼んで音切れを最小化する
// (Voicy.play は innerHTML 上書きで iframe を自然と置換、YouTube.play は
//  キュー更新 + loadVideoById で動画切替を行う)。
// 一時停止中・INITIAL では何もしない (次の start 時に新内容が反映される)。
function refreshActiveSourceIfPlaying() {
    if (!isPlayingState()) return;
    const nextKey = sourceKeyFor(currentPhase());
    if (nextKey === currentSourceKey) return;
    currentSourceKey = nextKey;
    startSource(nextKey);
}

// 連続入力時にリロードが連発しないよう軽い debounce を入れる
let _urlRefreshTimer = null;
function scheduleUrlRefresh() {
    clearTimeout(_urlRefreshTimer);
    _urlRefreshTimer = setTimeout(refreshActiveSourceIfPlaying, 300);
}

// ----------------------------------------------------------------------------
// 画面スリープ防止 (Screen Wake Lock API)
// タイマー再生中 (WORKING / BREAKING / LONGBREAKING) は wake lock を取得し、
// 一時停止 / リセット / 初期状態では解放する。タブが非表示になると wake lock は
// ブラウザにより自動 release されるため、visibilitychange で再取得する。
// ----------------------------------------------------------------------------
let wakeLockSentinel = null;

async function acquireWakeLock() {
    if (!('wakeLock' in navigator)) return;
    if (wakeLockSentinel) return;
    try {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
        wakeLockSentinel.addEventListener('release', () => {
            wakeLockSentinel = null;
        });
    } catch (_) {
        // 取得失敗 (非表示タブ、権限拒否、低電力モード等) は黙殺
        wakeLockSentinel = null;
    }
}

async function releaseWakeLock() {
    if (!wakeLockSentinel) return;
    const s = wakeLockSentinel;
    wakeLockSentinel = null;
    try { await s.release(); } catch (_) { /* 既に release 済みは無視 */ }
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isPlayingState()) {
        acquireWakeLock();
        // 非表示中は setInterval が間引かれ表示が遅れている可能性があるため、
        // 復帰時に実時刻ベースで残り時間を即再計算する (必要なら遷移も走る)。
        timer();
    }
});


// タイマー設定
const timerElement = document.getElementById('timer');
const statusElement = document.getElementById('status');

// ポモドーロ回数設定
const cyclesElement = document.getElementById('cycles');

// ボタンのnode取得
const startButton = document.getElementById('start-btn'); // スタートボタン
const pauseButton = document.getElementById('pause-btn'); // 一時停止ボタン
const restartButton = document.getElementById('restart-btn'); // 再開ボタン
const skipButton = document.getElementById('skip-btn'); // スキップボタン
const resetButton = document.getElementById('reset-btn'); // リセットボタン

const oneSecond = 1000;
const oneMinits = 60;
let WORKTIME_MINUTE = 25;
let BREAKTIME_MINUTE = 5;
let LOG_BREAKTIME_MINUTE = 5;

let workDuration = WORKTIME_MINUTE * oneMinits; // 初期値（秒）
let breakDuration = BREAKTIME_MINUTE * oneMinits; // 初期値（秒）
let longBreakDuration = LOG_BREAKTIME_MINUTE * oneMinits; // 初期値（秒）
let longBreakFrequency = 4; // 初期値

let intervalId;
let cycles = 0;
let time = 0;
// 現在稼働中セグメントの終了時刻 (Date.now() ベースの絶対時刻)。
// setInterval の tick 回数ではなく、この終了時刻と現在時刻の差で残り時間を算出する。
let endTime = 0;

let status;

// メイン処理
function main() {
    // 作業時間でタイマー表示を更新する
    updateTimerDisplay(workDuration);

    status = STATUS_ENUM.INITIAL.rawValue;
    statusElement.textContent = STATUS_ENUM.INITIAL.string;
}

// 表示タイマーの更新
function updateTimerDisplay(time) {
    const minutes = String(Math.floor(time / oneMinits)).padStart(2, '0');
    const seconds = String(time % oneMinits).padStart(2, '0');
    timerElement.textContent = `${minutes}:${seconds}`;
}

// 残り秒数 (time) から終了時刻を確定し、毎秒の再計算を開始する。
// setInterval はバックグラウンドタブ等で間引かれ tick 回数 == 経過秒数 に
// ならない (ドリフトする) ため、tick ごとに「終了時刻 - 現在時刻」で残りを
// 算出する。これにより実時計とのズレが累積しない。
function startCountdown() {
    endTime = Date.now() + time * oneSecond;
    timer();
    intervalId = setInterval(timer, oneSecond);
}

// タイマーのスタート
function startWorkingTimer() {

    startCountdown();

    // 音源は source manager に任せる (旧 source と異なれば自動で停止 + 新 source 開始)
    setActiveSource('work');
    MUSIC_MANAGER2.play();
    acquireWakeLock();

}

// タイマーのスタート
function startBreakingTimer() {

    startCountdown();

    setActiveSource('break');
    MUSIC_MANAGER2.play();
    acquireWakeLock();

}

// リセット
function resetTimer() {
    status = STATUS_ENUM.INITIAL.rawValue;
    statusElement.textContent = STATUS_ENUM.INITIAL.string;
}

function timer() {
    // 終了時刻と現在時刻の差から残り秒数を再計算する (tick 回数の積算ではない)。
    // ceil により「残り 0 秒超〜1 秒」の間は 00:01 を表示し、終了時刻ちょうどで遷移する。
    const remaining = Math.ceil((endTime - Date.now()) / oneSecond);
    if (remaining <= 0) {
        time = 0;
        clearInterval(intervalId);

        // スイッチ文
        switch (status) {
            case STATUS_ENUM.INITIAL.rawValue:
            case STATUS_ENUM.BREAKING.rawValue:
            case STATUS_ENUM.LONGBREAKING.rawValue:
                // 開始→作業中
                status = STATUS_ENUM.WORKING.rawValue;
                statusElement.textContent = STATUS_ENUM.WORKING.string;
                break;
            case STATUS_ENUM.WORKING.rawValue:
                // 長時間休憩のチェック
                if (cycles % longBreakFrequency === 0) {
                    // 作業中→長時間休憩中
                    status = STATUS_ENUM.LONGBREAKING.rawValue;
                    statusElement.textContent = STATUS_ENUM.LONGBREAKING.string;
                } else {
                    // 作業中→休憩中
                    status = STATUS_ENUM.BREAKING.rawValue;
                    statusElement.textContent = STATUS_ENUM.BREAKING.string;
                }
                break;
            default:
                break;
        }

    } else {
        time = remaining;
        updateTimerDisplay(remaining);
    }
}

// ボタンの表示更新
function buttonDisplayUpdate() {
    // スイッチ文
    switch (status) {
        case STATUS_ENUM.INITIAL.rawValue:
            startButton.style.display = 'inline-block';
            pauseButton.style.display = 'none';
            restartButton.style.display = 'none';
            skipButton.style.display = 'none';
            resetButton.style.display = 'none';
            break;
        case STATUS_ENUM.WORKING.rawValue:
            startButton.style.display = 'none';
            pauseButton.style.display = 'inline-block';
            restartButton.style.display = 'none';
            skipButton.style.display = 'inline-block';
            resetButton.style.display = 'inline-block';
            break;
        case STATUS_ENUM.WORKING_POSE.rawValue:
            startButton.style.display = 'none';
            pauseButton.style.display = 'none';
            restartButton.style.display = 'inline-block';
            // 一時停止中は timer() が POSE を処理しないため skip は機能しない。
            // 「見えるのに押せない」状態を避け、操作を再開/リセットに絞る。
            skipButton.style.display = 'none';
            resetButton.style.display = 'inline-block';
            break;
        case STATUS_ENUM.BREAKING.rawValue:
            startButton.style.display = 'none';
            pauseButton.style.display = 'inline-block';
            restartButton.style.display = 'none';
            skipButton.style.display = 'inline-block';
            resetButton.style.display = 'inline-block';
            break;
        case STATUS_ENUM.BREAKING_POSE.rawValue:
            startButton.style.display = 'none';
            pauseButton.style.display = 'none';
            restartButton.style.display = 'inline-block';
            skipButton.style.display = 'none';
            resetButton.style.display = 'inline-block';
            break;
        case STATUS_ENUM.LONGBREAKING.rawValue:
            startButton.style.display = 'none';
            pauseButton.style.display = 'inline-block';
            restartButton.style.display = 'none';
            skipButton.style.display = 'inline-block';
            resetButton.style.display = 'inline-block';
            break;
        case STATUS_ENUM.LONGBREAKING_POSE.rawValue:
            startButton.style.display = 'none';
            pauseButton.style.display = 'none';
            restartButton.style.display = 'inline-block';
            skipButton.style.display = 'none';
            resetButton.style.display = 'inline-block';
            break;
        default:
            break;
    }
}

// タイマーの表示切り替え
function timerDisplayUpdate() {
    switch (status) {
        case STATUS_ENUM.WORKING.rawValue:
            // 作業中
            time = workDuration;
            break;
        case STATUS_ENUM.BREAKING.rawValue:
            // 休憩中
            time = breakDuration;
            break;
        case STATUS_ENUM.LONGBREAKING.rawValue:
            // 長時間休憩中
            time = longBreakDuration;
            break;
        default:
            break;
    }
}

// ポモドーロ回数の表示切り替え
function countupCycles() {
    cycles++;
    cyclesElement.textContent = cycles;
}

// ポモドーロ回数の表示切り替え
function resetCycles() {
    cycles = 0;
    cyclesElement.textContent = cycles;
}

// イベントリスナー
startButton.addEventListener('click', function () {
    // 開始は待機(INITIAL)状態からのみ。作業中などに再発火しても
    // cycles を二重カウントしないようガードする。
    if (status !== STATUS_ENUM.INITIAL.rawValue) return;
    // ステータス→作業中
    status = STATUS_ENUM.WORKING.rawValue;
    statusElement.textContent = STATUS_ENUM.WORKING.string;
});

pauseButton.addEventListener('click', function () {
    // ステータス→一時停止中
    switch (status) {
        case STATUS_ENUM.WORKING.rawValue:
            status = STATUS_ENUM.WORKING_POSE.rawValue;
            statusElement.textContent = STATUS_ENUM.WORKING_POSE.string;
            break;
        case STATUS_ENUM.BREAKING.rawValue:
            status = STATUS_ENUM.BREAKING_POSE.rawValue;
            statusElement.textContent = STATUS_ENUM.BREAKING_POSE.string;
            break;
        case STATUS_ENUM.LONGBREAKING.rawValue:
            status = STATUS_ENUM.LONGBREAKING_POSE.rawValue;
            statusElement.textContent = STATUS_ENUM.LONGBREAKING_POSE.string;
            break;
        default:
            break;
    }

    // 音楽ストップ (currentSourceKey は維持し restart で再開できるようにする)
    pauseAllSources();
    MUSIC_MANAGER2.stop();
    releaseWakeLock();

});

restartButton.addEventListener('click', function () {
    // ステータス→再開
    switch (status) {
        case STATUS_ENUM.WORKING_POSE.rawValue:
            status = STATUS_ENUM.WORKING.rawValue;
            statusElement.textContent = STATUS_ENUM.WORKING.string;
            break;
        case STATUS_ENUM.BREAKING_POSE.rawValue:
            status = STATUS_ENUM.BREAKING.rawValue;
            statusElement.textContent = STATUS_ENUM.BREAKING.string;
            break;
        case STATUS_ENUM.LONGBREAKING_POSE.rawValue:
            status = STATUS_ENUM.LONGBREAKING.rawValue;
            statusElement.textContent = STATUS_ENUM.LONGBREAKING.string;
            break;
        default:
            break;
    }
});

skipButton.addEventListener('click', function () {
    // 終了時刻を現在に倒して即時完了扱いにする (timer() は time ではなく
    // 終了時刻を見るため、time=0 だけでは遷移しない)。
    time = 0;
    endTime = Date.now();
    clearInterval(intervalId);
    timer();
});

resetButton.addEventListener('click', function () {
    // ステータス→開始
    resetCycles();
    status = STATUS_ENUM.INITIAL.rawValue;
    statusElement.textContent = STATUS_ENUM.INITIAL.string;

    // 音楽ストップ (currentSourceKey もクリア)
    resetSources();
    MUSIC_MANAGER2.stop();
    releaseWakeLock();
});

// ステータスの変更を監視
const observer = new MutationObserver((mutationsList) => {
    mutationsList.forEach((mutation) => {
        // textContentが変更されました
        if (mutation.type === 'childList') {
            // ここに変更時の処理を記述
            buttonDisplayUpdate();
            updateActiveSourceDisplay();
            clearInterval(intervalId);
            switch (status) {
                case STATUS_ENUM.INITIAL.rawValue:
                    break;
                case STATUS_ENUM.WORKING.rawValue:
                    // 直前のステータスが一時停止中の場合
                    if (mutation.removedNodes[0]?.textContent !== STATUS_ENUM.WORKING_POSE.string) {
                        countupCycles();
                        timerDisplayUpdate();
                    }
                    startWorkingTimer();
                    break;
                case STATUS_ENUM.WORKING_POSE.rawValue:
                    break;
                case STATUS_ENUM.BREAKING.rawValue:
                    // 直前のステータスが一時停止中の場合
                    if (mutation.removedNodes[0]?.textContent !== STATUS_ENUM.BREAKING_POSE.string) {
                        timerDisplayUpdate();
                    }
                    startBreakingTimer();
                    break;
                case STATUS_ENUM.BREAKING_POSE.rawValue:
                    break;
                case STATUS_ENUM.LONGBREAKING.rawValue:
                    // 直前のステータスが一時停止中の場合
                    if (mutation.removedNodes[0]?.textContent !== STATUS_ENUM.LONGBREAKING_POSE.string) {
                        timerDisplayUpdate();
                    }
                    startBreakingTimer();
                    break;
                case STATUS_ENUM.LONGBREAKING_POSE.rawValue:
                    break;
                default:
                    break;
            }
        }
    });
});

// 監視を開始（子ノードの変更を監視）
observer.observe(statusElement,
    {
        childList: true,
        characterData: true,
        characterDataOldValue: true,
        subtree: true // ← これを入れないと characterData は無視される
    }
);

// 拡張機能 (extension/) から呼ばれるフック。
// ES module スコープを跨いで呼ぶため明示的に window へ生やす。
// 引数 urls: YouTube 動画 URL の配列。返り値: { added: 実際に追加された件数 }。
window.PomodoroTimer = window.PomodoroTimer || {};
window.PomodoroTimer.addYouTubeUrls = function (urls) {
    if (!Array.isArray(urls)) return { added: 0 };

    const existingIds = new Set(
        getYouTubeUrls()
            .map((u) => YOUTUBE_MANAGER.extractVideoId(u))
            .filter(Boolean)
    );

    // 末尾の空行を一旦取り除いて、後で ensureTrailingEmpty() で復元する
    const last = youtubeListContainer && youtubeListContainer.lastElementChild;
    const lastInput = last && last.querySelector('input[type="url"]');
    if (lastInput && lastInput.value.trim() === '') last.remove();

    let added = 0;
    for (const u of urls) {
        const id = YOUTUBE_MANAGER.extractVideoId(u);
        if (!id) continue;
        if (existingIds.has(id)) continue;
        addYouTubeUrlInput(u);
        existingIds.add(id);
        added++;
    }

    ensureTrailingEmpty();
    saveAudioSourceSettings();
    scheduleUrlRefresh();
    return { added };
};

// 拡張機能インストール検出: content script (extension/content.js) が MAIN world で
// document_start に window.__POMODORO_YT_EXTENSION__ を立てるため、load 完了時点で
// 同期的にチェックすれば判定できる。未インストールかつ「今後表示しない」が立っていない
// ときだけ Bootstrap モーダルを表示する。
const EXT_DISMISS_KEY = 'pomodoro_yt_ext_dismissed';
window.addEventListener('load', () => {
    if (window.__POMODORO_YT_EXTENSION__) return;
    try {
        if (localStorage.getItem(EXT_DISMISS_KEY) === 'true') return;
    } catch (_) { /* localStorage 不可は無視して表示する */ }
    const modalEl = document.getElementById('extInstallModal');
    if (!modalEl || typeof bootstrap === 'undefined') return;
    const modal = new bootstrap.Modal(modalEl);
    modalEl.addEventListener('hidden.bs.modal', () => {
        const dismiss = document.getElementById('extDismissForever');
        if (dismiss && dismiss.checked) {
            try { localStorage.setItem(EXT_DISMISS_KEY, 'true'); } catch (_) { }
        }
    }, { once: true });
    modal.show();
});

// ----------------------------------------------------------------------------
// Google カレンダー連携 (Calendar API・予定をタスクとして扱い、チェックで
// その予定の色を「グレー(グラファイト)」に書き換えて完了表現する)
// ----------------------------------------------------------------------------
// 設定欄の OAuth クライアント ID を localStorage に保存し、Google Identity
// Services でアクセストークンを取得 → 今日の予定を取得してチェックリスト表示する。
// チェック(=完了)すると、その予定の colorId をグラファイト(グレー)に書き換えて
// Google カレンダー側へ反映する (events.patch)。チェックを外すと元の色へ戻す。
// 完了かどうかは「色がグレーか」で判定する (= ユーザーのグレーアウト運用に一致)。
// アクセストークンは有効期限付きで localStorage にキャッシュし、期限内はダイアログも
// Google への往復も無しで復元する (期限切れ/401 は即破棄して無言で取り直す)。
const GCAL_CLIENT_ID_KEY = 'pomodoro_gcal_client_id';
// 予定の色を書き換えるため events の読み書きスコープが必要。
// openid/email は「どのアカウントで連携したか」を記憶して無言再認証 (login_hint) に使う。
// これが無いと、ブラウザに複数の Google アカウントがログインしている環境では
// prompt:'' の無言取得が account_selection_required で必ず失敗し、毎回アカウント選択が出る。
const GCAL_SCOPE = 'openid email https://www.googleapis.com/auth/calendar.events';
// 完了マークに使う色 = Google カレンダーの colorId '8' (Graphite / グレー)
const GCAL_DONE_COLOR = '8';
// 過去に接続(同意)済みかの記録キー。次回以降の無言再接続に使う
const GCAL_CONNECTED_KEY = 'pomodoro_gcal_connected';
// グレーにする前の元の色を保存するキー (リロードしても元色を失わないため)
const GCAL_ORIG_COLOR_KEY = 'pomodoro_gcal_orig_colors';
// カレンダー側で色を変えられない予定 (Google Contacts 由来の誕生日など) を
// この画面だけで完了として覚えるキー。events.patch が 400 eventTypeRestriction を
// 返す予定が該当する。
const GCAL_LOCAL_DONE_KEY = 'pomodoro_gcal_local_done';
// 連携したアカウントのメール。無言再認証の login_hint に使う
const GCAL_ACCOUNT_KEY = 'pomodoro_gcal_account';
// アクセストークンのキャッシュ ({ token, expiresAt })。期限内は再取得しない
const GCAL_TOKEN_KEY = 'pomodoro_gcal_token';
// 期限ぎりぎりで使って 401 になるのを避けるための前倒し (1 分)
const GCAL_TOKEN_SKEW_MS = 60 * 1000;

const gcalSetupBox = document.getElementById('gcal-setup');
const gcalClientIdInput = document.getElementById('gcal-client-id');
const gcalConnectBtn = document.getElementById('gcal-connect-btn');
const gcalRefreshBtn = document.getElementById('gcal-refresh-btn');
const gcalEventList = document.getElementById('gcal-event-list');
const gcalStatus = document.getElementById('gcal-status');
const gcalProgress = document.getElementById('gcal-progress');
const gcalProgressBar = document.getElementById('gcal-progress-bar');
const gcalProgressLabel = document.getElementById('gcal-progress-label');

let gcalTokenClient = null;
let gcalAccessToken = null;        // メモリのみ (永続化しない)
let gcalEvents = [];               // 今日の予定 [{ id, title, allDay, start, colorId }]
// チェックを外したときに復元するため、グレーにする前の色を覚えておく (localStorage 永続)
const gcalOrigColor = loadGcalOrigColors();
// カレンダーへ書き戻せない予定の完了を、この画面だけで覚える (localStorage 永続)
const gcalLocalDone = loadGcalLocalDone();
// 接続処理の状態管理
let gcalConnectMode = 'manual';    // 'auto'=起動時の無言復元 / 'manual'=ボタン操作
let gcalAuthInFlight = false;      // 多重の再認証要求を防ぐ

function getGcalClientId() {
    try { return (localStorage.getItem(GCAL_CLIENT_ID_KEY) || '').trim(); } catch (_) { return ''; }
}

// 一度でも接続(同意)できたかを記録する。次回以降は無言で接続を復元するために使う。
// アクセストークン自体は保存しない (毎回 Google から無言取得する)。
function isGcalConnectedBefore() {
    try { return localStorage.getItem(GCAL_CONNECTED_KEY) === '1'; } catch (_) { return false; }
}
function setGcalConnectedFlag(connected) {
    try {
        if (connected) localStorage.setItem(GCAL_CONNECTED_KEY, '1');
        else localStorage.removeItem(GCAL_CONNECTED_KEY);
    } catch (_) { /* 無視 */ }
}

// 連携アカウント (メール) の記憶。無言再認証の login_hint に渡すためだけに使う。
function getGcalAccountHint() {
    try { return (localStorage.getItem(GCAL_ACCOUNT_KEY) || '').trim(); } catch (_) { return ''; }
}
function setGcalAccountHint(email) {
    try {
        if (email) localStorage.setItem(GCAL_ACCOUNT_KEY, email);
        else localStorage.removeItem(GCAL_ACCOUNT_KEY);
    } catch (_) { /* 無視 */ }
}

// 接続に使ったアカウントのメールを userinfo から控える (失敗しても連携自体は続行)。
// force=true (手動接続の成功時) は控え直す: 別アカウントを選び直した可能性があるため。
async function rememberGcalAccount(token, force) {
    if (!token) return;
    if (!force && getGcalAccountHint()) return;   // 既に控えていれば再取得しない
    try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const info = await res.json();
        if (info && info.email) setGcalAccountHint(info.email);
        else if (force) setGcalAccountHint('');   // 取れなかったら古い hint は残さない
    } catch (_) { /* 取得できなくても無言再認証を試すだけなので無視 */ }
}

// アクセストークンのキャッシュ。期限内 (前倒しぶんを引いた時点まで) のみ有効。
function loadGcalToken() {
    try {
        const raw = JSON.parse(localStorage.getItem(GCAL_TOKEN_KEY) || 'null');
        if (!raw || !raw.token || !raw.expiresAt) return null;
        if (Date.now() >= raw.expiresAt - GCAL_TOKEN_SKEW_MS) { clearGcalToken(); return null; }
        return raw.token;
    } catch (_) { return null; }
}
function saveGcalToken(token, expiresInSec) {
    const sec = Number(expiresInSec);
    if (!token || !Number.isFinite(sec) || sec <= 0) { clearGcalToken(); return; }
    try {
        localStorage.setItem(GCAL_TOKEN_KEY, JSON.stringify({
            token, expiresAt: Date.now() + sec * 1000,
        }));
    } catch (_) { /* 無視 */ }
}
function clearGcalToken() {
    try { localStorage.removeItem(GCAL_TOKEN_KEY); } catch (_) { /* 無視 */ }
}

// グレーにする前の元の色 (id -> colorId 文字列。''=既定色) を localStorage と同期する。
// リロードをまたいでもチェック解除時に元の色へ正しく戻せるようにするため。
function loadGcalOrigColors() {
    try {
        const obj = JSON.parse(localStorage.getItem(GCAL_ORIG_COLOR_KEY) || '{}');
        return new Map(obj && typeof obj === 'object' ? Object.entries(obj) : []);
    } catch (_) { return new Map(); }
}
function saveGcalOrigColors(map) {
    try { localStorage.setItem(GCAL_ORIG_COLOR_KEY, JSON.stringify(Object.fromEntries(map))); } catch (_) { /* 無視 */ }
}

// カレンダー側の色を変えられない予定 (誕生日など) の「この画面だけの完了」を出し入れする。
function loadGcalLocalDone() {
    try {
        const arr = JSON.parse(localStorage.getItem(GCAL_LOCAL_DONE_KEY) || '[]');
        return new Set(Array.isArray(arr) ? arr.filter((v) => typeof v === 'string') : []);
    } catch (_) { return new Set(); }
}
function saveGcalLocalDone() {
    try {
        localStorage.setItem(GCAL_LOCAL_DONE_KEY, JSON.stringify([...gcalLocalDone]));
    } catch (_) { /* 無視 */ }
}

// 認証に失敗/期限切れしたときの後始末。接続ボタンを再表示して手動接続へ誘導する。
// 接続済みフラグは消さない: 手動接続は常に対話モードなので消す必要がなく、
// 消すと「無言取得が使える環境」で次回以降の自動復元まで止めてしまうため。
function onGcalAuthFailure(msg) {
    gcalAccessToken = null;
    clearGcalToken();
    if (gcalRefreshBtn) gcalRefreshBtn.style.display = 'none';
    if (gcalConnectBtn) { gcalConnectBtn.style.display = ''; gcalConnectBtn.disabled = !getGcalClientId(); }
    updateGcalSetupVisibility();
    setGcalStatus(msg || '「Google と接続」を押すと今日の予定を表示します。');
}

// 予定が「完了(グレーアウト済み)」かは色で判定する
// 予定が「完了」かは色で判定する。ただし色を変えられない予定 (誕生日など) は
// カレンダー側がグレーにならないので、この画面で覚えた完了も見る。
function isEventDone(ev) {
    if (!ev) return false;
    return ev.colorId === GCAL_DONE_COLOR || gcalLocalDone.has(ev.id);
}

function setGcalStatus(msg) {
    if (!gcalStatus) return;
    gcalStatus.textContent = msg || '';
    gcalStatus.style.display = msg ? '' : 'none';
}

// クライアント ID の有無で接続ボタンの活性を切り替える
function refreshGcalButtons() {
    if (gcalConnectBtn) gcalConnectBtn.disabled = !getGcalClientId();
    updateGcalSetupVisibility();
}

// OAuth クライアント ID の欄は「まだ連携できていないとき」だけ出す。
// 接続できた後は「今日の予定」を見るのが目的なので、設定は畳んでおく。
// 判定は接続ボタンの表示状態にそろえる (= 接続済みなら接続ボタンは隠れている)。
function updateGcalSetupVisibility() {
    if (!gcalSetupBox) return;
    const connected = !!gcalConnectBtn && gcalConnectBtn.style.display === 'none';
    gcalSetupBox.style.display = connected ? 'none' : '';
}

// 今日 (ローカルタイムゾーン) の 00:00〜翌 00:00 を RFC3339 で返す
function todayRange() {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

// Google Identity Services のトークンクライアントを (再)生成する。
// GIS 未ロード / クライアント ID 未設定なら null。
function ensureGcalTokenClient() {
    const clientId = getGcalClientId();
    if (!clientId) return null;
    if (!(window.google && google.accounts && google.accounts.oauth2)) return null;
    if (!gcalTokenClient || gcalTokenClient.__clientId !== clientId) {
        gcalTokenClient = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: GCAL_SCOPE,
            callback: (resp) => {
                gcalAuthInFlight = false;
                const auto = gcalConnectMode === 'auto';
                gcalConnectMode = 'manual';
                if (resp && resp.access_token) {
                    gcalAccessToken = resp.access_token;
                    setGcalConnectedFlag(true);   // 次回以降は無言復元を試みる
                    saveGcalToken(resp.access_token, resp.expires_in);
                    // 次回の login_hint 用に控える (待たない)。手動接続はアカウントを
                    // 選び直せるので、そのときは控え直す。
                    rememberGcalAccount(resp.access_token, !auto);
                    fetchTodayEvents();
                } else {
                    onGcalAuthFailure(auto
                        ? '「Google と接続」を押すと今日の予定を表示します。'
                        : '接続できませんでした。許可画面で予定の閲覧・編集を許可のうえ、もう一度お試しください。');
                }
            },
            // 無言取得の失敗・同意拒否・ポップアップ閉じ等はこちらに来る。
            // 起動時の無言復元(auto)が失敗したときは、壊れた印象を与えないよう穏やかに案内する。
            error_callback: () => {
                gcalAuthInFlight = false;
                const auto = gcalConnectMode === 'auto';
                gcalConnectMode = 'manual';
                onGcalAuthFailure(auto
                    ? '「Google と接続」を押すと今日の予定を表示します。'
                    : '接続できませんでした。許可画面で予定の閲覧・編集を許可のうえ、もう一度お試しください。');
            },
        });
        gcalTokenClient.__clientId = clientId;
    }
    return gcalTokenClient;
}

// prompt: 'consent' = 同意画面を出す / '' = 無言取得を試みる
// config はそのまま requestAccessToken へ渡す。
// 対話接続 = {} (必要に応じ UI を表示) / 無言接続 = { prompt: '' }
function requestGcalToken(config) {
    if (gcalAuthInFlight) return;   // 多重の再認証要求を防ぐ
    const tc = ensureGcalTokenClient();
    if (!tc) {
        setGcalStatus('Google ライブラリの読み込み、またはクライアント ID をご確認ください。');
        return;
    }
    gcalAuthInFlight = true;
    tc.requestAccessToken(config || {});
}

// 無言取得 (prompt:'') の設定。連携アカウントを控えていれば login_hint を必ず添える。
// 複数アカウントがログインしている環境では、これが無いと Google がどのセッションを
// 使うか決められず account_selection_required で失敗する (= 毎回アカウント選択が出る)。
function silentGcalConfig() {
    const cfg = { prompt: '' };
    const hint = getGcalAccountHint();
    if (hint) cfg.login_hint = hint;
    return cfg;
}

// トークン失効 (401) 時の取り直し。まず無言で試し、駄目なら error_callback が
// 接続ボタンを再表示する。いきなり対話 UI を出さないことで画面の割り込みを減らす。
function refreshGcalTokenSilently() {
    gcalAccessToken = null;
    clearGcalToken();
    if (!isGcalConnectedBefore()) { connectGcal(); return; }
    gcalConnectMode = 'auto';
    setGcalStatus('接続を更新しています…');
    whenGisReady(() => requestGcalToken(silentGcalConfig()));
}

// 「Google と接続」ボタン (ユーザー操作)。常に対話モードで呼ぶ。
// こうすることで、無言取得が 3rd-party cookie 制限などで失敗する環境でも、
// 同意/アカウント選択 UI が出て確実に接続できる (= ボタンが効かない状態を防ぐ)。
function connectGcal() {
    if (!getGcalClientId()) { setGcalStatus('先に OAuth クライアント ID を設定してください。'); return; }
    gcalConnectMode = 'manual';
    setGcalStatus('Google に接続しています…');
    requestGcalToken({});
}

// GIS ライブラリ (gsi/client) は async 読み込みのため、準備できてから cb を呼ぶ
function whenGisReady(cb) {
    if (window.google && google.accounts && google.accounts.oauth2) { cb(); return; }
    let tries = 0;
    const t = setInterval(() => {
        if (window.google && google.accounts && google.accounts.oauth2) { clearInterval(t); cb(); }
        else if (++tries > 40) { clearInterval(t); } // 約10秒で諦める
    }, 250);
}

// 起動時: クライアント ID があり過去に接続済みなら、ボタンを押さずに無言で復元する。
// 失敗時は error_callback が接続ボタンを再表示する。
function autoConnectGcalIfPossible() {
    if (!getGcalClientId() || !isGcalConnectedBefore()) return;
    // 期限内のトークンが残っていれば、Google への往復も画面の割り込みも無しで復元する
    const cached = loadGcalToken();
    if (cached) {
        gcalAccessToken = cached;
        fetchTodayEvents();
        return;
    }
    gcalConnectMode = 'auto';
    setGcalStatus('接続を復元しています…');
    whenGisReady(() => requestGcalToken(silentGcalConfig()));
}

async function fetchTodayEvents() {
    if (!gcalAccessToken) { connectGcal(); return; }
    setGcalStatus('今日の予定を取得しています…');
    const { timeMin, timeMax } = todayRange();
    const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
        + `?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`
        + '&singleEvents=true&orderBy=startTime&maxResults=50';
    try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${gcalAccessToken}` } });
        if (res.status === 401) {        // トークン失効 → まず無言で取り直す
            refreshGcalTokenSilently();
            return;
        }
        if (!res.ok) { setGcalStatus(`予定を取得できませんでした (HTTP ${res.status})。`); return; }
        const data = await res.json();
        gcalEvents = (data.items || []).map((ev) => ({
            id: ev.id,
            title: ev.summary || '(タイトルなし)',
            allDay: !!(ev.start && ev.start.date && !ev.start.dateTime),
            start: (ev.start && (ev.start.dateTime || ev.start.date)) || '',
            colorId: ev.colorId || '',
        }));
        // 今日の予定に無い id は捨てる (前日までの分が溜まらないようにする)
        const todayIds = new Set(gcalEvents.map((e) => e.id));
        let pruned = false;
        for (const id of gcalLocalDone) {
            if (!todayIds.has(id)) { gcalLocalDone.delete(id); pruned = true; }
        }
        if (pruned) saveGcalLocalDone();

        renderGcalEvents();
    } catch (_) {
        setGcalStatus('予定の取得中にエラーが発生しました。通信状況をご確認ください。');
    }
}

function formatEventTime(ev) {
    if (ev.allDay) return '終日';
    const d = new Date(ev.start);
    if (isNaN(d.getTime())) return '';
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function updateGcalProgress() {
    const total = gcalEvents.length;
    const doneCount = gcalEvents.filter(isEventDone).length;
    if (gcalProgressLabel) {
        gcalProgressLabel.textContent = `${doneCount} / ${total}`;
        gcalProgressLabel.style.display = total ? '' : 'none';
    }
    if (gcalProgress) gcalProgress.style.display = total ? '' : 'none';
    if (gcalProgressBar) {
        const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);
        gcalProgressBar.style.width = pct + '%';
        gcalProgressBar.setAttribute('aria-valuenow', String(pct));
    }
}

// events.patch の 400 が「この種類の予定は変更できない」ものかを見分ける。
// 例: Google Contacts の誕生日は colorId を変えられず reason=eventTypeRestriction が返る。
// それ以外の 400 (リクエスト不正など) は本物の失敗として扱いたいので区別する。
async function isEventTypeRestriction(res) {
    try {
        const data = await res.json();
        const errors = (data && data.error && data.error.errors) || [];
        return errors.some((e) => e && e.reason === 'eventTypeRestriction');
    } catch (_) { return false; }
}

// 予定の colorId を Google カレンダーへ書き換える。done=true でグレー、
// false で元の色へ戻す (元が既定色なら colorId を空にして既定へ)。成功で true。
async function patchEventColor(ev, done) {
    if (!gcalAccessToken) return false;
    const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events/'
        + encodeURIComponent(ev.id);
    let body;
    if (done) {
        body = { colorId: GCAL_DONE_COLOR };
    } else {
        const orig = gcalOrigColor.has(ev.id) ? gcalOrigColor.get(ev.id) : '';
        // 元が既定色 (colorId なし) のときは null を送って既定色へ戻す
        body = { colorId: orig || null };
    }
    try {
        const res = await fetch(url, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${gcalAccessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (res.status === 401) { refreshGcalTokenSilently(); return false; }
        // Google Contacts 由来の誕生日など、種類の都合で色を変えられない予定。
        // カレンダーには書き戻せないので、この画面だけで完了として覚える。
        if (res.status === 400 && await isEventTypeRestriction(res)) {
            if (done) gcalLocalDone.add(ev.id); else gcalLocalDone.delete(ev.id);
            saveGcalLocalDone();
            setGcalStatus(done
                ? 'この予定はカレンダー側で色を変更できないため (誕生日など)、この画面でのみ完了にしました。'
                : 'この予定はカレンダー側で色を変更できないため (誕生日など)、この画面での完了を取り消しました。');
            return true;
        }
        if (!res.ok) { setGcalStatus(`カレンダーへの反映に失敗しました (HTTP ${res.status})。`); return false; }
        // 通常の予定は色で完了を持つので、画面だけの完了は持ち越さない
        if (!done && gcalLocalDone.delete(ev.id)) saveGcalLocalDone();
        return true;
    } catch (_) {
        setGcalStatus('カレンダーへの反映中にエラーが発生しました。');
        return false;
    }
}

function renderGcalEvents() {
    if (!gcalEventList) return;
    gcalEventList.innerHTML = '';

    // 接続済みになったらボタンを「更新」に切り替える
    if (gcalConnectBtn) gcalConnectBtn.style.display = 'none';
    if (gcalRefreshBtn) gcalRefreshBtn.style.display = '';
    updateGcalSetupVisibility();

    if (gcalEvents.length === 0) {
        setGcalStatus('今日の予定はありません。');
        updateGcalProgress();
        return;
    }
    setGcalStatus('');

    gcalEvents.forEach((ev) => {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex align-items-center gap-2 px-0';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'form-check-input mt-0 flex-shrink-0';
        cb.checked = isEventDone(ev);
        cb.setAttribute('aria-label', '完了 (カレンダーをグレーアウト)');

        const time = document.createElement('span');
        time.className = 'text-muted flex-shrink-0 text-end';
        time.style.minWidth = '3.4em';
        time.textContent = formatEventTime(ev);

        const title = document.createElement('span');
        title.className = 'flex-grow-1';
        title.textContent = ev.title; // textContent で XSS を防ぐ

        function applyDoneStyle() {
            const done = isEventDone(ev);
            title.classList.toggle('text-decoration-line-through', done);
            title.classList.toggle('text-muted', done);
        }
        applyDoneStyle();

        cb.addEventListener('change', async () => {
            const want = cb.checked;
            const prevColor = ev.colorId;
            // グレーにする前の色を控える (復元用・localStorage 永続)。既に控えていれば上書きしない
            if (want && !gcalOrigColor.has(ev.id)) {
                gcalOrigColor.set(ev.id, prevColor || '');
                saveGcalOrigColors(gcalOrigColor);
            }
            // 楽観的に反映 → 失敗時はロールバック
            ev.colorId = want ? GCAL_DONE_COLOR : (gcalOrigColor.get(ev.id) || '');
            applyDoneStyle();
            updateGcalProgress();
            cb.disabled = true;
            const ok = await patchEventColor(ev, want);
            cb.disabled = false;
            if (!ok) {
                ev.colorId = prevColor;
            } else if (!want) {
                // 元の色へ戻せたので控えを破棄する
                gcalOrigColor.delete(ev.id);
                saveGcalOrigColors(gcalOrigColor);
            }
            // 完了かどうかは書き戻しの結果で決まる (色を変えられない予定は画面だけの
            // 完了になる) ので、確定してからもう一度そろえる。
            cb.checked = isEventDone(ev);
            applyDoneStyle();
            updateGcalProgress();
        });

        li.append(cb, time, title);
        gcalEventList.appendChild(li);
    });
    updateGcalProgress();
}

if (gcalClientIdInput) {
    gcalClientIdInput.value = getGcalClientId();
    gcalClientIdInput.addEventListener('input', () => {
        try { localStorage.setItem(GCAL_CLIENT_ID_KEY, gcalClientIdInput.value.trim()); } catch (_) { /* 無視 */ }
        refreshGcalButtons();
    });
}
if (gcalConnectBtn) gcalConnectBtn.addEventListener('click', connectGcal);
if (gcalRefreshBtn) gcalRefreshBtn.addEventListener('click', fetchTodayEvents);
refreshGcalButtons();
// 過去に接続済みなら、ページを開いた時点で無言で再接続を試みる (ボタン押下不要)
autoConnectGcalIfPossible();

// ---------------------------------------------------------------------------
// サイドバーのアコーディオン (今日の予定 / 設定) の開閉状態を localStorage に覚える。
// 既定は「今日の予定=開く / 設定=畳む」= ページを開いた瞬間に予定が目に入る状態。
// 一度ユーザーが開閉したら次回もその状態で開く。
const SIDEBAR_PANELS_KEY = 'pomodoro_sidebar_panels';
const SIDEBAR_PANEL_DEFAULTS = { today: true, settings: false };

function loadSidebarPanels() {
    try {
        const saved = JSON.parse(localStorage.getItem(SIDEBAR_PANELS_KEY) || 'null');
        if (!saved || typeof saved !== 'object') return { ...SIDEBAR_PANEL_DEFAULTS };
        return {
            today: typeof saved.today === 'boolean' ? saved.today : SIDEBAR_PANEL_DEFAULTS.today,
            settings: typeof saved.settings === 'boolean' ? saved.settings : SIDEBAR_PANEL_DEFAULTS.settings,
        };
    } catch (_) { return { ...SIDEBAR_PANEL_DEFAULTS }; }
}

function saveSidebarPanel(name, open) {
    try {
        const cur = loadSidebarPanels();
        cur[name] = !!open;
        localStorage.setItem(SIDEBAR_PANELS_KEY, JSON.stringify(cur));
    } catch (_) { /* 無視 */ }
}

// Bootstrap の Collapse を作る前に class / aria を直接あてる。
// こうするとアニメーション無しで最初からその状態で描画される (ちらつき防止)。
function applySidebarPanelState(panel, toggle, open) {
    if (!panel || !toggle) return;
    panel.classList.toggle('show', open);
    toggle.classList.toggle('collapsed', !open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function initSidebarPanels() {
    const state = loadSidebarPanels();
    [['today', 'panel-today'], ['settings', 'panel-settings']].forEach(([name, id]) => {
        const panel = document.getElementById(id);
        const toggle = document.getElementById(id + '-toggle');
        if (!panel || !toggle) return;
        applySidebarPanelState(panel, toggle, state[name]);
        panel.addEventListener('shown.bs.collapse', () => saveSidebarPanel(name, true));
        panel.addEventListener('hidden.bs.collapse', () => saveSidebarPanel(name, false));
    });
}
initSidebarPanels();

// テスト用フック: 実 OAuth / 通信なしで描画・チェック永続化を検証できるようにする。
// (本番動作には不要だが、外部依存をブロックする QA 環境で UI を検証するため)
window.PomodoroTimer = window.PomodoroTimer || {};
// ローカル再生の内部状態を覗くフック (ヘッドレスでは実再生ができないため)
window.PomodoroTimer.__localState = function () {
    return {
        currentId: LOCAL_MANAGER.currentId,
        usingVideo: !!LOCAL_MANAGER._usingVideo,
        queueIds: localQueueIds(),
        allIds: localItems.map((it) => it.id),
    };
};
window.PomodoroTimer.__rotateLocal = function (id) { rotateLocalItemToEnd(id); };
window.PomodoroTimer.__setGcalEvents = function (events) {
    gcalEvents = Array.isArray(events) ? events : [];
    renderGcalEvents();
};

main();
updateActiveSourceDisplay();