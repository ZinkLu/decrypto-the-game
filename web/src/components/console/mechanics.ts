export function waveSample(mode: number, phase: number, channel = 0) {
    switch (mode) {
        case 1: return Math.sin(phase);
        case 2: return Math.sin(phase * (channel ? 1.013 : 1) + channel * 1.35) * (channel ? .68 : .82);
        case 3: return Math.tanh(Math.sin(phase) * 8);
        case 4: return 2 / Math.PI * Math.asin(Math.sin(phase));
        case 5: return Math.sin(phase) > .72 ? .92 : -.42;
        case 6: return Math.sin(phase * (1 + Math.abs(phase) * .012));
        case 7: {
            const noise = Math.sin(phase * 12.9898 + channel * 31.17) * 43758.5453;
            return (noise - Math.floor(noise)) * 1.7 - .85;
        }
        default: return Math.sin(phase) * (.55 + .45 * Math.sin(phase * .23));
    }
}

export interface PaperOrigin { left: number; top: number; width: number; height: number }
export const paperFeedDuration = 480;
export function paperPose(fraction: number, extension: number) {
    const length = .43 + .87 * Math.max(0, Math.min(1, extension));
    const distance = Math.max(0, Math.min(1, fraction)) * length;
    const curl = Math.max(0, (distance - (length - .18)) / .18);
    return { length, y: -distance, z: .035 * curl * curl };
}
