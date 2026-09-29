export type InkPoint = { x: number; y: number };
type ClientPoint = { clientX: number; clientY: number };
type PointerSamples = ClientPoint & { getCoalescedEvents?: () => ClientPoint[] };

/** Browsers can combine several pen samples into one pointermove. Keep the curve,
 * then include the dispatched event so a quick pointerup always supplies its tip. */
export function inkPointerSamples(event: PointerSamples): ClientPoint[] {
    let samples: ClientPoint[] = [];
    try { samples = event.getCoalescedEvents?.() ?? []; } catch { /* Older implementations may not support this event type. */ }
    return [...samples, event];
}

/** Skip only identical samples. A distance threshold also discards short strokes
 * and the final fraction of a stroke when the pointer is released quickly. */
export function appendInkPoints(points: InkPoint[], samples: InkPoint[]): InkPoint[] {
    let next = points;
    for (const point of samples) {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
        const last = next[next.length - 1];
        if (last?.x === point.x && last.y === point.y) continue;
        if (next === points) next = [...points];
        next.push(point);
    }
    return next;
}
