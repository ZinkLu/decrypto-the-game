type Phase = 'on' | 'closing' | 'dark' | 'opening' | 'off';
export type CrtKind = 'screen' | 'word' | 'scope';
type Packed = { set(x: number, y: number, z: number, w: number): unknown };

/** Seconds and fractions of the resting picture. The look is tuned here, not in the shader. */
export const crtTuning = {
    step: .002,
    // Supply reservoir: charges through the switch, drains into the load. Each
    // unit starts after its own delay and rides through a share of it on the way out.
    railRise: .028, railFall: .085, holdUp: .4,
    // The vertical amplifier loses gain with the cube of its supply; the
    // resonant horizontal stage follows it in proportion and rings on longer.
    vertLag: .012, vertLaw: 3, horzLag: .034,
    // Cathode: slow to heat, far slower to cool, emitting by Richardson's law.
    heatRise: .30, heatFall: 4, work: 3,
    // Video amplifier and grid bias die first; the unblanked gun then floods the raster.
    videoFrom: .62, videoTo: .95, surge: 1.25,
    // Anode: a stiff flyback supply while running, then only the tube's own
    // capacitance, drained by the beam. Phosphor needs `dead` to light at all.
    // Deflection and anode share one transformer, so little of the voltage
    // error reaches the picture size.
    hvRise: .15, hvDrain: 6, hvBleed: 3, sag: .07, dead: .2, stiffness: .12,
    // The screen grid's reservoir outlives the rails. Cathode current goes with
    // its cube, which is what lets the spot fade through decades, not vanish.
    gridRise: .05, gridFall: .24, gridLaw: 3,
    // Focus follows the flyback while the anode holds its charge: the mismatch
    // swells the spot, as do a flooding gun and a cathode still short of heat.
    focusLag: .05, focusFall: .03, spotGain: 7, flare: 5, coldBlur: 6,
    // Beam limiter, sync lock, degauss thermistor.
    ablLag: .22, ablBoost: .25,
    lockLag: .16, lockLoss: .03,
    ptcHeat: .20, ptcCool: 2.5,
    // Phosphor: a quick drop, then a faint tail. Eye and phosphor together expose
    // each frame for a while, which is what blurs the edges of a raster in flight.
    ghostFast: .035, ghostSlow: .14, ghostMix: .75, exposure: .024,
    // Below this nothing on the glass is distinguishable from black.
    black: .004,
};

/** Small tubes run quicker; every unit of a batch differs a little. */
const kinds: Record<CrtKind, { pace: number; tolerance: number; delay: number; degauss: number; roll: number; spot: number }> = {
    screen: { pace: 1, tolerance: 0, delay: 0, degauss: 1, roll: .12, spot: .0035 },
    word: { pace: .62, tolerance: .30, delay: .12, degauss: 0, roll: .36, spot: .008 },
    scope: { pace: .7, tolerance: .12, delay: .05, degauss: 0, roll: 0, spot: .006 },
};

/** Resting spot radius, the shader's reference for a sharp picture. */
export const crtRestSpot = (kind: CrtKind) => kinds[kind].spot;

const smooth = (value: number) => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
};
const toward = (dt: number, lag: number) => 1 - Math.exp(-dt / lag);
const spread = (seed: number, salt: number) => {
    const value = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453123;
    return 2 * (value - Math.floor(value)) - 1;
};

/**
 * One picture tube as its supply sees it. Nothing here is a timeline: the
 * collapse to a line and a lingering spot, the slow cold start, the quick warm
 * restart and the over-sized, soft first picture all follow from the states.
 */
export class CrtTube {
    on = true;
    rail = 1; heat = 1; hv = 1; vert = 1; horz = 1; focus = 1; grid = 1;
    abl = 1; lock = 1; ptc = 1; beam = 1;
    /** Extent of the raster one exposure ago. */
    pastWidth = 1; pastHeight = 1;
    /** Every state has reached its goal: nothing to integrate. */
    resting = true;
    private ghostFast = 1; private ghostSlow = 1;
    private wait = 0; private carry = 0;
    private readonly kind: typeof kinds[CrtKind];
    private readonly lag: Record<'railRise' | 'railFall' | 'vertLag' | 'horzLag' | 'heatRise' | 'heatFall' | 'hvRise' | 'focusLag' | 'lockLag', number>;
    private readonly delay: number;
    private readonly rollSign: number;

    constructor(kind: CrtKind = 'screen', seed = 0) {
        this.kind = kinds[kind];
        const vary = (salt: number) => this.kind.pace * (1 + this.kind.tolerance * spread(seed, salt));
        const t = crtTuning;
        this.lag = { railRise: t.railRise * vary(1), railFall: t.railFall * vary(2), vertLag: t.vertLag * vary(3),
            horzLag: t.horzLag * vary(4), heatRise: t.heatRise * vary(5), heatFall: t.heatFall * this.kind.pace,
            hvRise: t.hvRise * vary(6), focusLag: t.focusLag * vary(7), lockLag: t.lockLag * vary(8) };
        this.delay = this.kind.delay * (.5 + .5 * spread(seed, 9));
        this.rollSign = spread(seed, 10) < 0 ? -1 : 1;
    }

