import { paperCutDuration, paperFeedDuration, paperTearDuration, paperRefillDuration,
    paperTextureLength, paperPose, paperLengthForRecords, receiptFeedMotion, receiptVertex, smoothstep,
    type ReceiptMotion } from './mechanics';

// Two columns per tear tooth so the serrated contour is exact at the vertices.
export const sheetColumns = 64;
export const sheetRows = 40;
const substep = 1000 / 480;
/** Material and hand parameters, exposed so tuning harnesses can vary them. */
export const tuning = {
    gravity: 30,
    // Paper hardly rings: heavy damping kills any springy after-motion.
    airDamping: 10,
    structuralPasses: 3,
    // Bending resists deviation of each particle from the line through its
    // neighbours (fine) and its second neighbours (coarse), which gives paper
    // its flatness: a small curvature already produces a restoring force.
    stiffness: { structural: 1, shear: 1, bend: 1, coarseBend: 1, broadBend: 1 },
    // Paper takes a set instead of springing back, but only once it is bent
    // past the yield deflection *beyond the set it already holds*: inside that
    // band it is elastic about its current shape, which is what keeps a sheet
    // flat. `rate` is the creep per second, so it does not scale with substeps.
    // Yielding and creasing are properties of the stock, so both thresholds are
    // the radius it is bent to, not a fraction of a stencil's span: a fraction
    // would let the wide stencils of long stock take a set at a radius as big
    // as the sheet, and a long archive would furl up like cloth. A stencil
    // folded tighter than the crease radius becomes a limp permanent crease;
    // `floor` keeps the narrow cross-web stencils from creasing on ripples.
    plastic: { radius: .10, rate: 6 },
    crease: { radius: .012, floor: .30, stiffness: .08 },
    // Loads across the tooth line and away from the console shear the fibers.
    // Straight tension along the feed is mostly carried by the nip instead.
    feedTensionWeight: .25,
    // Rated so the crack still runs through the middle of the rip: a stiffer
    // web hands the pull to the fibers sooner, so it needs stronger fibers.
    fiberStrength: .012,
    // How quickly a fiber's measured load follows the pull; lower filters noise.
    loadResponse: 1,
    // Once detached, each particle is bounded by its material distance to the
    // pinch. The bound only catches what the in-plane sweeps left, so it is
    // taken up over a few substeps: a full one-pass projection is a rope
    // snapping taut, and it flicks the free corner back in a single frame.
    tether: .1,
    hand: {
        // The preload swings the pinch on an arc about the tooth line, so the
        // stock hinges over the teeth without slack or stretch before the rip.
        // Stiff stock bends over a radius rather than hinging at the teeth, so
        // the pinch swings slightly inside the arc of its material distance.
        swing: .32, swingRadius: .96, rip: [-.22, -.20, .18], carry: [.05, .06, .80],
        preloadEnd: 90, ripStart: 100, ripEnd: 270, carryStart: 270, twist: -.18, turn: .18,
    },
};

export interface SheetSample { x: number; y: number; z: number; u: number; v: number }

/** Rows crowd toward the tooth line, where the stock bends and breaks. */
export function rowFractions(length: number): number[] {
    const dense = Math.min(length, .5);
    const denseRows = length > .5 ? 18 : sheetRows;
    const fractions: number[] = [];
    for (let i = 0; i <= sheetRows; i++) {
        const distance = i <= denseRows ? dense * i / denseRows
            : dense + (length - dense) * (i - denseRows) / (sheetRows - denseRows);
        fractions.push(length > 0 ? distance / length : i / sheetRows);
    }
    return fractions;
}

function hash(n: number) {
    let x = (Math.imul(n | 0, 374761393) + 668265263) | 0;
    x = Math.imul(x ^ (x >>> 13), 1274126177);
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
}

/**
 * The hand that tears the sheet. It pinches the stock a short way below the
 * tooth line, swings it toward the viewer so the paper bends over the teeth,
 * then drags it sideways and down. Nothing here knows when fibers break: the
 * cut is whatever the loaded sheet does under this motion.
 */
