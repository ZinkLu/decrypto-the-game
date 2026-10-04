export type PaperPoint = { x: number; y: number };

/** Positions and dimensions are percentages of the actual paper, not its screen bounds. */
export function containNote(point: PaperPoint, size: PaperPoint): PaperPoint {
    const inset = 2;
    const limit = (value: number, extent: number) => Math.max(inset, Math.min(100 - inset - extent, Number.isFinite(value) ? value : inset));
    return { x: limit(point.x, size.x), y: limit(point.y, size.y) };
}

export function moveNote(origin: PaperPoint, start: PaperPoint, current: PaperPoint, size: PaperPoint): PaperPoint {
    return containNote({ x: origin.x + current.x - start.x, y: origin.y + current.y - start.y }, size);
}

/** Narrow a new field before moving it away from the place the player clicked. */
export function placeNote(point: PaperPoint, paperWidth: number): PaperPoint & { width: number } {
    const pixels = Number.isFinite(paperWidth) && paperWidth > 0 ? paperWidth : 450;
    const maximum = Math.min(48, 220 / pixels * 100);
    const minimum = Math.min(maximum, Math.max(22, 90 / pixels * 100));
    const width = Math.max(minimum, Math.min(maximum, 98 - (Number.isFinite(point.x) ? point.x : 2)));
    return { ...containNote(point, { x: width, y: 6 }), width };
}
