import { MusicManager } from "./MusicManager.js";

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
let LOG_BREAKTIME_MINUTE = 15;

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
    MUSIC_MANAGER.play();
    MUSIC_MANAGER2.play();
    MUSIC_MANAGER3.stop();

}

// タイマーのスタート
function startBreakingTimer() {

    timer();
    intervalId = setInterval(timer, oneSecond);

    // 音楽スタート
    MUSIC_MANAGER.stop();
    MUSIC_MANAGER2.play();
    MUSIC_MANAGER3.play();

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
    MUSIC_MANAGER.stop();
    MUSIC_MANAGER2.stop();
    MUSIC_MANAGER3.stop();

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
    MUSIC_MANAGER.stop();
    MUSIC_MANAGER2.stop();
    MUSIC_MANAGER3.stop();
});

// ステータスの変更を監視
const observer = new MutationObserver((mutationsList) => {
    mutationsList.forEach((mutation) => {
        // textContentが変更されました
        if (mutation.type === 'childList') {
            // ここに変更時の処理を記述
            buttonDisplayUpdate();
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