export function handMotion(time: number, radius = .42) {
    const hand = tuning.hand;
    const preload = smoothstep(0, hand.preloadEnd, time);
    const rip = smoothstep(hand.ripStart, hand.ripEnd, time);
    // The carry starts from rest: a profile with an initial slope would step
    // the pinch's velocity the instant the rip ends, and the detached sheet,
    // held only there, would pivot about the pinch and whip its tail.
    const c = Math.max(0, Math.min(1, (time - hand.carryStart) / (paperTearDuration - hand.carryStart)));
    const carry = c * c * (3 - 2 * c);
    const angle = hand.swing * preload, arc = radius * hand.swingRadius;
    return {
        x: hand.rip[0] * rip + hand.carry[0] * carry,
        y: radius - arc * Math.cos(angle) + hand.rip[1] * rip + hand.carry[1] * carry,
        z: arc * Math.sin(angle) + hand.rip[2] * rip + hand.carry[2] * carry,
        twist: hand.twist * rip + .08 * carry,
        turn: hand.turn * carry,
        preload, rip, carry,
    };
}

export class TornSheet {
    readonly columns = sheetColumns;
    readonly rows = sheetRows;
    readonly fractions: number[];
    readonly pos: Float64Array;
    readonly load: Float64Array;
    readonly baseline: Float64Array;
    readonly strength: Float64Array;
    readonly broken: Uint8Array;
    time = 0;
    brokenCount = 0;
    detachedAt = -1;
    gripForce = 0;
    private pending = 0;
    private readonly prev: Float64Array;
    private readonly invMass: Float64Array;
    private readonly reaction: Float64Array;
    private readonly structuralStart: number;
    private readonly bA: Int32Array;
    private readonly bM: Int32Array;
    private readonly bB: Int32Array;
    private readonly bAlpha: Float64Array;
    private readonly bBeta: Float64Array;
    private readonly bRest: Float64Array;
    private readonly bSpan: Float64Array;
    private readonly bStiff: Float64Array;
    readonly creased: Uint8Array;
    private readonly cA: Int32Array;
    private readonly cB: Int32Array;
    private readonly rest: Float64Array;
    private readonly stiff: Float64Array;
    private readonly grip: Int32Array;
    private readonly gripRel: Float64Array;
    private readonly gripOrigin: [number, number, number];
    private readonly gripDistance: number;
    private readonly pinRest: Float64Array;
    private readonly gripAttach: Int32Array;
    private readonly gripRest: Float64Array;
    private readonly toothInvMass: number;

