export type QualityLevel = 'high' | 'medium' | 'low';
export type QualityChoice = 'auto' | QualityLevel;
export const qualityChoices: QualityChoice[] = ['auto', 'high', 'medium', 'low'];

/**
 * Every switch a quality level owns. Costs were measured on the late-game
 * console (2880x1800, one switch off at a time against 5.9 ms per frame) and
 * are recorded in assets/console/README.md.
 */
export interface QualityProfile {
    /** Cap on the display's device pixel ratio. */
    pixelRatio: number;
    /** The two broad studio sources. Off, the key, fill and sky are raised to the same exposure. */
    areaLights: boolean;
    shadows: boolean;
    /** Physical glass over the six CRTs. */
    screenGlass: boolean;
    /** Clearcoat acrylic and tube glass over the nixies. */
    nixieCover: boolean;
    /** `lite` drops refraction through the faceplate, halation and colour fringing. */
    crtOptics: 'full' | 'lite';
    /** Rate of frames in which only the raster, the beam and the needle move. */
    ambientFps: number;
    /** CSS blur behind the archive sheet, composited over the live canvas. */
    backdropBlur: boolean;
}
export const qualityProfiles: Record<QualityLevel, QualityProfile> = {
    high: { pixelRatio: 2, areaLights: true, shadows: true, screenGlass: true, nixieCover: true, crtOptics: 'full', ambientFps: 60, backdropBlur: true },
    medium: { pixelRatio: 1.5, areaLights: false, shadows: true, screenGlass: true, nixieCover: true, crtOptics: 'full', ambientFps: 30, backdropBlur: true },
    low: { pixelRatio: 1, areaLights: false, shadows: false, screenGlass: false, nixieCover: false, crtOptics: 'lite', ambientFps: 30, backdropBlur: false },
};

/** What a level switches, in the order of the profile, for the settings hint. */
export function describeQuality(profile: QualityProfile, t: (message: string, values?: unknown[]) => string) {
    const state = (label: string, on: boolean) => `${t(label)} ${t(on ? '开' : '关')}`;
    return [
        t('分辨率上限 {0}×', [profile.pixelRatio]),
        state('面光源', profile.areaLights),
        state('阴影', profile.shadows),
        state('屏幕玻璃', profile.screenGlass),
        state('辉光管罩', profile.nixieCover),
        t(profile.crtOptics === 'full' ? 'CRT 光学完整' : 'CRT 光学简化'),
        t('待机 {0} 帧', [profile.ambientFps]),
        state('背景模糊', profile.backdropBlur),
    ].join(' · ');
}

// A level is kept when one fully synchronised frame fits here, which leaves the
// rest of a 16.7 ms display interval to the compositor and the page.
export const frameBudget = 13;
// The GPU's share of a medium frame measured 2.8 times cheaper than high's, so
// beyond this even medium misses. Guessing high only costs one more measurement.
const mediumGain = 2.8;
/** Auto only ever steps down: a level that fits is never traded for a gamble on the next one up. */
export function settleQuality(level: QualityLevel, frameCost: number): QualityLevel {
    if (!(frameCost > frameBudget) || level === 'low') return level;
    return level === 'high' && frameCost <= frameBudget * mediumGain ? 'medium' : 'low';
}

const isLevel = (value: unknown): value is QualityLevel => value === 'high' || value === 'medium' || value === 'low';
export function readQuality(): QualityChoice {
    try { const saved = localStorage.getItem('decrypto-quality'); if (saved === 'auto' || isLevel(saved)) return saved; } catch { /* Storage may be disabled. */ }
    return 'auto';
}
export function saveQuality(choice: QualityChoice) {
    try { localStorage.setItem('decrypto-quality', choice); } catch { /* Keep the selection for this session. */ }
}
/** The level Auto last settled on, so a slow device does not start over at high on every visit. */
export function readAutoQuality(): QualityLevel {
    try { const saved = localStorage.getItem('decrypto-quality-auto'); if (isLevel(saved)) return saved; } catch { /* Storage may be disabled. */ }
    return 'high';
}
export function saveAutoQuality(level: QualityLevel) {
    try { localStorage.setItem('decrypto-quality-auto', level); } catch { /* Measured again on the next visit. */ }
}
