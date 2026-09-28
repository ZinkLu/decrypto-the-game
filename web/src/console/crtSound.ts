import type { CrtTube } from './crtMotion';

export type CrtSoundCue = 'crt-degauss' | 'crt-warmup' | 'crt-collapse' | 'crt-discharge';
export type CrtSoundEvent = { type: 'begin' | 'end' } | { type: 'play'; cue: CrtSoundCue; gain: number };

/** One shared supply, following the main glass rather than six overlapping tubes. */
export class CrtSoundMotion {
    private powered?: boolean;
    private on?: boolean;
    private reduced = false;
    private mainsStart = false;
    private stage?: 'opening' | 'closing';
    private warmup = false;
    private line = false;
    private spot = false;

    update(tube: CrtTube, powered: boolean, reduced = false): CrtSoundEvent[] {
        const events: CrtSoundEvent[] = [];
        const play = (cue: CrtSoundCue, gain = 1) => events.push({ type: 'play', cue, gain });
        if (this.powered === undefined) {
            // Loading a powered console is a snapshot, not a switch being thrown.
            this.powered = powered; this.on = tube.on; this.reduced = reduced;
            return events;
        }
        const switched = powered !== this.powered;
        if (reduced) {
            // With no tube animation, use one compact cue for a real power action.
            if (switched) {
                events.push({ type: 'begin' });
                play(powered ? 'crt-degauss' : 'crt-collapse', .65);
            } else if (!this.reduced) events.push({ type: 'end' });
            this.stage = undefined; this.mainsStart = false;
            this.powered = powered; this.on = powered; this.reduced = true;
            return events;
        }
        this.reduced = false;
        if (switched) this.mainsStart = powered;
        if (switched || tube.on !== this.on) {
            events.push({ type: 'begin' });
            this.stage = tube.on ? 'opening' : 'closing';
            this.warmup = this.line = this.spot = false;
            // The hot PTC suppresses a second degauss on a quick restart. Palette
            // changes reopen the raster without energising the degaussing coil.
            if (tube.on && this.mainsStart) {
                if (tube.ptc < .65) play('crt-degauss', 1 - tube.ptc);
                this.mainsStart = false;
            }
        }
        this.powered = powered; this.on = tube.on;
        if (this.stage === 'opening') {
            if (tube.steady) {
                events.push({ type: 'end' }); this.stage = undefined;
            } else if (!this.warmup && tube.rail >= .15) {
                this.warmup = true;
                play('crt-warmup', .4 + .6 * (1 - tube.heat));
            }
        } else if (this.stage === 'closing') {
            if (!tube.moving) {
                events.push({ type: 'end' }); this.stage = undefined;
            } else {
                if (!this.line && tube.height < .10 && tube.glow > .004) {
                    this.line = true; play('crt-collapse');
                }
                if (!this.spot && tube.width < .04 && tube.glow > .004) {
                    this.spot = true; play('crt-discharge');
                }
            }
        }
        return events;
    }
}