    constructor(readonly length: number, readonly width: number, extension: number) {
        const columns = this.columns + 1, rows = this.rows + 1, count = columns * rows;
        this.fractions = rowFractions(length);
        this.pos = new Float64Array(count * 3);
        this.prev = new Float64Array(count * 3);
        this.invMass = new Float64Array(count).fill(1);
        // A particle carries the strip of stock between its neighbouring rows.
        // Rows crowd toward the tooth line, so equal masses would leave the
        // tail of long stock many times too light, and it would flutter about
        // the pinch instead of swinging with it. Evenly spaced rows, which is
        // what short stock gets, come out at 1 as before.
        const strip = (i: number) => (this.fractions[Math.min(rows - 1, i + 1)] - this.fractions[Math.max(0, i - 1)]) /
            (i > 0 && i < rows - 1 ? 2 : 1);
        for (let i = 0; i < rows; i++) {
            const inverse = 1 / (this.rows * Math.max(1e-6, strip(i)));
            for (let j = 0; j < columns; j++) this.invMass[i * columns + j] = inverse;
        }
        this.toothInvMass = 1 / (this.rows * Math.max(1e-6, strip(0)));
        this.reaction = new Float64Array(count * 3);
        this.load = new Float64Array(columns);
        this.baseline = new Float64Array(columns);
        this.strength = new Float64Array(columns);
        this.broken = new Uint8Array(columns);
        const pose = { ...receiptFeedMotion(0), extension };
        for (let i = 0; i < rows; i++) for (let j = 0; j < columns; j++) {
            const vertex = receiptVertex(j / this.columns, this.fractions[i], pose, width, length);
            const index = (i * columns + j) * 3;
            this.pos[index] = vertex.x; this.pos[index + 1] = vertex.y; this.pos[index + 2] = vertex.z;
        }
        this.prev.set(this.pos);
        // Fibers hold the tooth line. Uneven bundles make the crack hesitate.
        for (let j = 0; j < columns; j++) {
            this.invMass[j] = 0;
            this.strength[j] = tuning.fiberStrength * (.7 + .45 * hash((j >> 2) * 7 + 3) + .25 * hash(j * 13 + 1));
        }
        // The pinch is a rounded pad a short way below the teeth on the right
        // side. Sharp pad corners would concentrate load in the paper there.
        const gripDistance = Math.min(.42, .55 * length);
        this.gripDistance = gripDistance;
        const grip: number[] = [];
        let nearest = 1;
        for (let i = 1; i < rows; i++) {
            if (Math.abs(this.fractions[i] * length - gripDistance) < Math.abs(this.fractions[nearest] * length - gripDistance)) nearest = i;
            const along = (this.fractions[i] * length - gripDistance) / .045;
            for (let j = 0; j < columns; j++) {
                const across = (j / this.columns - .93) / .09;
                if (across * across + along * along <= 1) grip.push(i * columns + j);
            }
        }
        if (!grip.length) for (let j = 0; j < columns; j++) if (j / this.columns >= .86) grip.push(nearest * columns + j);
        this.grip = Int32Array.from(grip);
        this.gripRel = new Float64Array(grip.length * 3);
        const origin: [number, number, number] = [0, 0, 0];
        for (const index of grip) { origin[0] += this.pos[index * 3]; origin[1] += this.pos[index * 3 + 1]; origin[2] += this.pos[index * 3 + 2]; }
        this.gripOrigin = [origin[0] / grip.length, origin[1] / grip.length, origin[2] / grip.length];
        grip.forEach((index, n) => {
            this.invMass[index] = 0;
            this.gripRel[n * 3] = this.pos[index * 3] - this.gripOrigin[0];
            this.gripRel[n * 3 + 1] = this.pos[index * 3 + 1] - this.gripOrigin[1];
            this.gripRel[n * 3 + 2] = this.pos[index * 3 + 2] - this.gripOrigin[2];
        });
        // Long-range attachments bound each particle by its material distance to
        // the fiber above it and, once detached, to the pinch, so a single pass
        // never lets the stock stretch: paper is inextensible, only fibers give.
        this.pinRest = new Float64Array(count);
        this.gripAttach = new Int32Array(count);
        this.gripRest = new Float64Array(count);
        for (let i = 0; i < rows; i++) for (let j = 0; j < columns; j++) {
            const p = i * columns + j;
            this.pinRest[p] = this.fractions[i] * length;
            let best = 0, bestDistance = Infinity;
            for (const g of grip) {
                const gi = Math.floor(g / columns), gj = g % columns;
                const across = (j - gj) * width / this.columns, along = (this.fractions[i] - this.fractions[gi]) * length;
                const materialDistance = Math.hypot(across, along);
                if (materialDistance < bestDistance) { bestDistance = materialDistance; best = g; }
            }
            this.gripAttach[p] = best;
            this.gripRest[p] = bestDistance;
        }
        // Constraint order matters for a single pass. Shear goes first; then
        // in-plane structure sweeps outward from the pinch: down
        // the hanging stock, up to the tooth line, and leftward along each row,
        // so one pass carries the hand's motion through the whole sheet and the
        // fibers, measured last, only feel what the sheet cannot accommodate.
        const a: number[] = [], b: number[] = [], stiff: number[] = [];
        const add = (p: number, q: number, k: number) => { a.push(p); b.push(q); stiff.push(k); };
        const bA: number[] = [], bM: number[] = [], bB: number[] = [], bStiff: number[] = [];
        const bend = (first: number, middle: number, last: number, k: number) => { bA.push(first); bM.push(middle); bB.push(last); bStiff.push(k); };
        for (let i = rows - 1; i >= 0; i--) for (let j = columns - 1; j >= 0; j--) {
            const p = i * columns + j;
            if (j >= 1 && j + 1 < columns) bend(p - 1, p, p + 1, tuning.stiffness.bend);
            if (i >= 1 && i + 1 < rows) bend(p - columns, p, p + columns, tuning.stiffness.bend);
            if (j >= 2 && j + 2 < columns) bend(p - 2, p, p + 2, tuning.stiffness.coarseBend);
            if (i >= 2 && i + 2 < rows) bend(p - 2 * columns, p, p + 2 * columns, tuning.stiffness.coarseBend);
            if (j >= 4 && j + 4 < columns) bend(p - 4, p, p + 4, tuning.stiffness.broadBend);
            if (i >= 4 && i + 4 < rows) bend(p - 4 * columns, p, p + 4 * columns, tuning.stiffness.broadBend);
            // Across the web the sheet is only 64 cells wide, and a bow over half of
            // it is invisible to stencils four cells wide: the free bottom edge
            // then flaps after the rip's sideways drag and snaps back in a frame.
            // Two wider stencils give the plate its width-scale stiffness; along
            // the web the rows already reach far because they crowd at the teeth.
            if (j >= 8 && j + 8 < columns) bend(p - 8, p, p + 8, tuning.stiffness.broadBend);
            if (j >= 16 && j + 16 < columns) bend(p - 16, p, p + 16, tuning.stiffness.broadBend);
        }
        this.bA = Int32Array.from(bA); this.bM = Int32Array.from(bM); this.bB = Int32Array.from(bB); this.bStiff = Float64Array.from(bStiff);
        this.bAlpha = new Float64Array(bA.length); this.bBeta = new Float64Array(bA.length);
        this.bRest = new Float64Array(bA.length); this.bSpan = new Float64Array(bA.length);
        this.creased = new Uint8Array(bA.length);
        for (let c = 0; c < bA.length; c++) {
            // Straight stock is the rest state even where row spacing changes,
            // so the middle particle rests on the chord at its own spacing ratio.
            const p = bA[c] * 3, m = bM[c] * 3, q = bB[c] * 3;
            const h1 = Math.hypot(this.pos[m] - this.pos[p], this.pos[m + 1] - this.pos[p + 1], this.pos[m + 2] - this.pos[p + 2]);
            const h2 = Math.hypot(this.pos[q] - this.pos[m], this.pos[q + 1] - this.pos[m + 1], this.pos[q + 2] - this.pos[m + 2]);
            this.bAlpha[c] = h2 / (h1 + h2); this.bBeta[c] = h1 / (h1 + h2); this.bSpan[c] = h1 + h2;
            const tx = this.pos[p] * this.bAlpha[c] + this.pos[q] * this.bBeta[c], ty = this.pos[p + 1] * this.bAlpha[c] + this.pos[q + 1] * this.bBeta[c], tz = this.pos[p + 2] * this.bAlpha[c] + this.pos[q + 2] * this.bBeta[c];
            // The thermal curl of the free end is remembered, not flattened.
            this.bRest[c] = Math.hypot(this.pos[m] - tx, this.pos[m + 1] - ty, this.pos[m + 2] - tz);
        }
        for (let i = rows - 2; i >= 0; i--) for (let j = columns - 1; j >= 0; j--) {
            const p = i * columns + j;
            if (j + 1 < columns) add(p, p + columns + 1, tuning.stiffness.shear);
            if (j > 0) add(p, p + columns - 1, tuning.stiffness.shear);
        }
        const gripTop = Math.floor(grip[0] / columns), gripBottom = Math.floor(grip[grip.length - 1] / columns);
        for (let i = gripBottom; i < rows - 1; i++) for (let j = columns - 1; j >= 0; j--) add(i * columns + j, (i + 1) * columns + j, tuning.stiffness.structural);
        for (let i = gripTop - 1; i >= 0; i--) for (let j = columns - 1; j >= 0; j--) add(i * columns + j, (i + 1) * columns + j, tuning.stiffness.structural);
        for (let i = rows - 1; i >= 0; i--) for (let j = columns - 2; j >= 0; j--) add(i * columns + j, i * columns + j + 1, tuning.stiffness.structural);
        this.structuralStart = a.length - (rows - 1) * columns - rows * (columns - 1);
        this.cA = Int32Array.from(a); this.cB = Int32Array.from(b); this.stiff = Float64Array.from(stiff);
        this.rest = new Float64Array(a.length);
        for (let c = 0; c < a.length; c++) {
            const p = a[c] * 3, q = b[c] * 3;
            this.rest[c] = Math.hypot(this.pos[p] - this.pos[q], this.pos[p + 1] - this.pos[q + 1], this.pos[p + 2] - this.pos[q + 2]);
        }
        // Let the hanging stock settle under its own weight before the hand
        // moves. Fibers are rated above that standing load, so only the pull
        // of the hand counts toward failure, whatever the sheet's length.
        for (let n = 0; n < 8; n++) this.step(true);
        this.baseline.set(this.load);
    }

