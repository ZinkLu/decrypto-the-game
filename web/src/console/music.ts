import type { StationState } from './model';

export type MusicTrack = 'lobby' | 'game' | 'win' | 'loss';
export type MusicStatus = 'off' | 'paused' | 'loading' | 'playing' | 'ready' | 'error';
export type MusicPreferences = { enabled: boolean; volume: number };
type Gates = MusicPreferences & { powered: boolean; visible: boolean };
type Output = { context: AudioContext; destination: AudioNode };
type Voice = { id: MusicTrack; source: AudioBufferSourceNode; gain: GainNode; started: number; offset: number };
export const musicFiles: Record<MusicTrack, string> = {
    lobby: '/audio/music/lobby-v1.mp3', game: '/audio/music/game-v1.mp3',
    win: '/audio/music/win-v1.mp3', loss: '/audio/music/loss-v1.mp3',
};
const defaults: MusicPreferences = { enabled: true, volume: .6 };
const isLoop = (id: MusicTrack) => id === 'lobby' || id === 'game';
function hold(gain: AudioParam, now: number) {
    if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(now);
    else { const value = gain.value; gain.cancelScheduledValues(now); gain.setValueAtTime(value, now); }
}
const volume = (value: number) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : defaults.volume;
export function readMusicPreferences(): MusicPreferences {
    try {
        const saved = JSON.parse(localStorage.getItem('decrypto-music') || 'null');
        return { enabled: typeof saved?.enabled === 'boolean' ? saved.enabled : defaults.enabled,
            volume: typeof saved?.volume === 'number' ? volume(saved.volume) : defaults.volume };
    } catch { return { ...defaults }; }
}
export function saveMusicPreferences(value: MusicPreferences) {
    try { localStorage.setItem('decrypto-music', JSON.stringify(value)); } catch { /* Session choice still works. */ }
}
export function musicScene(state: StationState): 'lobby' | 'game' | null {
    if (state.phase === 'game_over') return null;
    return state.phase === 'home' || state.phase === 'room' ? 'lobby' : 'game';
}
export function musicEnding(previous: StationState, next: StationState): 'win' | 'loss' | undefined {
    const winner = next.gameOver?.winner;
    if (next.phase !== 'game_over' || previous.phase === 'game_over' ||
        !previous.connected || !next.connected || previous.recovering || next.recovering ||
        !next.roomCode || previous.roomCode !== next.roomCode || next.myRole === 'observer' ||
        (next.myTeam !== 'A' && next.myTeam !== 'B') || (winner !== 'A' && winner !== 'B')) return;
    return winner === next.myTeam ? 'win' : 'loss';
}
async function fetchMusic(id: MusicTrack, signal: AbortSignal) {
    const response = await fetch(musicFiles[id], { signal });
    if (!response.ok) throw new Error('Music unavailable');
    return response.arrayBuffer();
}

/** Music has an independent gate, with its own fades and playhead.
 * Only the current loop is retained in decoded memory. AudioBufferSource looping
 * uses the decoded gapless MP3 duration, not an ended-event/JS timer restart.
 */
export class ConsoleMusic {
    private gates: Gates = { ...defaults, powered: true, visible: true };
    private desired: MusicTrack | null = null;
    private epoch = 0;
    private pending?: AbortController;
    private refreshRequested = false;
    private disposed = false;
    private output?: Output;
    private bus?: GainNode;
    private duckGain?: GainNode;
    private active?: Voice;
    private voices = new Set<Voice>();
    private cached?: { id: MusicTrack; buffer: AudioBuffer };
    private position = 0;
    private endingDeadline = 0;
    private status: MusicStatus = 'off';

    constructor(private getOutput: () => Promise<Output | undefined>,
        private onStatus: (status: MusicStatus) => void = () => {},
        private load: (id: MusicTrack, signal: AbortSignal) => Promise<ArrayBuffer> = fetchMusic) {}

