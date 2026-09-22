/** What the four keyword windows are built from: the LED module they ship with, or the earlier ruby-filtered tube. */
export type WordDisplay = 'led' | 'crt';
type Packed = { set(x: number, y: number, z: number, w: number): unknown };

/**
 * One 120x70 module per window. A keyword stands 20 dots tall and the legends 12:
 * enough lamps for every stroke of an ideograph, few enough that each lamp can be
 * seen from the ordinary viewing distance. Only the middle band can scroll; the
 * address and status stay fixed.
 */
export const dotGrid = { cols: 120, rows: 70, inset: 8, bandTop: 20, bandBottom: 50, gap: 27 };
/** Dot heights of the type: a keyword alone, shrunk to fit, on two lines, and the legends. */
export const dotType = { word: 20, fitted: [18, 16, 15], split: 15, leading: 16, legend: 12 };

// Classic 5x7 sign font, one row per number, most significant bit on the left.
const font: Record<string, number[]> = {
    A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001], B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
    C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110], D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
    E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111], F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
    G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111], H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
    I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110], J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
    K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001], L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
    M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001], N: [0b10001, 0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001],
    O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110], P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
    Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101], R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
    S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110], T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
    U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110], V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
    W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010], X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
    Y: [0b10001, 0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100], Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
    0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110], 1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
    2: [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111], 3: [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
    4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010], 5: [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
    6: [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110], 7: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
    8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110], 9: [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
    '-': [0, 0, 0, 0b11111, 0, 0, 0], '.': [0, 0, 0, 0, 0, 0b01100, 0b01100], '/': [0, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0],
    ':': [0, 0b01100, 0b01100, 0, 0b01100, 0b01100, 0], "'": [0b01100, 0b00100, 0b01000, 0, 0, 0, 0], ' ': [0, 0, 0, 0, 0, 0, 0],
    '#': [0b11111, 0b11111, 0b11111, 0b11111, 0b11111, 0b11111, 0b11111], '?': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0, 0b00100],
};

export const dotTextWidth = (value: string, scaleX = 1) => Math.max(0, value.length * 6 - 1) * scaleX;
/** Calls `plot` for every lit dot of `value`; letters are 5 wide on a 6 pitch. */
export function dotText(value: string, x: number, y: number, plot: (x: number, y: number, w: number, h: number) => void, scaleX = 1, scaleY = 1) {
    [...value.toUpperCase()].forEach((char, index) => {
        const rows = font[char] ?? font['?'];
        rows.forEach((bits, row) => {
            for (let col = 0; col < 5; col++) if (bits & (16 >> col)) plot(x + (index * 6 + col) * scaleX, y + row * scaleY, scaleX, scaleY);
        });
    });
}

/** Fit both scripts from the same base size. The painter supplies actual font metrics. */
export function dotWordLayout(value: string, measure = (text: string, size: number) =>
    [...text].reduce((sum, char) => sum + size * (char.codePointAt(0)! > 0x2e7f ? 1 : .60), 0)) {
    const word = value.trim(), available = dotGrid.cols - dotGrid.inset * 2;
    const result = (lines: string[], size: number) => ({ size, lines,
        width: Math.ceil(Math.max(0, ...lines.map(line => measure(line, size)))) });
    if (measure(word, dotType.word) <= available) return result([word], dotType.word);
    const tokens = /\s/.test(word) ? word.split(/\s+/) : /[\u2e80-\uffff]/.test(word) ? [...word] : [word];
    let splitLines: string[] | undefined, best = Infinity;
    const joiner = /\s/.test(word) ? ' ' : '';
    for (let split = 1; split < tokens.length; split++) {
        const lines = [tokens.slice(0, split).join(joiner), tokens.slice(split).join(joiner)];
        const width = Math.max(...lines.map(line => measure(line, dotType.split)));
        if (width < best) { best = width; splitLines = lines; }
    }
    // Keep a single word on one line when a modest fit is enough.
    for (const size of dotType.fitted)
        if (measure(word, size) <= available) return result([word], size);
    if (splitLines && best <= available) return result(splitLines, dotType.split);
    return result([word], dotType.fitted.at(-1)!); // An unusually long unbroken word retains every character and scrolls.
}

/** Seconds, and fractions of the supply. */
export const dotTuning = {
    step: .002,
    railRise: .018, railFall: .11,
    // A diode needs its forward voltage: below it the panel is simply dark.
    forward: .35,
    // The controller proves every dot, clears the panel, then clocks the columns in.
    stagger: .04, lampTest: .08, clear: .04, load: .30, reload: .18, darkBeat: .06,
    marquee: { speed: 30, pause: 1.1 },
};

/** Drive electronics of one LED module. */
export class DotDriver {
    on = true;
    rail = 1;
    /** Columns clocked in so far, and the lamp test level. */
    reveal = 1; test = 0;
    scroll = 0;
    resting = true;
    /** Width of the keyword strip in dots; wider than the module means a marquee. */
    strip = dotGrid.cols;
    private clock = 1; private hold = 0; private carry = 0; private loadTime = 0; private random: number;

    constructor(private seed = 0) {
        // Small seeds need mixing, or four modules would draw nearly the same numbers.
        let hash = Math.imul(seed + 1, 0x9e3779b1) >>> 0;
        hash = Math.imul(hash ^ hash >>> 15, 0x85ebca6b) >>> 0;
        hash = Math.imul(hash ^ hash >>> 13, 0xc2b2ae35) >>> 0;
        this.random = (hash ^ hash >>> 16) >>> 0;
    }