    get tear() { return this.brokenCount / (this.columns + 1); }
    get detached() { return this.detachedAt >= 0; }

    advance(milliseconds: number) {
        this.pending += Math.max(0, milliseconds);
        let steps = Math.min(480, Math.floor(this.pending / substep));
        this.pending -= steps * substep;
        while (steps-- > 0) this.step();
    }

    sample(j: number, i: number): SheetSample {
        const index = (i * (this.columns + 1) + j) * 3;
        return {
            x: this.pos[index], y: this.pos[index + 1], z: this.pos[index + 2],
            u: j / this.columns,
            v: (this.length - this.fractions[i] * this.length) / paperTextureLength,
        };
    }

    private step(settling = false) {
        const dt = substep / 1000;
        const pos = this.pos, prev = this.prev, invMass = this.invMass, reaction = this.reaction;
        const columns = this.columns + 1;
        // Kinematic pinch: the hand's rigid motion carries the held patch.
        const hand = handMotion(this.time, this.gripDistance);
        const cz = Math.cos(hand.twist), sz = Math.sin(hand.twist), cy = Math.cos(hand.turn), sy = Math.sin(hand.turn);
        const ox = this.gripOrigin[0] + hand.x, oy = this.gripOrigin[1] + hand.y, oz = this.gripOrigin[2] + hand.z;
        for (let n = 0; n < this.grip.length; n++) {
            const rx = this.gripRel[n * 3], ry = this.gripRel[n * 3 + 1], rz = this.gripRel[n * 3 + 2];
            const tx = rx * cz - ry * sz, ty = rx * sz + ry * cz;
            const index = this.grip[n] * 3;
            pos[index] = ox + tx * cy + rz * sy;
            pos[index + 1] = oy + ty;
            pos[index + 2] = oz - tx * sy + rz * cy;
        }
        const damping = Math.max(0, 1 - tuning.airDamping * dt);
        const fall = tuning.gravity * dt * dt;
        for (let p = 0; p < invMass.length; p++) {
            const index = p * 3;
            if (invMass[p] === 0) { prev[index] = pos[index]; prev[index + 1] = pos[index + 1]; prev[index + 2] = pos[index + 2]; continue; }
            const vx = (pos[index] - prev[index]) * damping, vy = (pos[index + 1] - prev[index + 1]) * damping, vz = (pos[index + 2] - prev[index + 2]) * damping;
            prev[index] = pos[index]; prev[index + 1] = pos[index + 1]; prev[index + 2] = pos[index + 2];
            pos[index] += vx; pos[index + 1] += vy - fall; pos[index + 2] += vz;
        }
        reaction.fill(0);
        this.project(0);
        // Extra in-plane sweeps keep the stock inextensible near the pinch
        // when the last fibers part and the sheet swings free.
        for (let n = 1; n < tuning.structuralPasses; n++) this.project(this.structuralStart);
        // Bending is projected after them, not before: three in-plane sweeps
        // undo most of a bending correction that precedes them, which leaves
        // the plate softer than its stiffness says and lets the free corners
        // wobble like jelly instead of swinging as one stiff sheet.
        this.flatten();
        let gripForce = 0;
        for (let p = 0; p < invMass.length; p++) {
            if (invMass[p] === 0) continue;
            const index = p * 3, j = p % columns;
            if (p >= columns && !this.broken[j]) {
                const a = j * 3;
                const dx = pos[index] - pos[a], dy = pos[index + 1] - pos[a + 1], dz = pos[index + 2] - pos[a + 2];
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (distance > this.pinRest[p]) {
                    const f = (distance - this.pinRest[p]) / distance;
                    pos[index] -= f * dx; pos[index + 1] -= f * dy; pos[index + 2] -= f * dz;
                    reaction[a] += f * dx; reaction[a + 1] += f * dy; reaction[a + 2] += f * dz;
                }
            }
            // Bounding the stock to the pinch as well would drag the far side
            // diagonally before a single pass has rotated it, loading fibers
            // that a stiff sheet would not. It only keeps the detached sheet
            // inextensible while the hand carries it away.
            if (this.detachedAt < 0) continue;
            const g = this.gripAttach[p] * 3;
            const dx = pos[index] - pos[g], dy = pos[index + 1] - pos[g + 1], dz = pos[index + 2] - pos[g + 2];
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (distance > this.gripRest[p]) {
                const f = tuning.tether * (distance - this.gripRest[p]) / distance;
                pos[index] -= f * dx; pos[index + 1] -= f * dy; pos[index + 2] -= f * dz;
                gripForce += distance - this.gripRest[p];
            }
        }
        // The console face is behind the sheet.
        for (let p = 0; p < invMass.length; p++) if (invMass[p] > 0 && pos[p * 3 + 2] < 0) pos[p * 3 + 2] = 0;
        for (let n = 0; n < this.grip.length; n++) {
            const index = this.grip[n] * 3;
            gripForce += Math.hypot(reaction[index], reaction[index + 1], reaction[index + 2]);
        }
        this.gripForce = gripForce;
        // Fibers fail where the in-plane pull across the teeth exceeds their
        // strength: shear along the tooth line counts fully, tension along the
        // stock partly, and pressure normal to the sheet (bending it over the
        // teeth) not at all, since that never cuts paper.
        for (let j = 0; j < columns; j++) {
            if (this.broken[j]) continue;
            const index = j * 3, below = (columns + j) * 3;
            let cx = pos[below] - pos[index], cy = pos[below + 1] - pos[index + 1], cz = pos[below + 2] - pos[index + 2];
            const span = Math.hypot(cx, cy, cz) || 1;
            cx /= span; cy /= span; cz /= span;
            const tension = Math.max(0, reaction[index] * cx + reaction[index + 1] * cy + reaction[index + 2] * cz);
            const raw = Math.hypot(reaction[index], tuning.feedTensionWeight * tension);
            this.load[j] += (raw - this.load[j]) * tuning.loadResponse;
            if (settling) continue;
            if (this.load[j] - this.baseline[j] > this.strength[j] || this.time >= paperCutDuration - 10) this.snap(j);
        }
        if (!settling) this.time += substep;
    }

