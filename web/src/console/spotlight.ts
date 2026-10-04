export interface SpotlightRect { left: number; top: number; width: number; height: number }

/** A padded, visible rectangle around the controls belonging to one function. */
export function spotlightBounds(rects: SpotlightRect[], width: number, height: number, padding = 14): SpotlightRect | null {
    const visible = rects.filter(rect => Object.values(rect).every(Number.isFinite) && rect.width > 0 && rect.height > 0 &&
        rect.left < width && rect.top < height && rect.left + rect.width > 0 && rect.top + rect.height > 0);
    if (!visible.length) return null;
    const left = Math.max(4, Math.min(...visible.map(rect => rect.left)) - padding);
    const top = Math.max(4, Math.min(...visible.map(rect => rect.top)) - padding);
    const right = Math.min(width - 4, Math.max(...visible.map(rect => rect.left + rect.width)) + padding);
    const bottom = Math.min(height - 4, Math.max(...visible.map(rect => rect.top + rect.height)) + padding);
    return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null;
}

/** Black apertures subtract from the mask, so overlapping clear regions stay clear. */
export function spotlightMask(width: number, height: number, holes: SpotlightRect[]) {
    const apertures = holes.map(rect => `<rect x="${rect.left}" y="${rect.top}" width="${rect.width}" height="${rect.height}" rx="12" fill="black"/>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><mask id="focus"><rect width="100%" height="100%" fill="white"/>${apertures}</mask></defs><rect width="100%" height="100%" fill="white" mask="url(#focus)"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
