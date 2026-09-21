export const paperFeedDuration = 420;
export const paperCutDuration = 280;
export const paperDiscardDuration = 520;
export const paperTearDuration = paperCutDuration + paperDiscardDuration;
export const paperRefillDuration = 520;
export const paperRestLength = .36;
export const paperExtendedLength = .98 + .38 * 16;
// The roll continues above the current sheet's header with the start of the
// next sheet, so the stub over the platen shows print that will emerge next.
export const paperHeadReserve = .7;
export const paperTextureLength = paperExtendedLength + paperHeadReserve;
// Keep the original print density as the roll grows over the instruments.
export const paperTextureHeight = Math.round(paperTextureLength * 400 / 1.18);
export function paperLengthForRecords(records: number) {
    const count = Number.isFinite(records) ? Math.max(0, Math.min(16, Math.floor(records))) : 0;
    return .98 + .38 * count;
}

export function paperAtLength(fraction: number, length: number) {
    const distance = Math.max(0, Math.min(1, fraction)) * length;
    const tail = Math.min(.18, length * .45);
    const curl = Math.max(0, (distance - (length - tail)) / Math.max(.0001, tail));
    return { length, y: -distance, z: .035 * Math.min(1, length / .18) * curl * curl };
}

export function paperPose(fraction: number, extension: number, extendedLength = paperExtendedLength) {
    const length = paperRestLength + (extendedLength - paperRestLength) * Math.max(0, Math.min(1, extension));
    return paperAtLength(fraction, length);
}

export function smoothstep(from: number, to: number, value: number) {
    const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
    return t * t * (3 - 2 * t);
}

// Travel is along the drive's depth axis, perpendicular to the front fascia.
// The flat 1.32-unit disk has a trailing edge at z=1.79 in the modeled rest pose.
// Stop the first push at the face (z=1.02), then seat the edge inside at z=.86.
export const diskSeatTravel = -.93;
export const diskEjectedTravel = .38;
export const diskTailTravel = -.77;

export function diskInsertPose(elapsed: number, from: number) {
    // A hand aligns the disk, pushes along the guides, then overcomes the latch.
    // At no point does an insertion pull the disk back out to "gather force".
    const tail = Math.min(from, diskTailTravel);
    const slideMs = 620 * Math.max(.15, Math.min(1, (from - tail) / (diskEjectedTravel - diskTailTravel)));
    if (elapsed < slideMs)
        return { phase: 'slide' as const, done: false, button: 0, travel: from + (tail - from) * smoothstep(0, 1, elapsed / slideMs) };
    elapsed -= slideMs;
    // Reposition the fingertip into the central scallop after the disk is flush.
    if (elapsed < 160) return { phase: 'grip' as const, done: false, button: 0, travel: tail };
    elapsed -= 160;
    const latch = Math.min(tail, diskSeatTravel + .055);
    if (elapsed < 190)
        return { phase: 'resistance' as const, done: false, button: 0, travel: tail + (latch - tail) * smoothstep(0, 1, elapsed / 190) };
    elapsed -= 190;
    if (elapsed < 130)
        return { phase: 'latch' as const, done: false, button: 0, travel: latch + (diskSeatTravel - .012 - latch) * smoothstep(0, 1, elapsed / 130) };
    elapsed -= 130;
    if (elapsed < 95)
        return { phase: 'seat' as const, done: false, button: 0, travel: diskSeatTravel - .012 + .012 * smoothstep(0, 1, elapsed / 95) };
    return { phase: 'seat' as const, done: true, button: 0, travel: diskSeatTravel };
}

