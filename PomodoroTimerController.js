import { MusicManager, VoicyManager, YouTubeManager } from "./MusicManager.js";

// 定義 なので、constを用いる
const STATUS_ENUM = {
    INITIAL: {
        rawValue: 1,
        string: "開始",
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
const youtubeAddButton = document.getElementById('youtube-url-add');

const DEFAULT_VOICY_URL = 'https://voicy.jp/embed/channel/941';

// 音源設定の localStorage 永続化
const AUDIO_SETTINGS_KEY = 'pomodoro_audio_source_settings';
const VALID_SOURCES = ['bgm', 'voicy', 'youtube', 'none'];

function loadAudioSourceSettings() {
    let restoredUrls = [];
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
                restoredUrls = s.youtubeUrls.filter((u) => typeof u === 'string');
            } else if (typeof s.youtubeUrl === 'string' && s.youtubeUrl) {
                // 旧データ (単一文字列) からの移行
                restoredUrls = [s.youtubeUrl];
            }
        }
    } catch (_) { /* localStorage 不可・JSON 不正は既定値で続行 */ }
    // YouTube URL 入力欄を復元 (最低 1 欄は空でも保持)
    if (youtubeListContainer) {
        youtubeListContainer.innerHTML = '';
        if (restoredUrls.length === 0) restoredUrls = [''];
        restoredUrls.forEach((u) => addYouTubeUrlInput(u));
    }
}

function saveAudioSourceSettings() {
    try {
        const data = {
            workSource: workSourceSelect ? workSourceSelect.value : 'bgm',
            breakSource: breakSourceSelect ? breakSourceSelect.value : 'bgm',
            voicyUrl: voicyUrlInput ? voicyUrlInput.value : '',
            youtubeUrls: getYouTubeUrls(),
        };
        localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(data));
    } catch (_) { /* localStorage 不可は無視 */ }
}

// ----------------------------------------------------------------------------
// YouTube URL 入力欄の動的管理 (キュー入力)
// ----------------------------------------------------------------------------
function getYouTubeUrls() {
    if (!youtubeListContainer) return [];
    return Array.from(youtubeListContainer.querySelectorAll('input[type="url"]'))
        .map((input) => input.value.trim())
        .filter((v) => v.length > 0);
}

function addYouTubeUrlInput(initialValue = '') {
    if (!youtubeListContainer) return;
    const row = document.createElement('div');
    row.className = 'input-group input-group-sm mb-2';
    row.innerHTML = `
        <input type="url" class="form-control" placeholder="https://www.youtube.com/watch?v=...">
        <button type="button" class="btn btn-outline-danger" aria-label="削除">×</button>
    `;
    const input = row.querySelector('input');
    const removeBtn = row.querySelector('button');
    input.value = initialValue;
    input.addEventListener('input', () => {
        saveAudioSourceSettings();
        scheduleUrlRefresh();
    });
    removeBtn.addEventListener('click', () => {
        row.remove();
        // 1 欄は必ず残す (空欄でも保持)
        if (youtubeListContainer.children.length === 0) {
            addYouTubeUrlInput('');
        }
        saveAudioSourceSettings();
        scheduleUrlRefresh();
    });
    youtubeListContainer.appendChild(row);
}

if (youtubeAddButton) {
    youtubeAddButton.addEventListener('click', () => {
        addYouTubeUrlInput('');
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
            const row = input.closest('.input-group');
            if (row) row.remove();
            break;
        }
    }
    if (youtubeListContainer.children.length === 0) {
        addYouTubeUrlInput('');
    }
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
            [STATUS_ENUM.INITIAL.rawValue]: { text: '停止中', cls: 'bg-secondary' },
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

function youtubeQueueIds() {
    return getYouTubeUrls()
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
    else if (key.startsWith('youtube:')) YOUTUBE_MANAGER.play(getYouTubeUrls());
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

// タイマーのスタート
function startWorkingTimer() {

    timer();
    intervalId = setInterval(timer, oneSecond);

    // 音源は source manager に任せる (旧 source と異なれば自動で停止 + 新 source 開始)
    setActiveSource('work');
    MUSIC_MANAGER2.play();
    acquireWakeLock();

}

// タイマーのスタート
function startBreakingTimer() {

    timer();
    intervalId = setInterval(timer, oneSecond);

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
    if (time <= 0) {
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
        updateTimerDisplay(time);
        time--;
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
            skipButton.style.display = 'inline-block';
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
            skipButton.style.display = 'inline-block';
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
            skipButton.style.display = 'inline-block';
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
    time = 0;
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
                    if (mutation.removedNodes[0].textContent !== STATUS_ENUM.WORKING_POSE.string) {
                        countupCycles();
                        timerDisplayUpdate();
                    }
                    startWorkingTimer();
                    break;
                case STATUS_ENUM.WORKING_POSE.rawValue:
                    break;
                case STATUS_ENUM.BREAKING.rawValue:
                    // 直前のステータスが一時停止中の場合
                    if (mutation.removedNodes[0].textContent !== STATUS_ENUM.BREAKING_POSE.string) {
                        timerDisplayUpdate();
                    }
                    startBreakingTimer();
                    break;
                case STATUS_ENUM.BREAKING_POSE.rawValue:
                    break;
                case STATUS_ENUM.LONGBREAKING.rawValue:
                    // 直前のステータスが一時停止中の場合
                    if (mutation.removedNodes[0].textContent !== STATUS_ENUM.LONGBREAKING_POSE.string) {
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

main();
updateActiveSourceDisplay();