    /** Three-point bending: each particle is pulled toward the chord through its neighbours. */
    private flatten() {
        const pos = this.pos, invMass = this.invMass;
        const bA = this.bA, bM = this.bM, bB = this.bB, alpha = this.bAlpha, beta = this.bBeta, rest = this.bRest, span = this.bSpan;
        const creaseStiffness = tuning.crease.stiffness, creaseFloor = tuning.crease.floor;
        const plasticCreep = Math.min(1, tuning.plastic.rate * substep / 1000);
        // Sagitta of an arc of the given radius over the stencil's own chord.
        const sagitta = (radius: number, chord: number) => chord * chord / (8 * radius);
        for (let c = 0; c < bA.length; c++) {
            const a = bA[c], m = bM[c], b = bB[c];
            const wa = invMass[a], wm = invMass[m], wb = invMass[b];
            const al = alpha[c], be = beta[c];
            const w = wm + wa * al * al + wb * be * be;
            if (w === 0) continue;
            const p = a * 3, q = m * 3, r = b * 3;
            const dx = pos[q] - (pos[p] * al + pos[r] * be), dy = pos[q + 1] - (pos[p + 1] * al + pos[r + 1] * be), dz = pos[q + 2] - (pos[p + 2] * al + pos[r + 2] * be);
            const deflection = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (deflection < 1e-9) continue;
            // Paper folded hard creases: the stencil keeps its bend and stays limp.
            // Milder bends creep toward the current bend, but only by however
            // far they exceed the yield band around the set already taken. A
            // set that simply chased the bend would leave no restoring force at
            // all, and the sheet would hang and drape like cloth.
            if (!this.creased[c]) {
                if (deflection > Math.max(sagitta(tuning.crease.radius, span[c]), creaseFloor * span[c])) {
                    this.creased[c] = 1; rest[c] = deflection;
                } else {
                    const excess = deflection - rest[c] - sagitta(tuning.plastic.radius, span[c]);
                    if (excess > 0) rest[c] += excess * plasticCreep;
                }
            }
            const k = this.creased[c] ? creaseStiffness : this.bStiff[c];
            const s = k * (deflection - rest[c]) / (w * deflection);
            // Folding over the teeth loads them in bending only; that never
            // cuts paper, so it is not counted toward fiber failure.
            if (wm > 0) { pos[q] -= wm * s * dx; pos[q + 1] -= wm * s * dy; pos[q + 2] -= wm * s * dz; }
            if (wa > 0) { const f = wa * al * s; pos[p] += f * dx; pos[p + 1] += f * dy; pos[p + 2] += f * dz; }
            if (wb > 0) { const f = wb * be * s; pos[r] += f * dx; pos[r + 1] += f * dy; pos[r + 2] += f * dz; }
        }
    }

