import { MusicManager } from "./MusicManager.js";

const MUSIC_MANAGER = new MusicManager(document.getElementById('audioPlayer'));
const MUSIC_MANAGER2 = new MusicManager(document.getElementById('audioPlayer2'));
const MUSIC_MANAGER3 = new MusicManager(document.getElementById('audioPlayer3'));


// タイマー設定
const timerElement = document.getElementById('timer');
const statusElement = document.getElementById('status');
const startButton = document.getElementById('start-btn');
const pauseButton = document.getElementById('pause-btn');
const restartButton = document.getElementById('restart-btn');
const resetButton = document.getElementById('reset-btn');
const settingsForm = document.getElementById('settings-form');

let workDuration = 25 * 60; // 初期値（秒）
let breakDuration = 5 * 60; // 初期値（秒）
let longBreakDuration = 15 * 60; // 初期値（秒）
let longBreakFrequency = 4; // 初期値

let isRunning = false;
let isWorkSession = true;
let intervalId;
let cycles = 0;
let time = 0;

// タイマーの更新
function updateTimerDisplay(time) {
    const minutes = String(Math.floor(time / 60)).padStart(2, '0');
    const seconds = String(time % 60).padStart(2, '0');
    timerElement.textContent = `${minutes}:${seconds}`;
}

// タイマーのスタート
function startTimer() {
    if (isRunning) return;
    isRunning = true;
    time = isWorkSession ? workDuration : breakDuration;

    intervalId = setInterval(timer, 1000);

    // 音楽スタート
    if (isWorkSession) {
        MUSIC_MANAGER.play();
        MUSIC_MANAGER2.play();
        MUSIC_MANAGER3.stop();
    } else {
        MUSIC_MANAGER.stop();
        MUSIC_MANAGER2.play();
        MUSIC_MANAGER3.play();
    }
}

// 一時停止
function pauseTimer() {
    clearInterval(intervalId);
    isRunning = false;
    MUSIC_MANAGER.stop();
    MUSIC_MANAGER2.stop();
    MUSIC_MANAGER3.stop();
}

// 再開
function restartTimer() {
    isRunning = true;
    if (isWorkSession) {
        MUSIC_MANAGER.play();
    } else {
        MUSIC_MANAGER3.play();
    }
    intervalId = setInterval(timer, 1000);
}

// リセット
function resetTimer() {
    clearInterval(intervalId);
    isRunning = false;
    isWorkSession = true;
    updateTimerDisplay(workDuration);
    statusElement.textContent = '作業中';
}

function timer() {
    if (time <= 0) {
        clearInterval(intervalId);
        isRunning = false;
        cycles++;

        // 長時間休憩のチェック
        if (cycles % longBreakFrequency === 0 && !isWorkSession) {
            time = longBreakDuration;
            statusElement.textContent = '長時間休憩中';
        } else {
            isWorkSession = !isWorkSession;
            time = isWorkSession ? workDuration : breakDuration;
            statusElement.textContent = isWorkSession ? '作業中' : '休憩中';
            // isWorkSession ? MUSIC_MANAGER.play() : MUSIC_MANAGER.stop()
        }

        if (document.getElementById('auto-start-work').checked && isWorkSession) {
            startTimer();
        } else if (document.getElementById('auto-start-break').checked && !isWorkSession) {
            startTimer();
        }
    } else {
        updateTimerDisplay(time);
        time--;
    }
}

// 設定の保存
settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    workDuration = document.getElementById('work-duration').value * 60;
    breakDuration = document.getElementById('break-duration').value * 60;
    longBreakDuration = document.getElementById('long-break-duration').value * 60;
    longBreakFrequency = document.getElementById('long-break-frequency').value;
    resetTimer();
});

// イベントリスナー
startButton.addEventListener('click', startTimer);
pauseButton.addEventListener('click', pauseTimer);
restartButton.addEventListener('click', restartTimer);
resetButton.addEventListener('click', resetTimer);

// 初期化
updateTimerDisplay(workDuration);
