import { scopeRatio, scopeSweepHz, scopeAxisAngle } from './model';

/**
 * The VECTOR MONITOR, from the tube outward. A CRT only ever shows one thing:
 * a beam at (X, Y) and the glow it leaves behind. Two oscillators steer it.
 * The reference runs the horizontal plates, as a sweep ramp or as its own
 * sine; CAL OUT, patched into INPUT, runs the vertical plates. A sine wave
 * and a Lissajous figure are the side and end views of the same space curve
 * (ramp, reference, signal), and the X-Y dial turns between those views.
 */
export const scopeTuning = {
    // Phosphor raster: the plotting area of the 420 px wide scope canvas.
    width: 420, height: 292, centerX: 210, centerY: 146,
    sweepReach: 175, // half of the ten-division sweep
    deflection: 105, // three divisions of signal on either axis
    samplesPerCycle: 48,
    maxSubsteps: 1200,
    maxStep: .05, // seconds of beam travel simulated per frame, at most
    // Mutual pulling between the oscillators. A p:q tongue is `lockStrength /
    // (p * q)^.25` wide and still bends the slip out to `lockReach` widths.
    lockStrength: .016,
    lockReach: 6,
    shapeSettle: .07, // seconds for the WAVE blend's coupling network
    // A short afterglow keeps moving figures crisp. Slow sweeps glow for a
    // share of one sweep instead, so the spot still draws a whole figure.
    persistence: .022,
    persistenceSweeps: .6,
    maxPersistence: 3,
    beamEnergy: 2400, // per sweep; brightness then follows dwell time alone
    beamRadius: 1.4,
    stampSpacing: .7,
};

const turn = Math.PI * 2;

/**
 * WAVE blends through a function generator's outputs, and each stretch of the
 * dial is one circuit parameter: the integrator's symmetry (sawtooth to
 * triangle), the diode shaper (triangle to sine), amplifier overdrive (sine to
 * square, whose finite slew leaves faint risers) and the comparator's duty
 * (square to pulse). `shape` runs 0 to 4 across the engraved marks. One cycle
 * per unit phase; shapes rise as the cycle begins, so a locked sweep opens the
 * way a rising-edge trigger would.
 */
export function waveSample(shape: number, phase: number) {
    const t = phase - Math.floor(phase), sine = Math.sin(turn * t);
    if (shape < 1) {
        const rise = .97 - .47 * Math.max(0, shape), u = (t + rise / 2) % 1;
        return u < rise ? 2 * u / rise - 1 : 1 - 2 * (u - rise) / (1 - rise);
    }
    if (shape < 2) return (2 - shape) * 2 / Math.PI * Math.asin(sine) + (shape - 1) * sine;
    if (shape < 3) {
        const drive = 14 * (shape - 2) ** 2.2;
        return drive < .001 ? sine : Math.tanh(drive * sine) / Math.tanh(drive);
    }
    const narrow = Math.min(1, shape - 3), level = Math.cos(Math.PI * (.5 - .3 * narrow));
    const high = .5 + .5 * Math.tanh((Math.sin(turn * (t + Math.asin(level) / turn - .02 * narrow)) - level) * (14 + 16 * narrow));
    return -1 + .6 * narrow + (2 - .64 * narrow) * high;
}
export const scopeWaveforms = 5;

export interface Resonance { p: number; q: number; strength: number }
const coprime = (a: number, b: number): boolean => b ? coprime(b, a % b) : a === 1;
export const scopeResonances: Resonance[] = [];
for (let q = 1; q <= 5; q++) for (let p = q; p <= 5 * q; p++) {
    if (coprime(p, q)) scopeResonances.push({ p, q, strength: scopeTuning.lockStrength / (p * q) ** .25 });
}
/** The closest tongue, however far; `detune` is in tongue half-widths. */
export function nearestResonance(ratio: number) {
    let best = scopeResonances[0], detune = Infinity;
    for (const candidate of scopeResonances) {
        const offset = (candidate.q * ratio - candidate.p) / candidate.strength;
        if (Math.abs(offset) < Math.abs(detune)) { best = candidate; detune = offset; }
    }
    return { ...best, detune, locked: Math.abs(detune) < 1 };
}
/** The tongue that currently pulls on the oscillators, if any is within reach. */
export function scopeResonance(ratio: number) {
    const nearest = nearestResonance(ratio);
    return Math.abs(nearest.detune) <= scopeTuning.lockReach ? nearest : null;
}