    private next() {
        this.random = (Math.imul(this.random, 1664525) + 1013904223) >>> 0;
        return this.random / 4294967296;
    }
    power(on: boolean) {
        if (this.on === on) return;
        this.on = on;
        this.resting = false;
        if (on) {
            this.clock = -dotTuning.stagger * ((this.seed % 4 + 4) % 4);
            this.reveal = 0; this.test = 0;
            this.loadTime = dotTuning.load;
        }
    }
    /** New content: the controller clears the band and clocks it in again. */
    load() {
        if (!this.on || this.reveal < 1) return;
        this.reveal = 0;
        this.loadTime = dotTuning.reload;
        this.clock = dotTuning.lampTest + dotTuning.clear - .02 * this.next();
        this.resting = false;
    }
    settle(on = this.on) {
        this.on = on;
        this.rail = on ? 1 : 0;
        this.reveal = on ? 1 : 0;
        this.test = 0; this.clock = 1; this.carry = 0;
        this.resting = true;
    }
    step(dt: number) {
        this.carry += Math.max(0, dt);
        // A marquee keeps crawling on a resting panel; it needs no substeps.
        if (this.on && this.strip > dotGrid.cols && this.reveal >= 1) {
            const lap = this.strip - 2 * dotGrid.inset + dotGrid.gap, { speed, pause } = dotTuning.marquee;
            this.hold += Math.max(0, dt);
            if (this.hold > pause) this.scroll = (this.scroll + speed * dt) % lap;
            if (this.scroll < speed * dt && this.hold > pause + 1) this.hold = 0;
        } else { this.scroll = 0; this.hold = 0; }
        if (this.resting) { this.carry = 0; return; }
        for (let budget = 250; this.carry >= dotTuning.step && budget > 0 && !this.resting; budget--) {
            this.carry -= dotTuning.step;
            this.substep(dotTuning.step);
        }
        if (this.carry >= dotTuning.step) this.carry = 0;
    }
    private substep(dt: number) {
        const t = dotTuning, goal = this.on ? 1 : 0;
        this.rail += (goal - this.rail) * (1 - Math.exp(-dt / (goal > this.rail ? t.railRise : t.railFall)));
        if (this.on) this.clock += dt;
        this.test = this.on && this.clock > 0 && this.clock < t.lampTest ? 1 : 0;
        if (this.on && this.reveal < 1 && this.clock > t.lampTest + t.clear) this.reveal = Math.min(1, this.reveal + dt / this.loadTime);
        if (Math.abs(this.rail - goal) < .002 && (!this.on || this.reveal >= 1 && this.test === 0)) {
            const { scroll, hold } = this;
            this.settle();
            this.scroll = scroll; this.hold = hold;
        }
    }
    /** Light per lit dot, 1 at rest. */
    get brightness() { return Math.max(0, (this.rail - dotTuning.forward) / (1 - dotTuning.forward)); }
    get lit() { return this.brightness > 0; }
    /** Frames are owed while the panel still changes what it shows. */
    get moving() { return !this.resting && (this.on || this.lit) || this.on && this.strip > dotGrid.cols; }
    /** drive: supply, columns loaded, dim self-test, row banks enabled. panel: scroll, width, seed, 0. */
    pack(drive: Packed, panel: Packed) {
        drive.set(this.brightness, this.reveal, this.test * .14, this.on ? 1 : Math.min(1, this.brightness * 1.5));
        panel.set(Math.floor(this.scroll), this.strip, this.seed, 0);
    }
}

/** All four modules share a palette bus: exchange colours only when EVERY module is dark. */
export class DotBank<T extends { id: string }> {
    current?: T;
    private desired?: T;
    private powered = true;
    private darkTime = 0;
    constructor(readonly drivers: DotDriver[] = []) {}
    sync(powered: boolean, next: T) {
        this.powered = powered;
        this.desired = next;
        if (!this.current) {
            this.current = next;
            for (const driver of this.drivers) driver.settle(powered);
        } else this.route(0);
    }
    private route(dt: number) {
        if (!this.current || !this.desired) return;
        const changing = this.current.id !== this.desired.id;
        for (const driver of this.drivers) driver.power(this.powered && !changing);
        const dark = this.drivers.every(driver => !driver.lit);
        if (!this.powered) {
            this.darkTime = 0;
            if (dark) this.current = this.desired;
        } else if (changing) {
            this.darkTime = dark ? this.darkTime + dt : 0;
            if (this.darkTime >= dotTuning.darkBeat) {
                this.current = this.desired;
                this.darkTime = 0;
                for (const driver of this.drivers) driver.power(true);
            }
        } else {
            this.current = this.desired;
            this.darkTime = 0;
        }
    }
    advance(dt: number, reduced = false) {
        if (reduced) {
            this.current = this.desired;
            this.darkTime = 0;
            for (const driver of this.drivers) { driver.settle(this.powered); driver.scroll = 0; }
            return;
        }
        this.route(0);
        for (const driver of this.drivers) driver.step(dt);
        this.route(Math.max(0, dt));
    }
    get moving() { return this.powered && this.current?.id !== this.desired?.id || this.drivers.some(driver => driver.moving); }
}
