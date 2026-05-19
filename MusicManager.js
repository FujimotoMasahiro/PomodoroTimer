// MusicManager.js

/**
 * MusicManagerクラス
 * 
 * このクラスは、ポモドーロタイマーにおける音楽の再生機能を管理します。
 * 作業中、休憩中、長時間休憩中の各状態に対して異なる音楽を設定し、
 * 状態が切り替わるたびに自動的に音楽を再生する仕組みを提供します。
 * 
 * 主な機能:
 * - 各状態ごとに異なる音楽を設定可能。
 * - 音楽の音量を個別に調整可能。
 * - 設定をlocalStorageに保存し、次回ロード時に復元。
 * - 状態の切り替えに応じた自動再生と停止。
 */
export class MusicManager {
    constructor(audioPlayerElement) {
        this.state = {
            work: { audio: null, volume: 1.0 },
            shortBreak: { audio: null, volume: 1.0 },
            longBreak: { audio: null, volume: 1.0 },
        };
        this.currentState = null;
        this.localStorageKey = "pomodoro_music_settings";
        this.loadSettings();

        // <audio>要素を取得
        this.audioPlayer = audioPlayerElement;

    }

    /**
     * localStorageから設定を読み込むメソッド。
     * 
     * 目的:
     * 保存された音楽設定（音量や音楽ソース）をlocalStorageから取得し、
     * 現在の状態に反映させます。
     * 
     * 引数:
     * なし。
     * 
     * 戻り値:
     * なし。
     */
    loadSettings() {
        const savedSettings = localStorage.getItem(this.localStorageKey);
        if (savedSettings) {
            const parsedSettings = JSON.parse(savedSettings);
            for (const state in this.state) {
                if (parsedSettings[state]) {
                    this.state[state] = {
                        audio: this.createAudio(parsedSettings[state].audioSrc),
                        volume: parsedSettings[state].volume
                    };
                    if (this.state[state].audio) {
                        this.state[state].audio.volume = this.state[state].volume;
                    }
                }
            }
        }
    }

    /**
     * 設定をlocalStorageに保存するメソッド。
     * 
     * 目的:
     * 現在の音楽設定（音楽のソースと音量）をlocalStorageに保存します。
     * この保存により、次回アプリケーションを起動した際に、
     * ユーザーが設定した状態を復元することが可能です。
     * 
     * 引数:
     * なし。
     * 
     * 戻り値:
     * なし。
     */
    saveSettings() {
        const settingsToSave = {};
        for (const state in this.state) {
            settingsToSave[state] = {
                audioSrc: this.state[state].audio ? this.state[state].audio.src : null,
                volume: this.state[state].volume
            };
        }
        localStorage.setItem(this.localStorageKey, JSON.stringify(settingsToSave));
    }

    // Create audio object
    createAudio(src) {
        if (!src) return null;
        const audio = new Audio(src);
        audio.loop = true;
        return audio;
    }

    // Set music for a specific state
    setMusic(state, src) {
        if (!this.state[state]) return;
        if (this.state[state].audio) {
            this.state[state].audio.pause();
        }
        this.state[state].audio = this.createAudio(src);
        this.saveSettings();
    }

    // Set volume for a specific state
    setVolume(state, volume) {
        if (!this.state[state]) return;
        this.state[state].volume = volume;
        if (this.state[state].audio) {
            this.state[state].audio.volume = volume;
        }
        this.saveSettings();
    }

    /**
     * 現在の状態に基づいて音楽を再生するメソッド。
     * 
     * 目的:
     * 指定された状態に対応する音楽を再生します。他の状態で音楽が再生中の場合、
     * それを停止し、新しい状態の音楽を再生します。
     * 
     * 引数:
     * @param {string} state - 再生する音楽の状態名（例: "work", "shortBreak", "longBreak"）。
     * 
     * 動作フロー:
     * 1. 指定された状態に対応するaudioオブジェクトを確認。
     * 2. 現在の状態で音楽が再生中であれば停止。
     * 3. 指定された状態の音楽を再生し、currentStateを更新。
     * 
     * 戻り値:
     * なし。
     */
    play(state) {
        // if (!this.state[state] || !this.state[state].audio) return;
        // if (this.currentState && this.state[this.currentState].audio) {
        //     this.state[this.currentState].audio.pause();
        // }
        // this.currentState = state;
        // this.state[state].audio.play();
        this.audioPlayer.play(); // 再生
    }

    // Stop current music
    stop() {
        // if (this.currentState && this.state[this.currentState].audio) {
        //     this.state[this.currentState].audio.pause();
        //     this.currentState = null;
        // }
        this.audioPlayer.pause(); // 一時停止
        this.audioPlayer.currentTime = 0; // 再生位置をリセット
    }
}

// Example Usage:
// const musicManager = new MusicManager();
// musicManager.setMusic("work", "work-music.mp3");
// musicManager.setVolume("work", 0.8);
// musicManager.play("work");

/**
 * VoicyManagerクラス
 *
 * Voicy の埋め込み iframe を動的に挿入/削除して再生・停止を制御する。
 * Voicy はクロスオリジン埋め込みで postMessage API を公開していないため、
 * 「停止」は iframe を DOM から外すことで実現する (audio が要素ごと破棄される)。
 *
 * Voicy プレイヤーの内部コンテンツは固定幅 (デスクトップレイアウト) で、
 * iframe を width=100% にしても中身が横スクロールしてしまう。
 * そこで iframe に「自然幅」を物理的に与え、CSS transform: scale() でコンテナ幅に縮小表示する。
 */
export class VoicyManager {
    constructor(containerElement) {
        this.container = containerElement;
        this.currentUrl = null;
        // iframe は Voicy デスクトップレイアウトが余裕で収まる物理幅を与え、
        // CSS zoom でコンテナ幅に合わせて縮小表示する。
        this.naturalWidth = 1200;
        this.naturalHeight = 400;
        this._resizeHandler = () => this.rescale();
        if (typeof window !== 'undefined') {
            window.addEventListener('resize', this._resizeHandler);
        }
    }

    play(url) {
        if (!this.container || !url) return;
        if (this.currentUrl === url && this.container.querySelector('iframe')) return;
        this.container.style.overflow = 'hidden';
        this.container.innerHTML = `<iframe src="${url}" allow="autoplay; encrypted-media" frameborder="0" title="Voicy Player" style="border:0; display:block;"></iframe>`;
        this.currentUrl = url;
        this.rescale();
    }

    rescale() {
        if (!this.container) return;
        const iframe = this.container.querySelector('iframe');
        if (!iframe) return;
        const containerWidth = this.container.clientWidth || this.naturalWidth;
        const zoomLevel = containerWidth / this.naturalWidth;
        iframe.style.width = this.naturalWidth + 'px';
        iframe.style.height = this.naturalHeight + 'px';
        iframe.style.zoom = zoomLevel;
    }

    stop() {
        if (!this.container) return;
        this.container.innerHTML = '';
        this.container.style.overflow = '';
        this.currentUrl = null;
    }
}