    private report(status: MusicStatus) {
        if (status !== this.status && !this.disposed) { this.status = status; this.onStatus(status); }
    }
    private get allowed() { return !this.disposed && this.gates.enabled && this.gates.powered && this.gates.visible; }
    private cancel() { this.epoch++; this.pending?.abort(); this.pending = undefined; this.refreshRequested = false; }
    configure(values: Partial<Gates>) {
        const wasAllowed = this.allowed;
        this.gates = { ...this.gates, ...values, volume: volume(values.volume ?? this.gates.volume) };
        if (this.bus && this.output) this.bus.gain.setTargetAtTime(this.gates.volume * 2, this.output.context.currentTime, .03);
        if (!this.allowed) {
            this.cancel();
            const fade = wasAllowed && this.gates.enabled && this.gates.visible && !this.gates.powered ? .65 : 0;
            this.pause(fade);
            this.report(this.gates.enabled ? 'paused' : 'off');
        } else if (!wasAllowed) void this.refresh();
    }
    /** Returns true when the musical ending replaces the normal result beep. */
    transition(previous: StationState, next: StationState, announce = true) {
        const ending = announce ? musicEnding(previous, next) : null;
        const replace = !!ending && this.allowed && this.gates.volume > 0 && this.output?.context.state === 'running';
        const desired = replace ? ending! : musicScene(next);
        // Repeated result snapshots must not cancel an ending already in progress.
        if (announce && next.phase === 'game_over' && previous.phase === 'game_over') return false;
        if (this.desired !== desired) {
            this.cancel();
            this.desired = desired;
            this.position = 0;
            this.endingDeadline = replace ? performance.now() + 2500 : 0;
            if (!desired || replace) this.stopAll(.65);
            if (!desired) this.report(this.allowed ? 'ready' : this.gates.enabled ? 'paused' : 'off');
            else void this.refresh();
        }
        return replace;
    }
    private disconnect(voice: Voice) {
        voice.source.onended = null;
        voice.source.disconnect(); voice.gain.disconnect();
        this.voices.delete(voice);
        if (this.active === voice) this.active = undefined;
    }
    private stop(voice: Voice, fade: number) {
        const now = this.output!.context.currentTime;
        if (fade) {
            hold(voice.gain.gain, now);
            voice.gain.gain.linearRampToValueAtTime(0, now + fade);
            voice.source.stop(now + fade);
        } else {
            try { voice.source.stop(); } catch { /* Already ended. */ }
            this.disconnect(voice);
        }
        if (this.active === voice) this.active = undefined;
    }
    private stopAll(fade: number) { for (const voice of this.voices) this.stop(voice, fade); }
    private pause(fade: number) {
        if (this.active && isLoop(this.active.id) && this.active.id === this.desired) {
            const voice = this.active;
            this.position = (voice.offset + Math.max(0, this.output!.context.currentTime - voice.started)) % voice.source.buffer!.duration;
        }
        // An ending interrupted by mute/hiding/power is consumed, never replayed.
        if (this.desired && !isLoop(this.desired)) this.desired = null;
        this.stopAll(fade);
        if (this.duckGain && this.output) {
            this.duckGain.gain.cancelScheduledValues(this.output.context.currentTime);
            this.duckGain.gain.setValueAtTime(1, this.output.context.currentTime);
        }
    }
    /** Called after an explicit user gesture unlocks the shared context. */
    async refresh() {
        const id = this.desired;
        if (!this.allowed || !id || this.active?.id === id) return;
        if (this.pending) { this.refreshRequested = true; return; }
        const epoch = this.epoch;
        const pending = this.pending = new AbortController();
        let starting: Voice | undefined;
        try {
            const output = await this.getOutput();
            if (!output || !this.allowed || epoch !== this.epoch) return;
            this.output = output;
            const { context, destination } = output;
            if (!this.bus) {
                this.bus = context.createGain(); this.duckGain = context.createGain();
                this.bus.connect(this.duckGain); this.duckGain.connect(destination);
                this.bus.gain.setValueAtTime(this.gates.volume * 2, context.currentTime);
            }
            this.report('loading');
            const buffer = this.cached?.id === id ? this.cached.buffer :
                await context.decodeAudioData(await this.load(id, pending.signal));
            if (!this.allowed || epoch !== this.epoch || context.state !== 'running') return;
            if (!isLoop(id) && performance.now() > this.endingDeadline) {
                this.desired = null; this.report('ready'); return;
            }
            this.cached = { id, buffer };
            const now = context.currentTime;
            const source = context.createBufferSource(), gain = context.createGain();
            const voice: Voice = { id, source, gain, started: now, offset: isLoop(id) ? this.position % buffer.duration : 0 };
            starting = voice;
            source.buffer = buffer;
            source.loop = isLoop(id); source.loopStart = 0; source.loopEnd = buffer.duration;
            source.connect(gain); gain.connect(this.bus);
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(1, now + (isLoop(id) ? .9 : .08));
            source.onended = () => {
                const current = this.active === voice;
                this.disconnect(voice);
                if (current && !isLoop(id)) { this.desired = null; this.report('ready'); }
            };
            source.start(now, voice.offset);
            this.stopAll(.9);
            this.voices.add(voice); this.active = voice;
            starting = undefined;
            this.report('playing');
        } catch {
            if (starting) { try { starting.source.stop(); } catch { /* Not started. */ } this.disconnect(starting); }
            if (epoch === this.epoch && this.allowed) { this.stopAll(.4); this.report('error'); }
        } finally {
            if (this.pending === pending) {
                this.pending = undefined;
                if (this.refreshRequested) { this.refreshRequested = false; void this.refresh(); }
            }
        }
    }
    /** Mechanical keys/knobs do not pump the soundtrack; only clear notifications duck it. */
    duck(cue: string) {
        if (!['transmit', 'receive', 'turn', 'success', 'error', 'crt-degauss'].includes(cue) ||
            !this.active || !isLoop(this.active.id) || !this.duckGain || !this.output) return;
        const now = this.output.context.currentTime, gain = this.duckGain.gain;
        hold(gain, now);
        gain.linearRampToValueAtTime(.35, now + .045);
        gain.setValueAtTime(.35, now + .5);
        gain.linearRampToValueAtTime(1, now + 1.15);
    }
    dispose() {
        this.disposed = true;
        this.cancel(); this.stopAll(0);
        this.bus?.disconnect(); this.duckGain?.disconnect(); this.cached = undefined;
    }
}