    power(on: boolean) {
        if (this.on === on) return;
        this.on = on;
        this.wait = this.delay * (on ? 1 : crtTuning.holdUp);
        this.resting = false;
    }
    /** A new signal: the sync separator lets go and has to find the picture again. */
    disturb(amount = 1) {
        if (!this.on || this.light <= 0) return;
        this.lock = Math.min(this.lock, 1 - amount);
        this.resting = false;
    }
    settle(on = this.on) {
        const value = on ? 1 : 0;
        this.on = on;
        this.rail = this.heat = this.hv = this.vert = this.horz = this.focus = this.grid = value;
        this.abl = this.lock = this.ptc = this.beam = this.ghostFast = this.ghostSlow = value;
        this.pastWidth = this.pastHeight = value;
        this.wait = this.carry = 0;
        this.resting = true;
    }
    step(dt: number) {
        if (this.resting) return;
        this.carry += Math.max(0, dt);
        const step = crtTuning.step;
        // Fixed substeps: the same flick of the switch plays the same at any frame rate.
        for (let budget = 250; this.carry >= step && budget > 0 && !this.resting; budget--) {
            this.carry -= step;
            this.substep(step);
        }
        if (this.resting || this.carry >= step) this.carry = 0;
    }
    private substep(dt: number) {
        const t = crtTuning, lag = this.lag;
        if (this.wait > 0) this.wait -= dt;
        const supply = (this.wait > 0 ? !this.on : this.on) ? 1 : 0;
        this.rail += (supply - this.rail) * toward(dt, supply > this.rail ? lag.railRise : lag.railFall);
        const heater = this.rail * this.rail;
        this.heat += (heater - this.heat) * toward(dt, heater > this.heat ? lag.heatRise : lag.heatFall);
        this.vert += (this.rail ** t.vertLaw - this.vert) * toward(dt, lag.vertLag);
        this.horz += (this.rail - this.horz) * toward(dt, lag.horzLag);
        this.focus += (this.horz - this.focus) * toward(dt, this.horz > this.focus ? lag.focusLag : t.focusFall * this.kind.pace);
        const emission = Math.exp(-t.work * (1 / Math.max(this.heat, .02) - 1));
        const video = this.video;
        const drive = video * (1 + t.ablBoost * (1 - this.abl)) + (1 - video) * t.surge;
        this.grid += (this.horz - this.grid) * toward(dt, (this.horz > this.grid ? t.gridRise : t.gridFall) * this.kind.pace);
        this.beam = emission * drive * this.hv ** 1.5 * this.grid ** t.gridLaw;
        const anode = this.horz * (1 + t.sag * (1 - Math.min(1, this.beam)));
        if (anode >= this.hv) this.hv += (anode - this.hv) * toward(dt, lag.hvRise);
        else this.hv = Math.max(anode, this.hv - this.hv * dt * (1 / t.hvBleed + t.hvDrain * this.beam));
        this.abl += (Math.min(1.5, this.beam) - this.abl) * toward(dt, t.ablLag * this.kind.pace);
        const locking = this.rail > .5 && video > .5;
        this.lock += ((locking ? 1 : 0) - this.lock) * toward(dt, locking ? lag.lockLag : t.lockLoss);
        const warm = this.rail > .5;
        this.ptc += ((warm ? 1 : 0) - this.ptc) * toward(dt, (warm ? t.ptcHeat : t.ptcCool) * this.kind.pace);
        // The phosphor remembers the last full picture, and the path of a retreating edge.
        const full = this.width > .92 && this.height > .92 ? Math.min(1, this.light) * video : 0;
        this.ghostFast = Math.max(full, this.ghostFast * Math.exp(-dt / t.ghostFast));
        this.ghostSlow = Math.max(full, this.ghostSlow * Math.exp(-dt / t.ghostSlow));
        this.pastWidth += (this.width - this.pastWidth) * toward(dt, t.exposure);
        this.pastHeight += (this.height - this.pastHeight) * toward(dt, t.exposure);
        const near = (value: number, goal: number) => Math.abs(value - goal) < .0015;
        const goal = this.on ? 1 : 0;
        // A dark tube goes on cooling unseen, so a restart soon after still finds a warm cathode.
        if (this.wait <= 0 && near(this.rail, goal) && near(this.heat, goal) && near(this.hv, goal) && near(this.vert, goal) &&
            near(this.horz, goal) && near(this.focus, goal) && near(this.grid, goal) && near(this.ptc, goal) && near(this.lock, goal) &&
            (this.on ? near(this.abl, 1) : this.glow < t.black)) this.settle();
    }

