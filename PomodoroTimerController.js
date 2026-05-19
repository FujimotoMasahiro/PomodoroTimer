import { MusicManager, VoicyManager } from "./MusicManager.js";

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

// 音源設定 UI
const workSourceSelect = document.getElementById('work-source');
const breakSourceSelect = document.getElementById('break-source');
const voicyUrlInput = document.getElementById('voicy-url');

const DEFAULT_VOICY_URL = 'https://voicy.jp/embed/channel/941';

// 音源設定の localStorage 永続化
const AUDIO_SETTINGS_KEY = 'pomodoro_audio_source_settings';
const VALID_SOURCES = ['bgm', 'voicy', 'none'];

function loadAudioSourceSettings() {
    try {
        const raw = localStorage.getItem(AUDIO_SETTINGS_KEY);
        if (!raw) return;
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
    } catch (_) { /* localStorage 不可・JSON 不正は既定値で続行 */ }
}

function saveAudioSourceSettings() {
    try {
        const data = {
            workSource: workSourceSelect ? workSourceSelect.value : 'bgm',
            breakSource: breakSourceSelect ? breakSourceSelect.value : 'bgm',
            voicyUrl: voicyUrlInput ? voicyUrlInput.value : '',
        };
        localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(data));
    } catch (_) { /* localStorage 不可は無視 */ }
}

loadAudioSourceSettings();

// アクティブ音源カードの表示要素
const activeSourceLabel = document.getElementById('active-source-label');
const activePhaseBadge = document.getElementById('active-phase-badge');
const sourceWrappers = {
    bgmWork: document.getElementById('workBgmWrapper'),
    bgmBreak: document.getElementById('breakBgmWrapper'),
    voicy: document.getElementById('voicyWrapper'),
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
if (voicyUrlInput) voicyUrlInput.addEventListener('input', saveAudioSourceSettings);

function getVoicyUrl() {
    const v = (voicyUrlInput && voicyUrlInput.value || '').trim();
    return v || DEFAULT_VOICY_URL;
}

function playWorkSource() {
    const source = workSourceSelect ? workSourceSelect.value : 'bgm';
    if (source === 'voicy') {
        VOICY_MANAGER.play(getVoicyUrl());
    } else if (source === 'bgm') {
        MUSIC_MANAGER.play();
    }
    // 'none' は何もしない
}

function stopWorkSource() {
    VOICY_MANAGER.stop();
    MUSIC_MANAGER.stop();
}

function playBreakSource() {
    const source = breakSourceSelect ? breakSourceSelect.value : 'bgm';
    if (source === 'voicy') {
        VOICY_MANAGER.play(getVoicyUrl());
    } else if (source === 'bgm') {
        MUSIC_MANAGER3.play();
    }
    // 'none' は何もしない
}

function stopBreakSource() {
    VOICY_MANAGER.stop();
    MUSIC_MANAGER3.stop();
}


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

    // 音楽スタート
    stopBreakSource();
    playWorkSource();
    MUSIC_MANAGER2.play();

}

// タイマーのスタート
function startBreakingTimer() {

    timer();
    intervalId = setInterval(timer, oneSecond);

    // 音楽スタート
    stopWorkSource();
    playBreakSource();
    MUSIC_MANAGER2.play();

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

    // 音楽ストップ
    stopWorkSource();
    stopBreakSource();
    MUSIC_MANAGER2.stop();

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

    // 音楽ストップ
    stopWorkSource();
    stopBreakSource();
    MUSIC_MANAGER2.stop();
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