export interface ScopeControls { freq: number; wave: number; rate: number; axis: number }
/** Beam strokes as x0, y0, x1, y1 and the share of one sweep spent on each. */
export interface ScopeTrace { segments: Float32Array; count: number }

export class ScopeSignal {
    /** Oscillator phases in cycles: the sweep reference and CAL OUT. */
    reference = 0;
    signal = 0;
    /** Phase detector against the nearest tongue, averaged over the last run:
     *  1 dead in step, less toward a tongue's edge, beating between -1 and 1 in a slip. */
    coherence = 1;
    private shape = (scopeWaveforms - 1) / 2;
    private segments = new Float32Array(5 * (2 * scopeTuning.maxSubsteps + 2));
    private count = 0;
    private cos = 1;
    private sin = 0;
    private x(phase: number) {
        return scopeTuning.centerX + this.cos * scopeTuning.sweepReach * (2 * phase - 1)
            + this.sin * scopeTuning.deflection * Math.sin(turn * phase);
    }
    private y(phase: number) {
        return scopeTuning.centerY - scopeTuning.deflection * waveSample(this.shape, phase);
    }
    private stroke(x0: number, y0: number, x1: number, y1: number, share: number) {
        if (!(share > 0)) return;
        const strokes = this.segments, at = this.count++ * 5;
        strokes[at] = x0; strokes[at + 1] = y0; strokes[at + 2] = x1; strokes[at + 3] = y1; strokes[at + 4] = share;
    }
    private view(controls: ScopeControls) {
        const angle = scopeAxisAngle(controls.axis);
        this.cos = Math.cos(angle); this.sin = Math.sin(angle);
        this.count = 0;
    }
    /** Runs both oscillators for `seconds` and returns the path the beam wrote. */
    advance(seconds: number, controls: ScopeControls): ScopeTrace {
        const elapsed = Math.min(scopeTuning.maxStep, Math.max(0, seconds));
        const ratio = scopeRatio(controls.freq), sweeps = scopeSweepHz(controls.rate) * elapsed;
        const nearest = nearestResonance(ratio), resonance = Math.abs(nearest.detune) <= scopeTuning.lockReach ? nearest : null;
        this.view(controls);
        // The blend settles through an RC network, so even a notched turn melts.
        this.shape += (Math.max(0, Math.min(1, controls.wave)) * (scopeWaveforms - 1) - this.shape) * (1 - Math.exp(-elapsed / scopeTuning.shapeSettle));
        const steps = Math.max(1, Math.min(scopeTuning.maxSubsteps, Math.ceil(sweeps * Math.max(1, ratio) * scopeTuning.samplesPerCycle)));
        const step = sweeps / steps;
        let x = this.x(this.reference), y = this.y(this.signal), inStep = 0;
        for (let n = 0; n < steps && step > 0; n++) {
            // Adler's equation: near p:q the oscillators pull each other's phase.
            // Inside the tongue the slip stops; just outside, it hesitates and lets go.
            const slip = turn * (nearest.q * this.signal - nearest.p * this.reference);
            const pull = resonance ? resonance.strength / resonance.q * Math.sin(slip) : 0;
            inStep += Math.cos(slip);
            const climb = step * (ratio - pull);
            let reference = this.reference + step, share = step;
            if (reference >= 1) {
                // Flyback is blanked. Split the stroke where the ramp ends, then
                // resume from the left edge with the signal where it really is.
                const before = (1 - this.reference) / step, edge = this.y(this.signal + climb * before);
                this.stroke(x, y, this.x(1), edge, step * before);
                reference -= 1; share -= step * before;
                x = this.x(0); y = edge;
            }
            this.reference = reference;
            this.signal = (this.signal + climb) % 1;
            const nextX = this.x(reference), nextY = this.y(this.signal);
            this.stroke(x, y, nextX, nextY, share);
            x = nextX; y = nextY;
        }
        if (step > 0) this.coherence = inStep / steps;
        return { segments: this.segments, count: this.count };
    }
    /** Reduced motion: the whole standing figure at once, as a long exposure. */
    still(controls: ScopeControls): ScopeTrace {
        const ratio = scopeRatio(controls.freq), resonance = scopeResonance(ratio);
        this.view(controls);
        this.shape = Math.max(0, Math.min(1, controls.wave)) * (scopeWaveforms - 1);
        const sweeps = resonance ? resonance.q : 6, slope = resonance ? resonance.p / resonance.q : ratio;
        const offset = resonance?.locked ? Math.asin(resonance.detune) / turn / resonance.q : 0;
        this.coherence = resonance?.locked ? Math.sqrt(1 - resonance.detune ** 2) : 0;
        const steps = Math.min(scopeTuning.maxSubsteps, Math.ceil(Math.max(1, slope) * scopeTuning.samplesPerCycle));
        for (let sweep = 0; sweep < sweeps; sweep++) for (let n = 0; n < steps; n++) {
            const from = n / steps, to = (n + 1) / steps;
            this.stroke(this.x(from), this.y(offset + slope * (sweep + from)),
                this.x(to), this.y(offset + slope * (sweep + to)), 1 / (steps * sweeps));
        }
        return { segments: this.segments, count: this.count };
    }
}

