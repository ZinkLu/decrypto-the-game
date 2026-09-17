export function waveSample(mode: number, phase: number, channel = 0) {
    switch (mode) {
        case 1: return Math.sin(phase);
        case 2: return Math.sin(phase * (channel ? 1.013 : 1) + channel * 1.35) * (channel ? .68 : .82);
        case 3: return Math.tanh(Math.sin(phase) * 8);
        case 4: return 2 / Math.PI * Math.asin(Math.sin(phase));
        case 5: return Math.sin(phase) > .72 ? .92 : -.42;
        case 6: return Math.sin(phase * (1 + Math.abs(phase) * .012));
        case 7: {
            // Receiver-bandwidth noise: interpolate fixed samples instead of
            // changing at every pixel, which aliases into a solid bright band.
            const random = (index: number) => {
                const value = Math.sin(index * 127.1 + channel * 31.17) * 43758.5453;
                return (value - Math.floor(value)) * 2 - 1;
            };
            const noise = (position: number) => {
                const index = Math.floor(position), t = position - index;
                const smooth = t * t * (3 - 2 * t);
                return random(index) * (1 - smooth) + random(index + 1) * smooth;
            };
            return noise(phase * .70) * .63 + noise(phase * 1.83 + 17) * .22 + noise(phase * 4.71 + 37) * .09;
        }
        default: return Math.sin(phase) * (.55 + .45 * Math.sin(phase * .23));
    }
}

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
