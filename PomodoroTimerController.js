import { MusicManager, VoicyManager, YouTubeManager } from "./MusicManager.js";

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
    { onVideoEnded: (videoId) => removeYouTubeUrlByVideoId(videoId) }
);

// 音源設定 UI
const workSourceSelect = document.getElementById('work-source');
const breakSourceSelect = document.getElementById('break-source');
const voicyUrlInput = document.getElementById('voicy-url');
const youtubeListContainer = document.getElementById('youtube-url-list');

const DEFAULT_VOICY_URL = 'https://voicy.jp/embed/channel/941';

// 音源設定の localStorage 永続化
const AUDIO_SETTINGS_KEY = 'pomodoro_audio_source_settings';
const VALID_SOURCES = ['bgm', 'voicy', 'youtube', 'none'];

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

loadAudioSourceSettings();

// アクティブ音源カードの表示要素
const activeSourceLabel = document.getElementById('active-source-label');
const activePhaseBadge = document.getElementById('active-phase-badge');
const sourceWrappers = {
    bgmWork: document.getElementById('workBgmWrapper'),
    bgmBreak: document.getElementById('breakBgmWrapper'),
    voicy: document.getElementById('voicyWrapper'),
    youtube: document.getElementById('youtubeWrapper'),
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

function onSourceSettingChange() {
    saveAudioSourceSettings();
    updateActiveSourceDisplay();
}

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
}

function stopSource(key) {
    if (!key || key === 'none') return;
    if (key === 'bgm-work')              MUSIC_MANAGER.stop();
    else if (key === 'bgm-break')        MUSIC_MANAGER3.stop();
    else if (key.startsWith('voicy:'))   VOICY_MANAGER.destroy();  // iframe を DOM から削除
    else if (key.startsWith('youtube:')) YOUTUBE_MANAGER.pause();  // iframe は保持し pauseVideo()
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

// セッティングフォーム
const settingsForm = document.getElementById('settings-form');

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

// 設定の保存
settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    workDuration = document.getElementById('work-duration').value * oneMinits;
    breakDuration = document.getElementById('break-duration').value * oneMinits;
    longBreakDuration = document.getElementById('long-break-duration').value * oneMinits;
    longBreakFrequency = document.getElementById('long-break-frequency').value;
    resetTimer();
});

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

main();
updateActiveSourceDisplay();