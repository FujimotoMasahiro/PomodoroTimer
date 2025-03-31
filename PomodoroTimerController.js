import { MusicManager } from "./MusicManager.js";

// 定義 なので、constを用いる
const STATUS_ENUM = {
    INITIAL: {
        rawValue: 1,
        string: "初期",
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

// ボタンのnode取得
const startButton = document.getElementById('start-btn'); // スタートボタン
const pauseButton = document.getElementById('pause-btn'); // 一時停止ボタン
const restartButton = document.getElementById('restart-btn'); // 再開ボタン
const resetButton = document.getElementById('reset-btn'); // リセットボタン

// セッティングフォーム
const settingsForm = document.getElementById('settings-form');

const SECOND = 60;
let WORKTIME_MINUTE = 25
let BREAKTIME_MINUTE = 5
let LOG_BREAKTIME_MINUTE = 15

let workDuration = WORKTIME_MINUTE * SECOND; // 初期値（秒）
let breakDuration = BREAKTIME_MINUTE * SECOND; // 初期値（秒）
let longBreakDuration = LOG_BREAKTIME_MINUTE * SECOND; // 初期値（秒）
let longBreakFrequency = 4; // 初期値

let isWorkSession = true;
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
    const minutes = String(Math.floor(time / SECOND)).padStart(2, '0');
    const seconds = String(time % SECOND).padStart(2, '0');
    timerElement.textContent = `${minutes}:${seconds}`;
}

// タイマーのスタート
function startTimer() {

    intervalId = setInterval(timer, 1000);

    // 音楽スタート
    MUSIC_MANAGER.play();
    MUSIC_MANAGER2.play();
    MUSIC_MANAGER3.stop();

    status = STATUS_ENUM.WORKING.rawValue;
    statusElement.textContent = STATUS_ENUM.WORKING.string;
}

// 一時停止
function pauseTimer() {
    clearInterval(intervalId);
    MUSIC_MANAGER.stop();
    MUSIC_MANAGER2.stop();
    MUSIC_MANAGER3.stop();

    // ステータスを一時停止に変更
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
}

// 再開
function restartTimer() {
    MUSIC_MANAGER.play();
    intervalId = setInterval(timer, 1000);

    // 再開する
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
}

// リセット
function resetTimer() {
    clearInterval(intervalId);
    updateTimerDisplay(workDuration);

    status = STATUS_ENUM.INITIAL.rawValue;
    statusElement.textContent = STATUS_ENUM.INITIAL.string;
}

function timer() {
    if (time <= 0) {
        clearInterval(intervalId);
        cycles++;

        // 長時間休憩のチェック
        if (cycles % longBreakFrequency === 0) {
            time = longBreakDuration;
            status = STATUS_ENUM.LONGBREAKING.rawValue;
            statusElement.textContent = STATUS_ENUM.LONGBREAKING.string;;
        } else {
            // スイッチ文
            switch (status) {
                case STATUS_ENUM.WORKING.rawValue:
                    status = isWorkSession ? STATUS_ENUM.WORKING.rawValue : STATUS_ENUM.BREAKING.rawValue;
                    statusElement.textContent = isWorkSession ? STATUS_ENUM.WORKING.string : STATUS_ENUM.BREAKING.string;
                    break;
                case STATUS_ENUM.BREAKING.rawValue:
                    status = STATUS_ENUM.WORKING.rawValue;
                    statusElement.textContent = STATUS_ENUM.WORKING.string;
                    break;
                case STATUS_ENUM.LONGBREAKING.rawValue:
                    status = STATUS_ENUM.WORKING.rawValue;
                    statusElement.textContent = STATUS_ENUM.WORKING.string;
                    break;
                default:
                    break;
            }
            time = isWorkSession ? workDuration : breakDuration;
            status = isWorkSession ? STATUS_ENUM.WORKING.rawValue : STATUS_ENUM.BREAKING.rawValue;
            statusElement.textContent = isWorkSession ? STATUS_ENUM.WORKING.string : STATUS_ENUM.BREAKING.string;

        }

        if (document.getElementById('auto-start-work').checked) {
            startTimer();
        } else if (document.getElementById('auto-start-break').checked) {
            startTimer();
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
            resetButton.style.display = 'none';
            break;
        case STATUS_ENUM.WORKING.rawValue:
            startButton.style.display = 'none';
            pauseButton.style.display = 'inline-block';
            restartButton.style.display = 'none';
            resetButton.style.display = 'inline-block';
            break;
        case STATUS_ENUM.WORKING_POSE.rawValue:
            startButton.style.display = 'none';
            pauseButton.style.display = 'none';
            restartButton.style.display = 'inline-block';
            resetButton.style.display = 'inline-block';
            break;
        case STATUS_ENUM.BREAKING.rawValue:
            startButton.style.display = 'none';
            pauseButton.style.display = 'inline-block';
            restartButton.style.display = 'none';
            resetButton.style.display = 'inline-block';
            break;
        case STATUS_ENUM.BREAKING_POSE.rawValue:
            startButton.style.display = 'none';
            pauseButton.style.display = 'none';
            restartButton.style.display = 'inline-block';
            resetButton.style.display = 'inline-block';
            break;
        case STATUS_ENUM.LONGBREAKING.rawValue:
            startButton.style.display = 'none';
            pauseButton.style.display = 'inline-block';
            restartButton.style.display = 'none';
            resetButton.style.display = 'inline-block';
            break;
        case STATUS_ENUM.LONGBREAKING_POSE.rawValue:
            startButton.style.display = 'none';
            pauseButton.style.display = 'none';
            restartButton.style.display = 'inline-block';
            resetButton.style.display = 'inline-block';
            break;
        default:
            break;
    }
}

// 設定の保存
settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    workDuration = document.getElementById('work-duration').value * SECOND;
    breakDuration = document.getElementById('break-duration').value * SECOND;
    longBreakDuration = document.getElementById('long-break-duration').value * SECOND;
    longBreakFrequency = document.getElementById('long-break-frequency').value;
    resetTimer();
});

// イベントリスナー
startButton.addEventListener('click', startTimer);
pauseButton.addEventListener('click', pauseTimer);
restartButton.addEventListener('click', restartTimer);
resetButton.addEventListener('click', resetTimer);

// ステータスの変更を監視
const observer = new MutationObserver((mutationsList) => {
    mutationsList.forEach((mutation) => {
        // textContentが変更されました
        if (mutation.type === 'childList') {
            // ここに変更時の処理を記述
            buttonDisplayUpdate();
        }
    });
});

// 監視を開始（子ノードの変更を監視）
observer.observe(statusElement, { childList: true });

main();