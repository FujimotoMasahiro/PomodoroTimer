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

        // 一部のブラウザ拡張 (再生速度コントローラ = Global Speed / Video Speed
        // Controller 等) は、ページ上の全メディア要素に同じ再生速度を一括適用する。
        // そのため作業中に YouTube の速度を変えると、休憩 BGM の <audio> まで
        // 同じ速度になってしまう。BGM は常に等速で流したいので、再生速度を 1.0 に
        // ロックし、外部から書き換えられても即座に 1.0 へ戻す。
        this._lockPlaybackRate();
    }

    // BGM の再生速度を常に等速 (1.0) に固定する。
    // preservesPitch も true にしておき、万一速度が変わってもピッチは保つ。
    _lockPlaybackRate() {
        const el = this.audioPlayer;
        if (!el) return;
        const enforce = () => {
            try {
                if ('preservesPitch' in el) el.preservesPitch = true;
                if (el.playbackRate !== 1) el.playbackRate = 1;
            } catch (_) { /* 未対応環境は無視 */ }
        };
        enforce();
        // 外部 (拡張機能等) が速度を書き換えると ratechange が飛ぶので、その場で戻す。
        // 自分で 1.0 に戻したときは playbackRate===1 なので再設定されず、無限ループしない。
        el.addEventListener('ratechange', enforce);
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
        // 拡張機能が付けた再生速度が残っていることがあるため、再生開始時に等速へ戻す。
        if (this.audioPlayer) {
            try {
                if ('preservesPitch' in this.audioPlayer) this.audioPlayer.preservesPitch = true;
                this.audioPlayer.playbackRate = 1;
            } catch (_) { /* 未対応環境は無視 */ }
        }
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
    constructor(containerElement, options = {}) {
        this.container = containerElement;
        this.player = null;
        this.currentVideoId = null;
        this._apiPromise = null;
        // 再生キュー: 動画 ID の配列。先頭から順に再生し、ENDED イベントで次へ進む。
        this.queue = [];
        this.currentIndex = -1;
        this._queueSignature = null;
        // 動画が最後まで再生されたときに呼ばれるコールバック。
        // 引数は再生終了した videoId。UI からの URL 行削除などに使う。
        this.onVideoEnded = typeof options.onVideoEnded === 'function' ? options.onVideoEnded : null;
        // 再生位置の永続化: videoId -> 再生秒数 のマップを localStorage に保存し、
        // リロード後に各動画を途中(保存位置)から再開できるようにする。
        this.progressKey = options.progressKey || 'pomodoro_youtube_progress';
        this._progressIntervalMs = 10000; // 10 秒ごとに現在位置を記録
        this._progressTimer = null;
        // ワイプ (Document Picture-in-Picture) 表示。
        // 再生 (音・キュー・一時停止) はあくまでメインのプレイヤーが担い、小窓は
        // 「表示だけ」。小窓側にはミュート・操作不可のプレイヤーを置き、メイン側の
        // 動画・再生位置・再生/一時停止に定期的に追従させる。
        this.pipPageUrl = options.pipPageUrl || 'pip.html';
        this.onPipChange = typeof options.onPipChange === 'function' ? options.onPipChange : null;
        this._pipWindow = null;
        this._pipPlayer = null;
        this._pipSyncTimer = null;
        this._pipSyncIntervalMs = 1000;
        this._pipMaxDriftSec = 1.5; // これ以上ずれたら小窓側を seek して合わせる
        this._pipOpening = false;
        this._pipAutoOpened = false;
    }

    // ---- ワイプ (Document Picture-in-Picture) ----------------------------------
    // YouTube の埋め込み iframe は親ページから標準の動画 PiP を使えないため、
    // Document PiP の小窓に同一オリジンの pip.html を読み込み、そこで同じ動画を
    // 続きから再生する。小窓を開けるのは Chrome / Edge / Brave 116 以降のみ。
    // また小窓を開くにはユーザー操作 (クリック等) が必要 (ブラウザの仕様)。

    static isPipSupported() {
        return typeof window !== 'undefined' && 'documentPictureInPicture' in window;
    }

    isPipOpen() {
        return !!this._pipWindow;
    }

    // 再生中 (または読み込み中) か。タブ切替時の自動ワイプ判定に使う。
    isPlaying() {
        try {
            const s = this.player && typeof this.player.getPlayerState === 'function'
                ? this.player.getPlayerState() : null;
            return s === 1 || s === 3; // PLAYING / BUFFERING
        } catch (_) { return false; }
    }

    async togglePip() {
        if (this.isPipOpen()) { this.closePip(); return false; }
        return this.openPip();
    }

    /**
     * ワイプを開く。成功したら true。
     * @param {object} opts { auto: タブ切替などで自動的に開いた場合 true (戻ったら自動で閉じる) }
     */
    async openPip(opts = {}) {
        if (this._pipWindow || this._pipOpening) return !!this._pipWindow;
        if (!YouTubeManager.isPipSupported()) return false;
        if (!this.player || !this.currentVideoId) return false;

        // requestWindow はユーザー操作の直後にしか成功しないので、await より前に呼ぶ。
        this._pipOpening = true;
        let pipWindow;
        try {
            pipWindow = await window.documentPictureInPicture.requestWindow({ width: 480, height: 270 });
        } catch (_) {
            this._pipOpening = false;
            return false;
        }
        this._pipWindow = pipWindow;
        this._pipAutoOpened = !!opts.auto;

        try {
            const doc = pipWindow.document;
            doc.title = 'YouTube ワイプ';
            const style = doc.createElement('style');
            // 小窓は表示専用。クリックで小窓側だけ止まる等のずれを防ぐため操作を受け付けない。
            style.textContent = 'html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{width:100%;height:100%;border:0;display:block;pointer-events:none}';
            doc.head.appendChild(style);
            const frame = doc.createElement('iframe');
            frame.allow = 'autoplay; encrypted-media';
            frame.src = new URL(this.pipPageUrl, document.baseURI).href;
            doc.body.appendChild(frame);
            pipWindow.addEventListener('pagehide', () => this._onPipClosed(pipWindow), { once: true });

            await new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
            if (this._pipWindow !== pipWindow) return false; // 読み込み中に閉じられた
            const fw = frame.contentWindow;
            const YTp = await fw.ytReady;
            if (this._pipWindow !== pipWindow) return false;

            const m = this._mainSnapshot();
            const target = fw.document.getElementById('pip-player');
            this._pipPlayer = new YTp.Player(target, {
                height: '100%',
                width: '100%',
                videoId: m.videoId,
                playerVars: {
                    rel: 0, modestbranding: 1, playsinline: 1, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3,
                    mute: 1, autoplay: m.playing ? 1 : 0, start: Math.floor(m.time),
                },
                events: {
                    onReady: (e) => {
                        const p = e && e.target;
                        if (!p) return;
                        try { if (p.mute) p.mute(); } catch (_) {}
                        this._syncPip();
                    },
                },
            });
            this._pipSyncTimer = setInterval(() => this._syncPip(), this._pipSyncIntervalMs);
        } catch (err) {
            console.warn('[YouTubeManager] ワイプの表示に失敗しました:', err);
            this.closePip();
            return false;
        } finally {
            this._pipOpening = false;
        }
        if (this.onPipChange) { try { this.onPipChange(true); } catch (_) {} }
        return true;
    }

    // メイン側プレイヤーの今の状態 (動画・位置・再生中か)。
    _mainSnapshot() {
        const snap = { videoId: this.currentVideoId, time: 0, playing: false };
        const p = this.player;
        if (!p) return snap;
        try {
            const t = p.getCurrentTime();
            if (Number.isFinite(t) && t > 0) snap.time = t;
            const st = p.getPlayerState();
            snap.playing = (st === 1 || st === 3);
        } catch (_) { /* API 未準備 */ }
        return snap;
    }

    // 小窓側をメイン側に合わせる: 動画の差し替え・再生/一時停止・位置ずれの補正。
    _syncPip() {
        const pip = this._pipPlayer;
        if (!pip || !this._pipWindow) return;
        const m = this._mainSnapshot();
        if (!m.videoId) return;
        try {
            if (typeof pip.getPlayerState !== 'function') return; // 小窓側の準備中
            let pipVideoId = null;
            try {
                const data = typeof pip.getVideoData === 'function' ? pip.getVideoData() : null;
                pipVideoId = (data && data.video_id) || null;
            } catch (_) {}
            if (pipVideoId && pipVideoId !== m.videoId) {
                // メイン側が次の動画へ進んだ
                if (m.playing) pip.loadVideoById({ videoId: m.videoId, startSeconds: m.time });
                else pip.cueVideoById({ videoId: m.videoId, startSeconds: m.time });
                return;
            }
            const st = pip.getPlayerState();
            const pipPlaying = (st === 1 || st === 3);
            if (m.playing && !pipPlaying) pip.playVideo();
            if (!m.playing && pipPlaying) pip.pauseVideo();
            const pt = pip.getCurrentTime();
            if (Number.isFinite(pt) && Math.abs(pt - m.time) > this._pipMaxDriftSec) {
                pip.seekTo(m.time, true);
            }
            if (typeof pip.isMuted === 'function' && !pip.isMuted()) pip.mute();
        } catch (_) { /* 小窓側 API 未準備などは次回に持ち越し */ }
    }

    closePip() {
        const w = this._pipWindow;
        if (!w) return;
        try { w.close(); } catch (_) {}
        // pagehide が来ない環境に備えて直接後始末する (二重実行は _onPipClosed 側で無視)
        this._onPipClosed(w);
    }

    // タブに戻ってきたとき、自動で開いたワイプだけを閉じる。
    closeAutoOpenedPip() {
        if (this._pipWindow && this._pipAutoOpened) this.closePip();
    }

    // 小窓が閉じられた (×ボタン・タブに戻るボタン・closePip) ときの後始末。
    // 再生はメイン側が続けているので、小窓側を片付けるだけ。
    _onPipClosed(pipWindow) {
        if (!pipWindow || this._pipWindow !== pipWindow) return;
        this._pipWindow = null;
        this._pipAutoOpened = false;
        if (this._pipSyncTimer) { clearInterval(this._pipSyncTimer); this._pipSyncTimer = null; }
        const pip = this._pipPlayer;
        this._pipPlayer = null;
        if (pip) { try { if (typeof pip.destroy === 'function') pip.destroy(); } catch (_) {} }
        if (this.onPipChange) { try { this.onPipChange(false); } catch (_) {} }
    }

    // ---- 再生位置の永続化 (localStorage) --------------------------------------
    _loadProgressMap() {
        try {
            const raw = localStorage.getItem(this.progressKey);
            const obj = raw ? JSON.parse(raw) : null;
            return (obj && typeof obj === 'object') ? obj : {};
        } catch (_) {
            return {};
        }
    }

    _writeProgressMap(map) {
        try { localStorage.setItem(this.progressKey, JSON.stringify(map)); } catch (_) { /* 保存不可は無視 */ }
    }

    // 指定動画の保存済み再生秒数を返す (未保存・不正値は 0)。
    getSavedSeconds(videoId) {
        if (!videoId) return 0;
        const v = this._loadProgressMap()[videoId];
        return (typeof v === 'number' && isFinite(v) && v > 0) ? Math.floor(v) : 0;
    }

    _saveSeconds(videoId, seconds) {
        if (!videoId) return;
        const map = this._loadProgressMap();
        if (typeof seconds === 'number' && isFinite(seconds) && seconds > 0) {
            map[videoId] = Math.floor(seconds);
        } else {
            delete map[videoId];
        }
        this._writeProgressMap(map);
    }

    _clearSaved(videoId) {
        if (!videoId) return;
        const map = this._loadProgressMap();
        if (videoId in map) {
            delete map[videoId];
            this._writeProgressMap(map);
        }
    }

    // 現在再生中の動画位置を 10 秒間隔で記録するインターバルを開始する。
    // player 生成後に一度だけ起動し、以後は常駐 (記録対象が無ければ no-op)。
    _startProgressTracking() {
        if (this._progressTimer) return;
        this._progressTimer = setInterval(() => this._recordProgress(), this._progressIntervalMs);
    }

    _recordProgress() {
        if (!this.player || !this.currentVideoId) return;
        try {
            if (typeof this.player.getCurrentTime !== 'function') return;
            const t = this.player.getCurrentTime();
            if (typeof t === 'number' && isFinite(t) && t > 0) {
                this._saveSeconds(this.currentVideoId, t);
            }
        } catch (_) { /* API 未準備等は無視 */ }
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

    async play(input) {
        if (!this.container) return;
        const newIds = (Array.isArray(input) ? input : [input])
            .map((u) => this.extractVideoId(u))
            .filter((id) => !!id);
        if (newIds.length === 0) {
            console.warn('[YouTubeManager] No valid videos in queue:', input);
            return;
        }
        const newSignature = newIds.join(',');

        // 再生中の動画 ID が新しいキューにも含まれているなら、その位置に
        // index を寄せて動画を継続再生する (キュー編集中に頭出しさせない)。
        // 含まれない (削除された / 未再生) なら新キューの先頭から開始。
        let targetIndex, targetVideoId;
        if (this.currentVideoId && newIds.includes(this.currentVideoId)) {
            targetIndex = newIds.indexOf(this.currentVideoId);
            targetVideoId = this.currentVideoId;
        } else {
            targetIndex = 0;
            targetVideoId = newIds[0];
        }

        this.queue = newIds;
        this._queueSignature = newSignature;
        this.currentIndex = targetIndex;

        await this.ensureApiLoaded();

        if (!this.player) {
            // 初回生成。保存済み再生位置があれば start で途中から開始する
            // (リロード後に続きから再生)。
            this.currentVideoId = targetVideoId;
            this.container.innerHTML = '<div id="youtube-iframe-target"></div>';
            const startSeconds = this.getSavedSeconds(targetVideoId);
            this.player = new YT.Player('youtube-iframe-target', {
                // 実寸はコンテナ (#youtubeContainer の 16:9) を CSS で埋める。
                // ここは 100% を渡してレスポンシブに最大化する。
                height: '100%',
                width: '100%',
                videoId: targetVideoId,
                playerVars: { rel: 0, modestbranding: 1, playsinline: 1, start: startSeconds },
                events: {
                    onReady: (e) => {
                        if (e && e.target && typeof e.target.playVideo === 'function') {
                            e.target.playVideo();
                        }
                    },
                    onStateChange: (e) => this._onStateChange(e),
                },
            });
            this._startProgressTracking();
            return;
        }

        if (this.currentVideoId === targetVideoId) {
            // 同じ動画を継続: playVideo() で再生開始/再開 (再生中なら no-op)
            if (typeof this.player.playVideo === 'function') this.player.playVideo();
        } else {
            // 別の動画へ切替: loadVideoById で iframe 再生成せず動画だけ差し替え。
            // 保存済み位置があれば startSeconds で途中から再開する。
            if (typeof this.player.loadVideoById === 'function') {
                this._loadVideoWithResume(targetVideoId);
            }
        }
    }

    // 保存済み再生位置を考慮して loadVideoById を呼ぶ。
    _loadVideoWithResume(videoId) {
        const startSeconds = this.getSavedSeconds(videoId);
        if (startSeconds > 0) {
            this.player.loadVideoById({ videoId, startSeconds });
        } else {
            this.player.loadVideoById(videoId);
        }
        this.currentVideoId = videoId;
    }

    _onStateChange(event) {
        // YT.PlayerState.ENDED === 0 (動画が最後まで再生されたとき)
        if (event && event.data === 0) {
            const endedId = this.currentVideoId;
            // 尺は _advance() で次の動画に差し替わる前に読んでおく
            // (視聴済みマークで「終端の何秒手前から再生するか」の算出に使う)。
            let endedDuration = null;
            try {
                if (this.player && typeof this.player.getDuration === 'function') {
                    const d = this.player.getDuration();
                    if (Number.isFinite(d) && d > 0) endedDuration = d;
                }
            } catch (_) { /* プレイヤー未準備時は null のまま */ }
            // 最後まで再生し切ったので保存位置は破棄 (次回は頭から再生)。
            this._clearSaved(endedId);
            this._advance();
            if (this.onVideoEnded && endedId) {
                try { this.onVideoEnded(endedId, endedDuration); } catch (_) { /* UI 側エラーは握りつぶす */ }
            }
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
        if (this.player && typeof this.player.loadVideoById === 'function') {
            this._loadVideoWithResume(videoId);
        } else {
            this.currentVideoId = videoId;
        }
    }

    pause() {
        if (this.player && typeof this.player.pauseVideo === 'function') {
            this.player.pauseVideo();
        }
    }

    /**
     * 次回 play() 呼び出し時に新キューの先頭から再生し直すよう、
     * 現在の再生位置情報をリセットする。並び替え時のトリガー用。
     */
    resetPosition() {
        this.currentVideoId = null;
        this.currentIndex = -1;
    }

    stop() {
        // Voicy と同じく iframe を破棄せず、pauseVideo() で一時停止のみ。
        // (再生位置を維持してフェーズ往復で同じ場所から再開できる)
        this.pause();
    }
}


/**
 * LocalMediaManager クラス
 *
 * ローカルの音源 / 動画ファイルを再生キューとして扱う。
 *
 * ブラウザは「パス文字列」からローカルファイルを読めないため、ファイルの実体は
 * 外部（コントローラ側）から resolveFile(id) で受け取る。ここではキューの位置管理と
 * <audio>/<video> の出し分け・再生だけを担う。
 *
 * 再生の進み方は「ロケットえんぴつ式」= 常にキューの先頭を再生し、1 本終わるたびに
 * その項目を末尾へ回す。実際の並び替えは onEnded を受けたコントローラが行い、
 * 新しい順序で play() を呼び直す。
 */
export class LocalMediaManager {
    /**
     * @param {object} els { audio: HTMLAudioElement, video: HTMLVideoElement, videoContainer: HTMLElement }
     * @param {object} options { resolveFile(id): Promise<File|null>, onEnded(id), onError(id, message) }
     */
    constructor(els = {}, options = {}) {
        this.audioEl = els.audio || null;
        this.videoEl = els.video || null;
        this.videoContainer = els.videoContainer || null;
        this.resolveFile = typeof options.resolveFile === 'function' ? options.resolveFile : null;
        this.onEnded = typeof options.onEnded === 'function' ? options.onEnded : null;
        this.onError = typeof options.onError === 'function' ? options.onError : null;

        // 現在再生中の項目 id と、そのために作った ObjectURL（解放用に持つ）
        this.currentId = null;
        this._objectUrl = null;
        // play() の多重実行で ObjectURL が入れ違いになるのを防ぐ世代番号
        this._loadSeq = 0;

        [this.audioEl, this.videoEl].forEach((el) => {
            if (!el) return;
            // BGM と同じく、再生速度を変える拡張機能に引きずられないよう等速へ固定する
            this._lockPlaybackRate(el);
            el.addEventListener('ended', () => this._handleEnded(el));
        });
    }

    _lockPlaybackRate(el) {
        const enforce = () => {
            try {
                if ('preservesPitch' in el) el.preservesPitch = true;
                if (el.playbackRate !== 1) el.playbackRate = 1;
            } catch (_) { /* 未対応環境は無視 */ }
        };
        enforce();
        el.addEventListener('ratechange', enforce);
    }

    _handleEnded(el) {
        // 表示していない方の要素の ended は無視する
        if (this._activeEl() !== el) return;
        const endedId = this.currentId;
        if (this.onEnded && endedId) {
            try { this.onEnded(endedId); } catch (_) { /* UI 側のエラーは握りつぶす */ }
        }
    }

    _activeEl() {
        if (!this.currentId) return null;
        return this._usingVideo ? this.videoEl : this.audioEl;
    }

    // ファイル名 / MIME から動画かどうかを判定する。
    // MIME が空のこともある（拡張子だけで判断せざるを得ない環境）ため両方見る。
    static isVideoFile(name, type) {
        if (typeof type === 'string' && type.startsWith('video/')) return true;
        if (typeof type === 'string' && type.startsWith('audio/')) return false;
        return /\.(mp4|m4v|mov|webm|ogv|mkv|avi)$/i.test(String(name || ''));
    }

    _revokeUrl() {
        if (this._objectUrl) {
            try { URL.revokeObjectURL(this._objectUrl); } catch (_) { /* 無視 */ }
            this._objectUrl = null;
        }
    }

    _showElement(useVideo) {
        this._usingVideo = useVideo;
        if (this.audioEl) this.audioEl.style.display = useVideo ? 'none' : '';
        if (this.videoContainer) this.videoContainer.style.display = useVideo ? '' : 'none';
        else if (this.videoEl) this.videoEl.style.display = useVideo ? '' : 'none';
    }

    /**
     * キューの先頭を再生する。
     * @param {Array<{id:string,name:string}>} items 再生キュー（先頭が再生対象）
     */
    async play(items) {
        const queue = Array.isArray(items) ? items.filter((it) => it && it.id) : [];
        if (queue.length === 0) { this.stop(); return; }

        const head = queue[0];
        // 同じファイルを再生中なら、頭出しせずそのまま続ける（キュー編集中の音飛び防止）
        if (this.currentId === head.id) {
            const el = this._activeEl();
            if (el && el.paused) { try { await el.play(); } catch (_) { /* 自動再生拒否は無視 */ } }
            return;
        }
        if (!this.resolveFile) return;

        const seq = ++this._loadSeq;
        let file = null;
        try {
            file = await this.resolveFile(head.id);
        } catch (_) {
            file = null;
        }
        // 待っている間に別の play() が走っていたら、この結果は捨てる
        if (seq !== this._loadSeq) return;
        if (!file) {
            if (this.onError) {
                try { this.onError(head.id, 'ファイルを読み込めませんでした'); } catch (_) { /* 無視 */ }
            }
            return;
        }

        const useVideo = LocalMediaManager.isVideoFile(file.name || head.name, file.type);
        const el = useVideo ? this.videoEl : this.audioEl;
        if (!el) return;

        // 直前のファイルを止めてから差し替える
        const prev = this._activeEl();
        if (prev && prev !== el) { try { prev.pause(); } catch (_) { /* 無視 */ } }

        this._revokeUrl();
        this._objectUrl = URL.createObjectURL(file);
        this.currentId = head.id;
        this._showElement(useVideo);
        el.src = this._objectUrl;
        try { el.load(); } catch (_) { /* 無視 */ }
        try { await el.play(); } catch (_) { /* 自動再生拒否は無視（ユーザー操作後に再開） */ }
    }

    pause() {
        const el = this._activeEl();
        if (el) { try { el.pause(); } catch (_) { /* 無視 */ } }
    }

    /** 次の play() で先頭から読み直すよう、現在の再生対象を忘れる */
    resetPosition() {
        this.currentId = null;
    }

    /** 再生を止めて要素と ObjectURL を解放する */
    stop() {
        [this.audioEl, this.videoEl].forEach((el) => {
            if (!el) return;
            try { el.pause(); el.removeAttribute('src'); el.load(); } catch (_) { /* 無視 */ }
        });
        this._revokeUrl();
        this.currentId = null;
        this._showElement(false);
        if (this.audioEl) this.audioEl.style.display = 'none';
    }
}