    private project(from: number) {
        const pos = this.pos, invMass = this.invMass, reaction = this.reaction;
        const cA = this.cA, cB = this.cB, rest = this.rest, stiff = this.stiff;
        for (let c = from; c < cA.length; c++) {
            const a = cA[c], b = cB[c], wa = invMass[a], wb = invMass[b], w = wa + wb;
            if (w === 0) continue;
            const p = a * 3, q = b * 3;
            const dx = pos[p] - pos[q], dy = pos[p + 1] - pos[q + 1], dz = pos[p + 2] - pos[q + 2];
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (distance < 1e-9) continue;
            const s = stiff[c] * (distance - rest[c]) / distance;
            if (wa > 0) { const f = s * wa / w; pos[p] -= f * dx; pos[p + 1] -= f * dy; pos[p + 2] -= f * dz; }
            else { reaction[p] -= s * dx; reaction[p + 1] -= s * dy; reaction[p + 2] -= s * dz; }
            if (wb > 0) { const f = s * wb / w; pos[q] += f * dx; pos[q + 1] += f * dy; pos[q + 2] += f * dz; }
            else { reaction[q] += s * dx; reaction[q + 1] += s * dy; reaction[q + 2] += s * dz; }
        }
    }

    private snap(j: number) {
        this.broken[j] = 1;
        this.invMass[j] = this.toothInvMass;
        this.brokenCount++;
        if (this.brokenCount === this.columns + 1) this.detachedAt = this.time;
    }
}

