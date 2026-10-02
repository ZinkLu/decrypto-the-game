import type { ScoreChange } from '../store/gameStore';

export type ScoreTone = 'good' | 'bad' | 'neutral';
export const scoreColors = { good: '#8bc995', bad: '#ed9781', neutral: '#b9c5c7' };
export interface ScoreSignal {
    event: ScoreChange | null;
    room: string;
    team: string;
    online: boolean;
}

/** A failure belongs to its team; the benefit belongs to the other side. */
export function scoreTone(event: ScoreChange, team: string): ScoreTone {
    if (team !== 'A' && team !== 'B') return 'neutral';
    const balance = event.changes.reduce((sum, change) =>
        sum + (change.team === team ? 1 : -1) * (change.kind === 'intercept' ? 1 : -1), 0);
    return balance > 0 ? 'good' : balance < 0 ? 'bad' : 'neutral';
}

/** Three charging stages followed by discharge: one pulse, peaking at the flag's first impact. */
export class ScorePulse {
    level = 0;
    sweep = 0;
    tone: ScoreTone = 'neutral';
    private elapsed = Infinity;
    private previous?: ScoreSignal;
    private startedAt = 0;

    observe(signal: ScoreSignal, now: number, allowed: boolean) {
        const previous = this.previous;
        this.previous = signal;
        if (!allowed || !signal.online || !signal.room || !signal.event) { this.clear(); return; }
        if (!previous || !previous.online || previous.room !== signal.room || previous.team !== signal.team) {
            this.clear(); return;
        }
        if (signal.event.id === previous.event?.id) return;
        // A model that loaded late or a suspended tab must not celebrate old results.
        if (now - signal.event.at > 1500 || now < signal.event.at) return;
        this.tone = scoreTone(signal.event, signal.team);
        this.elapsed = 0;
        this.startedAt = now;
    }

    clear() { this.elapsed = Infinity; this.level = this.sweep = 0; }

    /** Returns true through the final clear frame, so the partial-frame cache is rebuilt. */
    advance(dt: number, now: number, allowed: boolean) {
        const moving = Number.isFinite(this.elapsed), before = this.level;
        if (!allowed || now - this.startedAt > 1800) this.clear();
        else if (moving) {
            this.elapsed += Math.max(0, dt);
            if (this.elapsed >= 1.2) this.clear();
            else {
                const charge = this.elapsed / .192;
                this.level = charge * charge * Math.exp(2 - 2 * charge);
                this.sweep = Math.min(1, this.elapsed / .48);
            }
        }
        return moving || before !== this.level;
    }
}
