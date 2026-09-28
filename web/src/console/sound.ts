import type { StationState } from './model';
import { soundBank } from './soundBank';
import type { CrtSoundEvent } from './crtSound';

export type ConsoleSound = keyof typeof soundBank;
export const consoleSounds = Object.keys(soundBank) as ConsoleSound[];
type Voice = { source: AudioBufferSourceNode; gain: GainNode; cue: ConsoleSound };
let downloadedBank: Promise<ArrayBuffer> | undefined;
function fetchBank() {
    // StrictMode and view remounts share one small, same-origin download.
    return downloadedBank ??= fetch('/audio/console-foley-v3.wav').then(response => {
        if (!response.ok) throw new Error('Sound bank unavailable');
        return response.arrayBuffer();
    }).catch(error => { downloadedBank = undefined; throw error; });
}

/** One shared context, with a separate gate for foley and speaker cues. */
export class ConsoleAudio {
    private enabled = true;
    private visible = true;
    private disposed = false;
    private generation = 0;
    private context?: AudioContext;
    private master?: GainNode;
    private effects?: GainNode;
    private resuming?: Promise<void>;
    private bytes?: Promise<ArrayBuffer>;
    private decoding?: Promise<AudioBuffer>;
    private buffer?: AudioBuffer;
    private voices = new Set<Voice>();
    private lastPlayed = new Map<ConsoleSound, number>();
    private variations = new Map<ConsoleSound, number>();
    private feedWanted = false;
    private feedStarting = false;
    private feed?: Voice;
    private crtGeneration = 0;
    private crtAudible = false;

    constructor(private createContext: () => AudioContext = () => new AudioContext({ latencyHint: 'interactive' }),
        private loadBytes: () => Promise<ArrayBuffer> = fetchBank) {}

    private getBytes() {
        return this.bytes ??= this.loadBytes().catch(error => { this.bytes = undefined; throw error; });
    }
    // Fetching does not create an AudioContext or unlock the speaker.
    prepare() { void this.getBytes().catch(() => {}); }

    setEnabled(on: boolean) {
        if (this.disposed || this.enabled === on) return;
        this.enabled = on;
        this.silence();
        this.updateGain();
    }
    setVisible(visible: boolean) {
        if (this.visible === visible) return;
        this.visible = visible;
        this.silence();
        this.updateGain();
    }
    private get allowed() { return this.enabled && this.visible && !this.disposed; }
    private updateGain() {
        if (this.master && this.context)
            this.master.gain.setValueAtTime(this.visible && !this.disposed ? .45 : 0, this.context.currentTime);
        if (this.effects && this.context)
            this.effects.gain.setValueAtTime(this.allowed ? 1 : 0, this.context.currentTime);
    }
    private disconnect(voice: Voice) {
        voice.source.onended = null;
        voice.source.disconnect(); voice.gain.disconnect();
        this.voices.delete(voice);
        if (this.feed === voice) this.feed = undefined;
    }
    silence() {
        this.generation++;
        this.crtGeneration++;
        this.crtAudible = false;
        this.feedWanted = false;
        for (const voice of this.voices) {
            try { voice.source.stop(); } catch { /* Already ended. */ }
            this.disconnect(voice);
        }
        this.lastPlayed.clear();
    }

    onUnlock?: () => void;
    onSound?: (cue: ConsoleSound) => void;

    /** Music bypasses the effects gate; only a user gesture can unlock the context. */
    async output(gesture = false) {
        if (!this.visible || this.disposed) return;
        if (!this.context) {
            if (!gesture) return;
            this.context = this.createContext();
            this.master = this.context.createGain();
            this.effects = this.context.createGain();
            this.updateGain();
            this.master.connect(this.context.destination);
            this.effects.connect(this.master);
        }
        const context = this.context;
        if (context.state !== 'running') {
            if (!gesture || context.state === 'closed') return;
            this.resuming ??= context.resume().finally(() => { this.resuming = undefined; });
            await this.resuming;
        }
        if (!this.visible || this.disposed || context.state !== 'running') return;
        if (gesture) this.onUnlock?.();
        return { context, destination: this.master! };
    }
    private async ready(gesture: boolean) {
        const output = await this.output(gesture);
        if (!output || !this.allowed) return;
        const { context } = output;
        if (!this.buffer) {
            this.decoding ??= this.getBytes().then(bytes => context.decodeAudioData(bytes.slice(0)))
                .finally(() => { this.decoding = undefined; });
            const buffer = await this.decoding;
            if (this.disposed) return;
            this.buffer = buffer;
        }
        return context;
    }
    /** A gesture may resume audio without adding a click to a continuous mechanism. */
    async unlock() { try { await this.output(true); } catch { /* Audio is optional. */ } }