/**
 * Frame for a development still from the `paper-frame` URL parameter: absent
 * means no still; present without a usable number means the torn sheet in
 * flight, which is the frame worth checking most often.
 */
export const defaultPaperStillFrame = .6;
export function paperStillFrame(value: string | null, fallback = defaultPaperStillFrame) {
    if (value === null) return null;
    const frame = value.trim() === '' ? NaN : Number(value);
    return Number.isFinite(frame) ? Math.max(0, Math.min(1, frame)) : fallback;
}

type ReceiptPhase = 'idle' | 'feeding' | 'reading' | 'tearing' | 'refilling';

/** One physical sheet stays attached for the entire reading session. */
export class ReceiptTransport {
    phase: ReceiptPhase = 'idle';
    pose: ReceiptMotion = receiptFeedMotion(0);
    opacity = 1;
    extendedLength = paperLengthForRecords(0);
    leaderProgress = 1;
    feedTravel = 0;
    width = 2.24;
    sheet?: TornSheet;
    frozen = false;
    readonly columns = sheetColumns;
    readonly rows = sheetRows;
    private desiredOpen = false;
    private desiredRecords = 0;
    private elapsed = 0;
    private fromExtension = 0;
    private fractionCache: { length: number; fractions: number[] } = { length: -1, fractions: [] };

    get active() { return this.phase !== 'idle' && this.phase !== 'reading'; }
    get length() { return paperPose(1, this.pose.extension, this.extendedLength).length * this.leaderProgress; }

    sync(open: boolean, records = this.desiredRecords) {
        // A development still holds until the paper is actually pulled; then
        // the frozen mechanics simply resume, so the console stays interactive.
        if (this.frozen) {
            if (!open) return;
            this.frozen = false;
        }
        this.desiredOpen = open;
        this.desiredRecords = records;
        if (open && this.phase === 'idle') this.start('feeding');
        else if (!open && (this.phase === 'feeding' || this.phase === 'reading')) this.start('tearing');
        // Reopening during disposal waits for a fresh leader instead of
        // reattaching a torn sheet or showing the previous reader again.
    }

