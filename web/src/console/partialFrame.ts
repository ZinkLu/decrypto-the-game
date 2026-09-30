/**
 * Ambient frames redraw only the few regions that move — the tube rasters, the
 * scope, the Nixie glow, the LOCK lamp, the receiver dial — over a copy of the
 * last full frame. This module holds the pure decisions: when a frame may be
 * partial, when a full frame is worth copying, and the rectangle arithmetic;
 * `partialRedraw.ts` does the drawing. It must not import three.js or touch
 * the DOM, so the tests can run in Node.
 */

/** Everything a due frame needs to choose between a partial and a full frame. */
export interface PartialChoice {
    /** The runtime switch; off, every frame is a full one. */
    enabled: boolean;
    /** A copy of the last full frame is ready to put back. */
    stillValid: boolean;
    /** The frame carries a change the player asked for, so it renders at once. */
    changed: boolean;
    /** A texture changed while nothing moves. */
    dirty: boolean;
    /** The auto quality probe is measuring the cost of full frames. */
    probing: boolean;
    /** A shadow map is waiting to be cast, which only a full frame does. */
    shadowPending: boolean;
}

/** A frame is partial only when nothing but the registered regions could change in it. */
export function partialFrame(choice: PartialChoice): boolean {
    return choice.enabled && choice.stillValid && !choice.changed && !choice.dirty && !choice.probing && !choice.shadowPending;
}

/**
 * A full frame is copied for the partial frames that follow only when the
 * picture is about to stand still: frames that carry motion are never copied,
 * and neither are measurement frames, so interaction never pays for the copy.
 */
export function stillAfterFullFrame(changed: boolean, probing: boolean): boolean {
    return !changed && !probing;
}

/** A rectangle on the canvas: [left, bottom, right, top] in CSS pixels, the scissor convention (y grows up). */
export type Rect = readonly [number, number, number, number];

export function growRect([x0, y0, x1, y1]: Rect, pad: number): Rect {
    return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}

/** Intersects with the canvas; a rectangle that ends up empty is dropped. */
export function clipRect([x0, y0, x1, y1]: Rect, width: number, height: number): Rect | null {
    const rect: [number, number, number, number] = [Math.max(0, x0), Math.max(0, y0), Math.min(width, x1), Math.min(height, y1)];
    return rect[2] > rect[0] && rect[3] > rect[1] ? rect : null;
}

/**
 * The canvas rectangle of an object's projected bounding-box corners, padded
 * and clipped to the canvas. Corners are NDC triples (after `project()`); y
 * grows up, matching the scissor convention. An object entirely behind the
 * camera or beyond the far plane (every z past 1) has no rectangle; one that
 * crosses the camera plane cannot be bounded and covers the canvas.
 */
export function rectFromNdc(corners: Iterable<readonly [number, number, number]>, width: number, height: number, pad = 6): Rect | null {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, count = 0, behind = 0;
    for (const [nx, ny, nz] of corners) {
        count++;
        if (nz > 1) { behind++; continue; }
        const x = (nx + 1) * width / 2, y = (ny + 1) * height / 2;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
    }
    if (!count || behind === count) return null;
    if (behind) return [0, 0, width, height];
    return clipRect([Math.floor(x0 - pad), Math.floor(y0 - pad), Math.ceil(x1 + pad), Math.ceil(y1 + pad)], width, height);
}

/** Merges rectangles that touch or overlap; the input is not mutated. */
export function mergeRects(rects: readonly Rect[]): Rect[] {
    const merged = rects.map(rect => [...rect] as [number, number, number, number]);
    for (let again = true; again;) {
        again = false;
        for (let i = 0; i < merged.length && !again; i++) for (let j = i + 1; j < merged.length && !again; j++) {
            const a = merged[i], b = merged[j];
            if (a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]) {
                merged[i] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
                merged.splice(j, 1);
                again = true;
            }
        }
    }
    return merged;
}
