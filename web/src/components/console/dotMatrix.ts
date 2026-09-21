/** What the four keyword windows are built from: the LED module they ship with, or the earlier ruby-filtered tube. */
export type WordDisplay = 'led' | 'crt';
type Packed = { set(x: number, y: number, z: number, w: number): unknown };

/** One 64x36 module per window: a header line, then a 25-row keyword band. */
export const dotGrid = { cols: 64, rows: 36, bandTop: 11, bandBottom: 35, gap: 14 };

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

/**
 * How a keyword sits in the band. Ideographs take 16-dot cells, five of them
 * 12: the classic sign size, in scale with the rest of the console. Latin
 * words use the sign font doubled, then double-height, then two lines.
 * Whatever is still wider than the module crawls past as a marquee.
 */
export function dotWordLayout(value: string) {
    const glyphs = [...value.trim()];
    if (glyphs.some(char => char.charCodeAt(0) > 0x2e7f)) {
        const size = glyphs.length <= 4 ? 16 : 12;
        return { kind: 'cjk' as const, size, lines: [glyphs.join('')], width: glyphs.length * size };
    }
    const word = value.trim().toUpperCase();
    for (const [scaleX, scaleY] of [[2, 2], [1, 2]])
        if (dotTextWidth(word, scaleX) <= dotGrid.cols) return { kind: 'sign' as const, scaleX, scaleY, lines: [word], width: dotTextWidth(word, scaleX) };
    const tokens = word.split(/\s+/);
    let lines = [word];
    for (let split = 1; split < tokens.length; split++) {
        const candidate = [tokens.slice(0, split).join(' '), tokens.slice(split).join(' ')];
        if (Math.max(...candidate.map(line => dotTextWidth(line))) < Math.max(...lines.map(line => dotTextWidth(line)))) lines = candidate;
    }
    const width = Math.max(...lines.map(line => dotTextWidth(line)));
    return lines.length > 1 && width <= dotGrid.cols ? { kind: 'sign' as const, scaleX: 1, scaleY: 1, lines, width }
        : { kind: 'sign' as const, scaleX: 1, scaleY: 2, lines: [word], width: dotTextWidth(word) };
}

/** Seconds, and fractions of the supply. */
export const dotTuning = {
    step: .002,
    railRise: .018, railFall: .11,
    // A diode needs its forward voltage: below it the panel is simply dark.
    forward: .35,
    // The controller proves every dot, clears the panel, then clocks the columns in.
    stagger: .15, lampTest: .16, clear: .07, load: .24, reload: .20,
    marquee: { speed: 22, pause: 1.1 },
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
            this.clock = -dotTuning.stagger * this.next();
            this.reveal = 0; this.test = 0;
            this.loadTime = dotTuning.load;
        }
    }
    /** New content: the controller clears the band and clocks it in again. */
    load() {
        if (!this.on || this.reveal < 1) return;
        this.reveal = 0;
        this.loadTime = dotTuning.reload;
        this.clock = dotTuning.lampTest + dotTuning.clear - .05 * this.next();
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
            const lap = this.strip + dotGrid.gap, { speed, pause } = dotTuning.marquee;
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
    get moving() { return !this.resting && (this.on || this.lit); }
    /** drive: brightness, columns loaded, lamp test, 0. panel: marquee offset, strip width, seed, 0. */
    pack(drive: Packed, panel: Packed) {
        drive.set(this.brightness, this.reveal, this.test, 0);
        panel.set(Math.floor(this.scroll), this.strip, this.seed, 0);
    }
}