    private get video() { return smooth((this.rail - crtTuning.videoFrom) / (crtTuning.videoTo - crtTuning.videoFrom)); }
    private get stiff() { return Math.max(this.hv, .04) ** crtTuning.stiffness; }
    /** A softer beam is thrown further by the same yoke current. */
    get width() { return Math.min(1.25, this.horz / this.stiff); }
    get height() { return Math.min(1.25, this.vert / this.stiff); }
    /** Light leaving the phosphor, 1 for the resting picture. */
    get light() { return this.beam * Math.max(0, (this.hv - crtTuning.dead) / (1 - crtTuning.dead)); }
    get washout() { return 1 - this.video; }
    get ghost() { return crtTuning.ghostMix * this.ghostFast + (1 - crtTuning.ghostMix) * this.ghostSlow; }
    /** Spot radius in picture heights; focus and anode voltage have to track each other. */
    get spot() {
        const t = crtTuning;
        return this.kind.spot * (1 + t.spotGain * Math.abs(this.hv - this.focus) + t.flare * this.washout * Math.sqrt(Math.min(1, this.beam)) +
            t.coldBlur * (this.on ? 1 - this.heat : 0));
    }
    /** A dying supply floods the raster before its hold can be seen to slip. */
    get roll() { return this.on && this.lock < 1 ? this.kind.roll * this.rollSign * (1 - this.lock) ** 2 : 0; }
    /** A vector monitor has no raster to hold: only `roll` kinds tear and jitter. */
    get unstable() { return this.on && this.kind.roll ? 1 - this.lock : 0; }
    get wobble() { return this.kind.degauss * this.rail * (1 - this.ptc); }
    /** The brightest thing on the glass, however small the raster has become. */
    get glow() {
        const spot = this.spot * 1.2;
        return Math.max(this.light / Math.max(Math.max(this.width, spot) * Math.max(this.height, spot), 1e-5), this.ghost);
    }
    /** The glass is still changing, so frames are owed. */
    get moving() { return !this.resting && (this.on || this.glow >= crtTuning.black); }
    /** Nothing of the old picture can be recognised: its frame may be exchanged. */
    get blank() { return (this.video < .02 || this.height < .03 || this.light < .02) && this.ghost < .02; }
    /** Close enough for native inputs to sit on the picture. */
    get steady() {
        return this.on && this.light > .8 && Math.abs(this.width - 1) < .006 && Math.abs(this.height - 1) < .006 &&
            Math.abs(this.roll) < .002 && this.spot < this.kind.spot * 1.6;
    }
    /** scan: width, height, roll, spot. light: light, washout, ghost, unstable. trail: pastWidth, pastHeight, wobble, moving. */
    pack(scan: Packed, light: Packed, trail: Packed) {
        scan.set(this.width, this.height, this.roll, this.spot);
        light.set(this.light, this.washout, this.ghost, this.unstable);
        trail.set(this.pastWidth, this.pastHeight, this.wobble, this.moving ? 1 : 0);
    }
}

/** A palette or a blank power-off frame reaches the glass only once the old picture is gone. */
export class CrtMotion<T extends { id: string }> {
    current?: T;
    readonly tube: CrtTube;
    private desired?: T;
    private powered = true;

    constructor(kind: CrtKind = 'screen', seed = 0) { this.tube = new CrtTube(kind, seed); }

    get interactive() { return this.tube.steady && this.current === this.desired; }
    get moving() { return this.tube.moving; }
    get level() { return Math.min(1, this.tube.light); }
    get phase(): Phase {
        if (this.tube.on) return this.tube.steady ? 'on' : 'opening';
        if (this.powered) return this.tube.blank ? 'dark' : 'closing';
        return this.tube.moving ? 'closing' : 'off';
    }

    sync(powered: boolean, next: T) {
        const first = !this.current;
        this.desired = next;
        this.powered = powered;
        if (first) {
            this.current = next;
            this.tube.settle(powered);
        } else this.route();
    }
    private route() {
        const { tube, desired } = this;
        if (!desired || !this.current) return;
        tube.power(this.powered && this.current.id === desired.id);
        // Updates to the picture being shown pass straight through. Another palette
        // waits until the old picture is past recognising, and a blank power-off
        // frame until the last afterglow has gone: dark glass shows no texture.
        const dark = this.powered ? tube.blank : !tube.moving;
        if (this.current !== desired && (dark || this.powered && this.current.id === desired.id)) this.current = desired;
    }
    advance(dt: number, reduced = false) {
        if (reduced) {
            this.current = this.desired;
            this.tube.settle(this.powered);
            return;
        }
        this.route();
        this.tube.step(dt);
        this.route();
    }
}

/**
 * JS twin of the shader's `crtDensity`: the light a scan of half-extent `reach`
 * leaves at `u` through a gaussian spot. It integrates to one for every extent,
 * so a raster that collapses gets brighter by exactly what it loses in area.
 */
export function crtDensity(u: number, reach: number, spot: number) {
    const erf = (x: number) => {
        const a = Math.abs(x), d = 1 + a * (.278393 + a * (.230389 + a * (.000972 + a * .078108)));
        return Math.sign(x) * (1 - 1 / d ** 4);
    };
    return (erf((u + reach) / spot) - erf((u - reach) / spot)) / (4 * reach);
}
