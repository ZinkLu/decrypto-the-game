import type { Blink, Frame, Target } from './paint';
import type { consoleHardware, phaseSignal, roleState, rosterTeams, roundCast, themeColors, LocalState, StationState } from './model';

/**
 * What every surface is painted from: the state, what it means for this seat,
 * and the frames and targets painted so far.
 */
export interface Painter {
    s: StationState;
    u: LocalState;
    h: ReturnType<typeof consoleHardware>;
    r: ReturnType<typeof roleState>;
    t: (message: string, values?: unknown[]) => string;
    colors: ReturnType<typeof themeColors>;
    /** The colour of whoever acts now, or of the result. */
    tint: string;
    signal: ReturnType<typeof phaseSignal>;
    teams: ReturnType<typeof rosterTeams>;
    cast: ReturnType<typeof roundCast>;
    hasGame: boolean;
    diskReadable: boolean;
    ownsDisk: boolean;
    diskCurrent: boolean;
    guidePage: number;
    frames: Record<string, Frame>;
    targets: Target[];
    /** Cells of the main screen that the tube blinks. */
    blink: Blink[];
    frame(name: string, width: number, height: number, background?: string): CanvasRenderingContext2D;
    target(surface: string, id: string, label: string, x: number, y: number, w: number, h: number, options?: Partial<Target>): void;
    /** A button on the main screen. */
    button(c: CanvasRenderingContext2D, id: string, label: string, x: number, y: number, w: number, h?: number, disabled?: boolean, selected?: boolean): void;
}

