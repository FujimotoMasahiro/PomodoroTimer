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
 * Voicy の埋め込み iframe を動的に挿入し、再生位置を保ったまま表示制御する。
 * Voicy はクロスオリジン埋め込みで postMessage API を公開していないため、
 * 再生位置をブラウザ側から操作できない。
 * フェーズ切替 (作業中⇔休憩中) のたびに iframe を破棄すると、その都度先頭から
 * 読み込み直しになって途中から聴けなくなるため、stop() では iframe を DOM に残し、
 * 表示側 (wrapper) の display:none で視覚的にのみ隠す方針とする。
 * URL が切り替わった場合だけ play() 内で iframe を差し替える。
 *
 * Voicy プレイヤーの内部コンテンツは固定幅 (デスクトップレイアウト) で、
 * iframe を width=100% にしても中身が横スクロールしてしまう。
 * そこで iframe に「自然幅」を物理的に与え、CSS zoom でコンテナ幅にフィットさせる。
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
        // iframe を DOM から取り除くとフェーズ切替時に毎回読み込み直され、
        // 途中から再生できなくなる。そのため stop() では iframe を保持し、
        // 表示/非表示は呼び出し側 (wrapper の display:none) に任せる。
        // URL が変わった場合は play() 側で iframe が差し替えられる。
        // 別音源へ切替えるなど物理的に止めたい場合は destroy() を使う。
    }

    destroy() {
        if (!this.container) return;
        this.container.innerHTML = '';
        this.container.style.overflow = '';
        this.currentUrl = null;
    }
}

/**
 * YouTubeManagerクラス
 *
 * YouTube IFrame Player API を用いて作業 BGM などとして YouTube 動画を埋め込み、
 * フェーズ切替に応じて再生/一時停止を JS から制御する。
 *
 * Voicy と異なり postMessage API (= 公式の Player API) が利用できるため、
 * iframe を破棄せずに playVideo() / pauseVideo() / loadVideoById() で制御し、
 * 再生位置を保ったまま作業中 ⇔ 休憩中 を行き来できる。
 *
 * - API スクリプトは最初の play() 呼び出し時に遅延ロードする。
 * - 同一 videoId のときは playVideo() のみで再開し、URL が変わったら
 *   loadVideoById() で動画を差し替える (iframe 自体は再生成しない)。
 * - ループは指定しない (ユーザー指定: loop=OFF)。
 */
export class YouTubeManager {
    constructor(containerElement) {
        this.container = containerElement;
        this.player = null;
        this.currentVideoId = null;
        this._apiPromise = null;
        // 再生キュー: 動画 ID の配列。先頭から順に再生し、ENDED イベントで次へ進む。
        this.queue = [];
        this.currentIndex = -1;
        this._queueSignature = null;
    }

    extractVideoId(url) {
        if (!url) return null;
        const raw = String(url).trim();
        if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
        try {
            const u = new URL(raw);
            if (u.hostname === 'youtu.be' || u.hostname.endsWith('.youtu.be')) {
                return (u.pathname.slice(1).split('/')[0]) || null;
            }
            if (u.hostname.includes('youtube.com')) {
                if (u.pathname === '/watch' && u.searchParams.has('v')) {
                    return u.searchParams.get('v');
                }
                const m = u.pathname.match(/^\/(?:embed|shorts|v)\/([^/?]+)/);
                if (m) return m[1];
            }
        } catch (_) { /* invalid URL */ }
        return null;
    }

    ensureApiLoaded() {
        if (window.YT && window.YT.Player) return Promise.resolve();
        if (this._apiPromise) return this._apiPromise;
        this._apiPromise = new Promise((resolve) => {
            const prev = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
                if (typeof prev === 'function') {
                    try { prev(); } catch (_) {}
                }
                resolve();
            };
            if (!document.querySelector('script[data-yt-iframe-api]')) {
                const tag = document.createElement('script');
                tag.src = 'https://www.youtube.com/iframe_api';
                tag.setAttribute('data-yt-iframe-api', '1');
                document.head.appendChild(tag);
            }
        });
        return this._apiPromise;
    }

    /**
     * 入力された URL 配列 (もしくは単一 URL) からキューを更新する。
     * 内容が変わった場合のみ true を返し、currentIndex を 0 に戻す。
     */
    _updateQueue(input) {
        const list = Array.isArray(input) ? input : [input];
        const ids = list
            .map((u) => this.extractVideoId(u))
            .filter((id) => !!id);
        const signature = ids.join(',');
        if (signature === this._queueSignature) return false;
        this.queue = ids;
        this._queueSignature = signature;
        this.currentIndex = ids.length > 0 ? 0 : -1;
        return true;
    }

    async play(input) {
        if (!this.container) return;
        const queueChanged = this._updateQueue(input);
        if (this.queue.length === 0) {
            console.warn('[YouTubeManager] No valid videos in queue:', input);
            return;
        }
        if (this.currentIndex < 0) this.currentIndex = 0;
        const videoId = this.queue[this.currentIndex];

        await this.ensureApiLoaded();

        // キュー未変更かつ player が同じ動画を保持: 一時停止からの再開
        if (this.player && !queueChanged && this.currentVideoId === videoId) {
            if (typeof this.player.playVideo === 'function') this.player.playVideo();
            return;
        }
        // キューが変わった or 動画 ID がずれた: loadVideoById で差し替え
        if (this.player) {
            if (typeof this.player.loadVideoById === 'function') {
                this.player.loadVideoById(videoId);
                this.currentVideoId = videoId;
            }
            return;
        }
        // 初回生成
        this.container.innerHTML = '<div id="youtube-iframe-target"></div>';
        this.player = new YT.Player('youtube-iframe-target', {
            height: '400',
            width: '100%',
            videoId,
            playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
            events: {
                onReady: (e) => {
                    if (e && e.target && typeof e.target.playVideo === 'function') {
                        e.target.playVideo();
                    }
                },
                onStateChange: (e) => this._onStateChange(e),
            },
        });
        this.currentVideoId = videoId;
    }

    _onStateChange(event) {
        // YT.PlayerState.ENDED === 0 (動画が最後まで再生されたとき)
        if (event && event.data === 0) {
            this._advance();
        }
    }

    _advance() {
        const next = this.currentIndex + 1;
        if (next >= this.queue.length) {
            // キュー末尾: 何もせず ENDED 状態で停止
            return;
        }
        this.currentIndex = next;
        const videoId = this.queue[next];
        this.currentVideoId = videoId;
        if (this.player && typeof this.player.loadVideoById === 'function') {
            this.player.loadVideoById(videoId);
        }
    }

    pause() {
        if (this.player && typeof this.player.pauseVideo === 'function') {
            this.player.pauseVideo();
        }
    }

    stop() {
        // Voicy と同じく iframe を破棄せず、pauseVideo() で一時停止のみ。
        // (再生位置を維持してフェーズ往復で同じ場所から再開できる)
        this.pause();
    }
}