/**
 * Float energy per pixel, exposed by dwell time. `energy` is the coating's glow
 * at the end of a frame and fades exponentially. `exposure` is what the frame
 * shows: the glow averaged over the frame's interval, as a shutter would see
 * it. Averaging removes the beat between a beam that re-writes a trace fifty
 * times a second and a display that samples it sixty times, so the afterglow
 * can be short and a moving figure stays crisp without shimmering.
 */
export class Phosphor {
    readonly energy: Float32Array;
    readonly exposure: Float32Array;
    private elapsed = 0;
    private persistence = 1;
    private kept = 1;
    private seen = 1;
    private tone = new Uint8ClampedArray(1024 * 4);
    private across = new Float32Array(4);
    private down = new Float32Array(4);
    constructor(readonly width = scopeTuning.width, readonly height = scopeTuning.height) {
        this.energy = new Float32Array(width * height);
        this.exposure = new Float32Array(width * height);
        for (let n = 0; n < 1024; n++) {
            // The coating saturates; an overdriven trace burns from green toward white.
            const energy = n / 128, hot = Math.max(0, Math.min(1, (energy - .8) / 3.7)), white = hot * hot * (3 - 2 * hot);
            this.tone.set([150 + 82 * white, 232 + 23 * white, 110 + 90 * white, 255 * (1 - Math.exp(-energy))], n * 4);
        }
    }
    clear() { this.energy.fill(0); this.exposure.fill(0); }
    /** Strokes written next are shown in full at once: a long exposure. */
    settle() { this.elapsed = 0; }
    /** Opens a frame `seconds` long; the old glow fades through it. */
    age(seconds: number, persistence: number) {
        const elapsed = Math.max(0, seconds), energy = this.energy, exposure = this.exposure;
        const keep = Math.exp(-elapsed / persistence), mean = elapsed ? persistence / elapsed * (1 - keep) : 1;
        for (let n = 0; n < energy.length; n++) {
            const glow = energy[n];
            exposure[n] = glow * mean;
            energy[n] = glow * keep < 1e-4 ? 0 : glow * keep;
        }
        this.elapsed = elapsed; this.persistence = persistence;
    }
    /**
     * The beam spends `energy` crossing this stroke: slow strokes burn brighter.
     * `moment` is when in the open frame it was written, 0 at the start to 1 at
     * the end. A late stroke has faded less by the end of the frame, but was on
     * the screen for less of the exposure.
     */
    deposit(x0: number, y0: number, x1: number, y1: number, energy: number, moment = .5) {
        const reach = scopeTuning.beamRadius;
        if (!(energy > 0) || Math.max(x0, x1) < -reach || Math.min(x0, x1) > this.width + reach ||
            Math.max(y0, y1) < -reach || Math.min(y0, y1) > this.height + reach) return;
        this.kept = Math.exp(-(1 - moment) * this.elapsed / this.persistence);
        this.seen = this.elapsed ? this.persistence / this.elapsed * (1 - this.kept) : 1;
        const stamps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / scopeTuning.stampSpacing));
        for (let n = 0; n < stamps; n++) {
            const t = (n + .5) / stamps;
            this.stamp(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, energy / stamps);
        }
    }
    private stamp(x: number, y: number, energy: number) {
        const reach = scopeTuning.beamRadius, across = this.across, down = this.down;
        // A tent-shaped spot over the pixel centers it reaches, normalized so a
        // stamp always delivers exactly its energy.
        const left = Math.floor(x - reach - .5) + 1, top = Math.floor(y - reach - .5) + 1;
        let columns = 0, rows = 0, acrossSum = 0, downSum = 0;
        for (; columns < 4; columns++) {
            const weight = 1 - Math.abs(left + columns + .5 - x) / reach;
            if (weight <= 0) break;
            acrossSum += across[columns] = weight;
        }
        for (; rows < 4; rows++) {
            const weight = 1 - Math.abs(top + rows + .5 - y) / reach;
            if (weight <= 0) break;
            downSum += down[rows] = weight;
        }
        if (!columns || !rows) return;
        const unit = energy / (acrossSum * downSum);
        for (let j = 0; j < rows; j++) {
            const row = top + j;
            if (row < 0 || row >= this.height) continue;
            for (let i = 0; i < columns; i++) {
                const column = left + i;
                if (column < 0 || column >= this.width) continue;
                const share = unit * across[i] * down[j];
                this.energy[row * this.width + column] += share * this.kept;
                this.exposure[row * this.width + column] += share * this.seen;
            }
        }
    }
    /** Writes the exposure as RGBA; alpha carries the brightness for additive compositing. */
    expose(pixels: Uint8ClampedArray) {
        const tone = this.tone, exposure = this.exposure;
        for (let n = 0, out = 0; n < exposure.length; n++, out += 4) {
            const level = exposure[n];
            if (level < .004) { pixels[out + 3] = 0; continue; }
            const index = (level >= 7.99 ? 1023 : level * 128 | 0) * 4;
            pixels[out] = tone[index]; pixels[out + 1] = tone[index + 1]; pixels[out + 2] = tone[index + 2]; pixels[out + 3] = tone[index + 3];
        }
    }
}