    async play(cue: ConsoleSound, gesture = false) { await this.start(cue, gesture, false); }

    /** Reversing the supply cancels only the CRT, preserving the switch contact. */
    async crt(event: CrtSoundEvent) {
        if (event.type !== 'play') {
            this.crtGeneration++;
            this.crtAudible = event.type === 'begin' && this.allowed;
            for (const voice of this.voices) if (voice.cue.startsWith('crt-')) {
                const now = this.context!.currentTime;
                voice.gain.gain.cancelScheduledValues(now);
                voice.gain.gain.setTargetAtTime(0, now, .006);
                voice.source.stop(now + .03);
            }
            for (const cue of this.lastPlayed.keys()) if (cue.startsWith('crt-')) this.lastPlayed.delete(cue);
        } else if (this.crtAudible) {
            await this.start(event.cue, false, false, event.gain, this.crtGeneration);
        }
    }

    private async start(cue: ConsoleSound, gesture: boolean, loop: boolean, level = 1, crtGeneration?: number) {
        if (!this.allowed) return;
        const generation = this.generation, requestedAt = performance.now();
        let voice: Voice | undefined;
        try {
            const context = await this.ready(gesture);
            if (!context || !this.allowed || generation !== this.generation ||
                (crtGeneration !== undefined && crtGeneration !== this.crtGeneration) ||
                context.state !== 'running' || (loop && !this.feedWanted) ||
                performance.now() - requestedAt > (cue === 'test' ? 1500 : 300)) return;
            const spec = soundBank[cue], now = context.currentTime;
            if (!loop && now - (this.lastPlayed.get(cue) ?? -Infinity) < spec.cooldown) return;
            if (this.voices.size >= 12) return;
            const variant = this.variations.get(cue) ?? 0;
            const clip = spec.variants[variant % spec.variants.length];
            const source = context.createBufferSource(), gain = context.createGain();
            voice = { source, gain, cue };
            source.buffer = this.buffer!;
            source.connect(gain); gain.connect(this.effects!);
            gain.gain.setValueAtTime(loop ? 0 : spec.gain * Math.max(0, Math.min(1, level)), now);
            const playing = voice;
            source.onended = () => this.disconnect(playing);
            this.voices.add(voice);
            if (loop) {
                source.loop = true;
                source.loopStart = clip.offset;
                source.loopEnd = clip.offset + clip.duration;
                gain.gain.linearRampToValueAtTime(spec.gain, now + .025);
                source.start(now, clip.offset);
                this.feed = voice;
            } else source.start(now, clip.offset, clip.duration);
            this.onSound?.(cue);
            this.lastPlayed.set(cue, now);
            this.variations.set(cue, variant + 1);
        } catch {
            if (voice) this.disconnect(voice);
            // A missing/blocked sound never delays or cancels a game action.
        }
    }

    /** A single recorded motor follows actual roller motion, with soft edges. */
    async setPaperFeed(moving: boolean) {
        this.feedWanted = moving && this.allowed;
        if (!this.feedWanted) {
            if (this.feed && this.context) {
                const voice = this.feed, now = this.context.currentTime;
                this.feed = undefined;
                voice.gain.gain.cancelScheduledValues(now);
                voice.gain.gain.setTargetAtTime(0, now, .006);
                voice.source.stop(now + .03);
            }
            return;
        }
        if (this.feed || this.feedStarting) return;
        this.feedStarting = true;
        try { await this.start('paper-motor', false, true); }
        finally { this.feedStarting = false; }
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.silence();
        this.updateGain();
        this.master?.disconnect();
        this.effects?.disconnect();
        this.buffer = undefined;
        this.bytes = undefined;
        void this.context?.close().catch(() => {});
    }
}

/** Only fresh live transitions deserve a notification; snapshots stay quiet. */
export function gameSound(previous: StationState, next: StationState): ConsoleSound | undefined {
    if (!previous.connected || !next.connected || previous.recovering || next.recovering ||
        previous.roomCode !== next.roomCode || !next.roomCode ||
        (previous.phase === next.phase && previous.round === next.round)) return;
    if (next.phase === 'game_over') {
        if (previous.phase === 'game_over') return;
        if (!next.myTeam || next.myRole === 'observer' ||
            (next.gameOver?.winner !== 'A' && next.gameOver?.winner !== 'B')) return 'receive';
        return next.gameOver.winner === next.myTeam ? 'success' : 'error';
    }
    if (next.phase === 'round_result') return 'receive';
    if (!next.waiting && !next.submitted && (!next.deadline || next.deadline > Date.now()) &&
        ((next.phase === 'encrypting' && next.myRole === 'encryptor') ||
        (next.phase === 'intercept' && next.myRole === 'opponent') ||
        (next.phase === 'decrypt' && next.myRole === 'teammate'))) return 'turn';
}
