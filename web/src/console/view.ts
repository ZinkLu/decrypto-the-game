export type ConsoleView = 'game' | 'preview';
export type HandleSide = 'left' | 'right';

export function consoleRoute(pathname: string, search: string, development: boolean) {
    const view: ConsoleView = pathname.replace(/\/+$/, '') === '/preview' ? 'preview' : 'game';
    const params = new URLSearchParams(search);
    return { view, scenario: development ? params.get('preview') ||
        (params.has('instruments') || params.has('words') || view === 'preview' ? 'encrypting' : null) :
        view === 'preview' ? 'encrypting' : null };
}

// The navigation uses only a narrow top edge; notices float beside the machine
// instead of reserving a footer. Keep the full chassis, both handles and the
// power switch in view even in a short landscape window. Both faces share this
// framing; the rear cables may extend below the viewport.
export function gameFraming(width: number, height: number) {
    const w = Math.max(1, width), h = Math.max(1, height);
    const top = Math.min(46, h * .1), bottom = Math.min(16, h * .04);
    const fieldHeight = Math.max(10.65 * h / (h - top - bottom), 18.3 * h / Math.max(1, w - 32));
    return { height: fieldHeight, centerY: .12 + fieldHeight * (top - bottom) / (2 * h) };
}

export function handlePull(side: HandleSide, dx: number, width: number) {
    const inward = side === 'left' ? dx : -dx;
    return Math.max(0, Math.min(.65, inward / Math.max(160, width * .28)));
}
export const handleCommit = .23;

export function inspectionZoom(zoom: number, delta: number, mode = 0) {
    const pixels = delta * (mode === 1 ? 16 : mode === 2 ? 600 : 1);
    return Math.max(.65, Math.min(2.4, zoom * Math.exp(-Math.max(-240, Math.min(240, pixels)) * .0015)));
}

// Coordinates follow refine_handles.py: rubber sleeves at the front, four
// separate anchor plates at the rear. No rectangular target spans empty space.
export const handleSurfaces = {
    handleLeftControl: { x: -8.58, y: 0, z: .78, w: .70, h: 3.8 },
    handleRightControl: { x: 8.58, y: 0, z: .78, w: .70, h: 3.8 },
    handleRearLeftTopControl: { x: -7.15, y: 2.2, z: -3.04, w: 1.15, h: 1.4, rotationY: Math.PI },
    handleRearLeftBottomControl: { x: -7.15, y: -2.2, z: -3.04, w: 1.15, h: 1.4, rotationY: Math.PI },
    handleRearRightTopControl: { x: 7.15, y: 2.2, z: -3.04, w: 1.15, h: 1.4, rotationY: Math.PI },
    handleRearRightBottomControl: { x: 7.15, y: -2.2, z: -3.04, w: 1.15, h: 1.4, rotationY: Math.PI },
};