    private start(phase: ReceiptPhase) {
        // New rounds affect the next sheet. Never resize stock being read or torn.
        if (phase === 'feeding' && this.phase === 'idle') this.extendedLength = paperLengthForRecords(this.desiredRecords);
        this.phase = phase;
        this.elapsed = 0;
        this.fromExtension = this.pose.extension;
        this.sheet = phase === 'tearing' ? new TornSheet(this.length, this.width, this.fromExtension) : undefined;
    }

    advance(milliseconds: number, reduced = false): boolean {
        if (!this.active || this.frozen) return false;
        const previousLength = this.length;
        this.elapsed += Math.max(0, milliseconds);
        const duration = this.phase === 'feeding' ? paperFeedDuration * (1 - this.fromExtension) :
            this.phase === 'tearing' ? paperTearDuration : paperRefillDuration;
        const t = reduced || duration === 0 ? 1 : Math.min(1, this.elapsed / duration);
        if (this.phase === 'feeding') {
            this.pose = { ...receiptFeedMotion(0), extension: this.fromExtension + (1 - this.fromExtension) * smoothstep(0, 1, t) };
            this.feedTravel += this.length - previousLength;
            this.opacity = 1;
            if (t === 1) {
                this.phase = 'reading';
                return true;
            }
        } else if (this.phase === 'tearing') {
            // The reader is already entering while feeding. Closing it early
            // tears the current length instead of jumping to a fully fed sheet.
            const sheet = this.sheet;
            if (sheet && !reduced) {
                sheet.advance(milliseconds);
                const hand = handMotion(sheet.time);
                this.pose = { extension: this.fromExtension, corner: hand.preload, fold: hand.rip, tear: sheet.tear,
                    release: sheet.detached ? Math.min(1, (sheet.time - sheet.detachedAt) / 300) : 0 };
            }
            // Let the detached sheet visibly travel out before it starts fading.
            const cutEnd = paperCutDuration / paperTearDuration;
            const disposal = Math.max(0, (t - cutEnd) / (1 - cutEnd));
            this.opacity = 1 - smoothstep(.2, 1, disposal);
            if (t === 1) {
                this.pose = receiptFeedMotion(0);
                this.leaderProgress = 0;
                this.start('refilling');
            }
        } else {
            // Reveal an opaque leading edge at the nip, then feed actual stock.
            // Changing opacity on a full-size leader makes it pop into place.
            this.leaderProgress = smoothstep(0, 1, t);
            this.opacity = 1;
            this.feedTravel += this.length - previousLength;
            if (t === 1) {
                this.phase = 'idle';
                if (this.desiredOpen) this.start('feeding');
            }
        }
        // Reduced motion also completes disposal/refill in this frame.
        return reduced && this.active ? this.advance(0, true) : false;
    }

    /**
     * Run a throwaway sheet once so the solver is compiled before the first
     * real tear, which otherwise pays for it in the frame the reader closes.
     */
    warmUp() {
        new TornSheet(paperLengthForRecords(0), this.width, 1).advance(40);
    }

    /** Material fraction along the stock for mesh row `i`. */
    rowFraction(i: number) {
        if (this.phase === 'tearing' && this.sheet) return this.sheet.fractions[i];
        const length = this.length;
        if (this.fractionCache.length !== length) this.fractionCache = { length, fractions: rowFractions(length) };
        return this.fractionCache.fractions[i];
    }

    /** Position and print coordinates for mesh column `j`, row `i`. */
    sample(j: number, i: number): SheetSample {
        if (this.phase === 'tearing' && this.sheet) return this.sheet.sample(j, i);
        return receiptVertex(j / this.columns, this.rowFraction(i), this.pose, this.width, this.length);
    }

    /** Deterministic development still: run the real mechanics to a frame, then hold until pulled. */
    still(phase: 'feed' | 'tear' | 'refill', frame: number, records: number) {
        this.frozen = false;
        this.phase = 'idle'; this.pose = receiptFeedMotion(0); this.leaderProgress = 1; this.opacity = 1;
        const progress = Math.max(0, Math.min(1, frame));
        this.sync(true, records);
        if (phase === 'feed') this.advance(paperFeedDuration * progress);
        else {
            this.advance(paperFeedDuration);
            this.sync(false);
            if (phase === 'tear') this.advance(paperTearDuration * Math.min(progress, .999));
            else { this.advance(paperTearDuration); this.advance(paperRefillDuration * progress); }
        }
        this.frozen = true;
    }
}