export function diskEjectPose(elapsed: number, from: number) {
    // The eject cap must be depressed before the latch releases. The spring
    // delivers only enough travel to grip the disk, leaving it in the guides.
    if (elapsed < 170)
        return { phase: 'press' as const, done: false, button: smoothstep(0, 1, elapsed / 170), travel: from };
    elapsed -= 170;
    if (elapsed < 80)
        return { phase: 'release' as const, done: false, button: 1, travel: from };
    elapsed -= 80;
    if (elapsed < 370) {
        const t = elapsed / 370;
        // Critically damped spring: fast release, a soft supported stop, no bounce.
        const spring = (1 - (1 + 7 * t) * Math.exp(-7 * t)) / (1 - 8 * Math.exp(-7));
        return { phase: 'pop' as const, done: false, button: 1 - smoothstep(0, .6, t), travel: from + (diskEjectedTravel - from) * spring };
    }
    return { phase: 'settle' as const, done: true, button: 0, travel: diskEjectedTravel };
}

/**
 * Feed-side motion channels. `extension` drives the fed length; the other
 * channels report the tearing simulation (grip progress, broken fraction of
 * the tooth line, and unloading after the last attachment parts).
 */
export function receiptFeedMotion(progress: number) {
    return { extension: smoothstep(0, 1, progress), corner: 0, tear: 0, fold: 0, release: 0 };
}

export type ReceiptMotion = ReturnType<typeof receiptFeedMotion>;

export const paperSeam = .026;

// Both sides of the cut share this contour while they are still joined.
export function paperTooth(across: number) {
    return .008 * (1 - Math.abs((across * 32 % 1) * 2 - 1));
}

// Attached stock hangs straight from the nip with its thermal curl at the
// free end. Tearing deforms the sheet in the physical simulation instead.
export function receiptVertex(across: number, fraction: number, pose: ReceiptMotion, width = 2.24,
    length = paperPose(1, pose.extension).length) {
    const { y: hang, z: restingCurl } = paperAtLength(fraction, length);
    const distance = fraction * length;
    // The tear contour follows the curled tangent at the free edge.
    const tooth = paperTooth(across) * Math.min(1, length / .03);
    const edge = fraction < .0001 ? tooth : fraction > .9999 ? tooth : 0;
    const tail = Math.min(.18, length * .45);
    const curl = Math.max(0, (distance - (length - tail)) / Math.max(.0001, tail));
    const slope = .07 * Math.min(1, length / .18) * curl / Math.max(.0001, tail);
    const theta = Math.atan(slope);
    return {
        x: -width / 2 + across * width,
        y: hang - paperSeam - edge * Math.cos(theta),
        z: restingCurl + edge * Math.sin(theta),
        u: across,
        // Ink moves with the stock: the same distance from the free end
        // always samples the same texel, including while a fresh tip emerges.
        v: (length - distance) / paperTextureLength,
    };
}

/**
 * The stub between the platen roller and the tear line, in the feed frame
 * (y up, z toward the viewer, the tear line at z = 0). Paper leaves the
 * printer opening behind the roller, comes over the top of the platen and
 * down its front, then drops behind the tear bar to the teeth, so the sheet
 * visibly comes out of the roller. (A nip under the roller would be hidden
 * behind the tear bar from the console's viewpoint.)
 */
export function receiptHeadPath(roller: { y: number; z: number; radius: number }, openingBackZ: number, tearY = -paperSeam) {
    const distance = Math.hypot(tearY - roller.y, -roller.z);
    const toTearLine = Math.atan2(tearY - roller.y, -roller.z);
    const reach = Math.acos(Math.min(1, roller.radius / Math.max(roller.radius, distance)));
    // Angles run from +z (toward the viewer) through +y (up) to -z (behind).
    const leave = toTearLine + reach;
    const enter = leave + Math.PI * .55;
    const arc = (angle: number) => ({ y: roller.y + roller.radius * Math.sin(angle), z: roller.z + roller.radius * Math.cos(angle) });
    const first = arc(enter);
    const points = [{ y: first.y, z: Math.min(first.z - .02, openingBackZ + .01) }];
    for (let n = 0; n <= 12; n++) points.push(arc(enter + (leave - enter) * n / 12));
    const tangent = points[points.length - 1];
    for (let n = 1; n <= 6; n++) points.push({ y: tangent.y + (tearY - tangent.y) * n / 6, z: tangent.z * (1 - n / 6) });
    return points;
}