/** Signal chain and tube together: what the engine runs once per frame. */
export class VectorMonitor {
    readonly signal = new ScopeSignal();
    readonly phosphor = new Phosphor();
    clear() { this.phosphor.clear(); }
    run(seconds: number, controls: ScopeControls, still = false) {
        const hz = scopeSweepHz(controls.rate);
        const persistence = Math.min(scopeTuning.maxPersistence, Math.max(scopeTuning.persistence, scopeTuning.persistenceSweeps / hz));
        if (still) { this.phosphor.clear(); this.phosphor.settle(); }
        else this.phosphor.age(Math.min(scopeTuning.maxStep, seconds), persistence);
        const trace = still ? this.signal.still(controls) : this.signal.advance(seconds, controls);
        // Beam current tracks the sweep so a standing figure is equally bright at
        // every TIME/DIV; what remains is dwell time, the slow parts of a curve.
        // Fast sweeps pile passes up within the afterglow; slow ones show one pass.
        const energy = scopeTuning.beamEnergy * (still ? 1 : Math.min(1, 1 / (hz * persistence)));
        const strokes = trace.segments;
        // Strokes arrive in the order, and at the even pace, the beam wrote them.
        for (let n = 0, at = 0; n < trace.count; n++, at += 5)
            this.phosphor.deposit(strokes[at], strokes[at + 1], strokes[at + 2], strokes[at + 3], strokes[at + 4] * energy, (n + .5) / trace.count);
    }
}