export const INK = '#2f2b25', CREAM = '#ece0c4', MUTED = '#a59e8c', DARK = '#111e24';
/** Page background of the main CRT; the tube shader clears to it between pages. */
export const screenBackground = DARK;
/** Text that no longer applies, and the rules between rows. */
export const DIM = '#66716e', RULE = '#3b4b4d';
export const FONT = '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif';
export function round(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 10) {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
}
export function text(c: CanvasRenderingContext2D, value: string, x: number, y: number, size = 26, color = CREAM, weight = 400, max?: number) {
    c.fillStyle = color;
    c.font = `${weight} ${size}px ${FONT}`;
    c.textBaseline = 'middle';
    if (max) {
        let shown = value;
        while (shown.length > 1 && c.measureText(shown).width > max)
            shown = shown.slice(0, -2) + '…';
        c.fillText(shown, x, y);
    }
    else
        c.fillText(value, x, y);
}
export function fitLabel(c: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color: string, weight = 400, max = Infinity) {
    c.font = `${weight} ${size}px ${FONT}`;
    const fitted = Math.min(size, size * max / Math.max(1, c.measureText(value).width));
    text(c, value, x, y, fitted, color, weight);
}
/** Readable canvas copy: wrap words first, then reduce only to the stated floor. */
export function textLines(c: CanvasRenderingContext2D, value: string, width: number, size: number, minimum = 22, maxLines = 2, weight = 400) {
    const tokens = value.match(/\n|[^\S\n]+|[\p{Script=Latin}\d][\p{Script=Latin}\d’'.,;:!?/-]*|./gu) || [];
    const atSize = (fontSize: number) => {
        c.font = `${weight} ${fontSize}px ${FONT}`;
        const lines: string[] = [];
        let row = '';
        for (const token of tokens) {
            if (token === '\n') { lines.push(row.trimEnd()); row = ''; continue; }
            if (row && c.measureText(row + token).width > width) { lines.push(row.trimEnd()); row = ''; }
            if (!row && !token.trim()) continue;
            // An unbroken word or URL still has to stay inside the glass.
            for (const character of token) {
                if (row && c.measureText(row + character).width > width) { lines.push(row.trimEnd()); row = ''; }
                row += character;
            }
        }
        if (row) lines.push(row.trimEnd());
        return lines;
    };
    let fitted = Math.max(minimum, size), lines = atSize(fitted);
    while (lines.length > maxLines && fitted > minimum) lines = atSize(--fitted);
    const truncated = lines.length > maxLines;
    if (truncated) {
        lines = lines.slice(0, maxLines);
        const last = Array.from(lines[maxLines - 1]);
        while (last.length && c.measureText(last.join('') + '…').width > width) last.pop();
        lines[maxLines - 1] = last.join('').trimEnd() + '…';
    }
    return { lines, size: fitted, truncated };
}
/** The middle coordinate is stable whether this copy takes one line or two. */
export function readableText(c: CanvasRenderingContext2D, value: string, x: number, middle: number, width: number, size: number, color: string, weight = 400, minimum = 22, maxLines = 2) {
    const layout = textLines(c, value, width, size, minimum, maxLines, weight);
    layout.lines.forEach((value, i) => text(c, value, x, middle + (i - (layout.lines.length - 1) / 2) * layout.size * 1.18, layout.size, color, weight));
    return layout;
}
export function keyword(c: CanvasRenderingContext2D, value: string, x: number, y: number, width: number, color: string) {
    // Both languages start at 60 px. Long phrases wrap at word boundaries;
    // only content that does not fit shrinks, and secret words are never elided.
    const base = 60;
    c.font = `600 ${base}px ${FONT}`;
    if (c.measureText(value).width <= width) {
        text(c, value, x, y, base, color, 600);
        return;
    }
    const tokens = value.trim().split(/\s+/);
    if (tokens.length > 1) {
        let lines = [value], widest = Infinity;
        for (let split = 1; split < tokens.length; split++) {
            const candidate = [tokens.slice(0, split).join(' '), tokens.slice(split).join(' ')];
            const measured = Math.max(...candidate.map(line => c.measureText(line).width));
            if (measured < widest) { widest = measured; lines = candidate; }
        }
        const size = Math.min(48, base * width / widest);
        lines.forEach((line, i) => text(c, line, x, y + (i - .5) * size * 1.08, size, color, 600));
    } else fitLabel(c, value, x, y, base, color, 600, width);
}
export function wrap(c: CanvasRenderingContext2D, value: string, x: number, y: number, width: number, size = 22, color = CREAM, maxLines = 3) {
    c.font = `400 ${size}px ${FONT}`;
    // Keep Latin words intact while allowing Chinese to wrap between characters.
    const tokens = value.match(/\n|[^\S\n]+|[\p{Script=Latin}\d][\p{Script=Latin}\d’'.,;:!?/-]*|./gu) || [];
    let row = '', count = 0;
    for (const token of tokens) {
        if (token === '\n' || row && c.measureText(row + token).width > width) {
            text(c, row.trimEnd(), x, y + count * size * 1.55, size, color);
            if (++count >= maxLines) return;
            row = '';
        }
        if (token !== '\n' && (row || token.trim())) row += token;
    }
    if (row) text(c, row.trimEnd(), x, y + count * size * 1.55, size, color);
}

export function line(c: CanvasRenderingContext2D, x: number, y: number, w: number, color = '#596269') {
    c.strokeStyle = color;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + w, y);
    c.stroke();
}

// Seven separate phosphor bars per cell, including faint unlit segments.
// The numerals are geometry, so their appearance does not depend on a font.
export function segmentDigit(c: CanvasRenderingContext2D, value: string, x: number, y: number, color: string) {
    const bars: Record<string, number[][]> = {
        a: [[11,0],[61,0],[68,7],[61,14],[11,14],[4,7]],
        b: [[65,11],[72,18],[72,53],[65,60],[58,53],[58,18]],
        c: [[65,68],[72,75],[72,110],[65,117],[58,110],[58,75]],
        d: [[11,114],[61,114],[68,121],[61,128],[11,128],[4,121]],
        e: [[7,68],[14,75],[14,110],[7,117],[0,110],[0,75]],
        f: [[7,11],[14,18],[14,53],[7,60],[0,53],[0,18]],
        g: [[11,57],[61,57],[68,64],[61,71],[11,71],[4,64]],
    };
    const digits = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
    const lit = value === '-' ? 'g' : digits[Number(value)] ?? '';
    c.save(); c.translate(x, y); c.scale(1.18, 1);
    for (const [name, points] of Object.entries(bars)) {
        const on = lit.includes(name);
        c.fillStyle = on ? color : '#302a1d';
        c.shadowColor = color; c.shadowBlur = on ? 4 : 0;
        c.beginPath();
        points.forEach(([px, py], index) => index ? c.lineTo(px, py) : c.moveTo(px, py));
        c.closePath(); c.fill();
    }
    c.restore();
}
// Static phosphor falloff; the shared GPU shader draws the raster and halation.
export function crtFinish(c: CanvasRenderingContext2D, width: number, height: number, ruby = false) {
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-atop';
    // The shader owns the raster so it can integrate scan rows at the actual
    // projected pixel size. Baking a second grid here made distant text muddy.
    const vignette = c.createRadialGradient(width * .5, height * .5, width * .10, width * .5, height * .5, width * .68);
    vignette.addColorStop(0, ruby ? 'rgba(4, 0, 0, 0)' : 'rgba(0, 4, 2, 0)');
    vignette.addColorStop(.65, 'rgba(0, 4, 2, .035)');
    vignette.addColorStop(1, 'rgba(0, 4, 2, .50)');
    c.fillStyle = vignette; c.fillRect(0, 0, width, height);
    // Glass reflections belong to the scene lights, never to the raster.
    c.restore();
}

/** Restrained wear belongs to the lip and silk-screen, never a blanket grunge layer. */
export function plateWear(c: CanvasRenderingContext2D, width: number, height: number) {
    c.save();
    c.strokeStyle = '#e3dcc085'; c.lineWidth = .8;
    c.beginPath(); c.moveTo(5, 1.2); c.lineTo(width - 8, 1.2); c.stroke();
    c.strokeStyle = '#2a262066';
    c.beginPath(); c.moveTo(6, height - 1.2); c.lineTo(width - 5, height - 1.2); c.stroke();
    // Regular witness dashes along the lip read as a texture seam, not wear.
    c.restore();
}
export function printWear(c: CanvasRenderingContext2D, width: number, height: number) {
    c.save(); c.globalCompositeOperation = 'destination-out';
    c.fillStyle = '#00000026';
    for (let i = 0; i < 240; i++)
        c.fillRect((i * 73.31) % width, (i * 31.71) % height, .6 + i % 3 * .25, .45);
    c.restore();
}
