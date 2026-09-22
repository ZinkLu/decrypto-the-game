export type DotFilter = 'baseline' | 'area' | 'lod' | 'ssaa';
export const defaultDotFilter: DotFilter = 'area';

export const dotFilterOptions: { id: DotFilter; label: string; description: string }[] = [
    { id: 'baseline', label: '原版', description: '当前基准：缩小时逐渐把灯珠混成均匀亮面。' },
    { id: 'area', label: '1 · 像素积分', description: '按像素覆盖面积计算灯珠亮度，保留可分辨的亮点与暗缝。' },
    { id: 'lod', label: '2 · 远景颗粒', description: '近看真实灯珠，远看平滑切换到较粗的颗粒纹理；文字内容保持不变。' },
    { id: 'ssaa', label: '3 · 16 点超采样', description: '每个像素取 4×4 个样本，仅用于 LED 发光层；计算量更高。' },
];
export const readDotFilter = (value: string | null): DotFilter => dotFilterOptions.find(option => option.id === value)?.id ?? defaultDotFilter;
export function readWordScale(value: string | null, closeup: boolean) {
    const scale = Number(value);
    return value !== null && Number.isFinite(scale) && scale >= 1 && scale <= 4 ? scale : closeup ? 2 : 1;
}
export const dotFilterDefine: Record<DotFilter, number> = { baseline: 0, area: 1, lod: 2, ssaa: 3 };

// A Gaussian die confined to one lamp cell. Its integral is one, independent
// of sigma, so both filtering methods conserve the same light when zooming.
// Scalar GLSL is also exercised against numerical quadrature in the tests.
export const dotKernelShader = `
    float ledErf(float x) {
        float a = abs(x);
        float t = 1.0 / (1.0 + .3275911 * a);
        float p = (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t;
        return sign(x) * (1.0 - p * exp(-a * a));
    }
    float ledGaussian(float x, float sigma) {
        return exp(-.5 * x * x / (sigma * sigma)) / (2.506628275 * sigma * ledErf(.353553391 / sigma));
    }
    float ledIntegral(float offset, float width, float sigma) {
        float lo = clamp(offset - width * .5, -.5, .5);
        float hi = clamp(offset + width * .5, -.5, .5);
        float k = .707106781 / sigma;
        return max(0.0, ledErf(hi * k) - ledErf(lo * k)) / (2.0 * width * ledErf(.5 * k));
    }
`;

/** Included after the dot uniforms; the source sampler is passed explicitly. */
export const dotFilteringShader = `
    #if DOT_FILTER > 0
    ${dotKernelShader}
    vec3 ledLevel(sampler2D source, vec2 cell) {
        float inside = step(0.0, cell.x) * step(cell.x, dotSize.x - 1.0)
            * step(0.0, cell.y) * step(cell.y, dotSize.y - 1.0);
        float row = dotSize.y - 1.0 - cell.y;
        float band = step(dotBandRows.x, row) * step(row, dotBandRows.y);
        float strip = max(dotPanel.y, dotSize.x), col = cell.x;
        if (strip > dotSize.x + .5 && band > .5)
            col = mod(col - dotInset + dotPanel.x, strip - 2.0 * dotInset + dotGap) + dotInset;
        float clip = mix(1.0, step(dotInset, cell.x) * step(cell.x, dotSize.x - dotInset - 1.0), band);
        vec3 signal = smoothstep(.30, .78, pow(max(textureLod(source, (vec2(col, cell.y) + .5) / vec2(strip, dotSize.y), 0.0).rgb, vec3(0.0)), vec3(.4545)));
        signal *= step(col, strip - .5) * clip * step(cell.x + .5, dotDrive.y * dotSize.x);
        float test = dotDrive.z * (1.0 - step(1.0, mod(cell.x, 10.0)));
        return max(signal, vec3(test, 0.0, 0.0)) * inside
            * step(floor(row / 10.0) + .5, dotDrive.w * ceil(dotSize.y / 10.0));
    }
    vec3 ledLight(vec3 level, vec2 cell, float body, float core) {
        vec3 ink = dotInkWord * level.r + dotInkLegend * level.g + dotInkWarning * level.b;
        float sum = level.r + level.g + level.b;
        float unit = 1.0 + (crtHash(cell + dotPanel.z * 17.0) - .5) * .12;
        return (ink * body + (vec3(sum) - ink) * .20 * core) * unit * 1.25;
    }
    #if DOT_FILTER == 1 || DOT_FILTER == 2
    void ledArea(sampler2D source, vec2 at, vec2 footprint, out vec3 light, out vec3 meanLight) {
        // Bounding box of the pixel's UV parallelogram. It is exact head-on;
        // tilted windows use a conservative anisotropic box approximation.
        light = vec3(0.0); meanLight = vec3(0.0);
        vec2 width = max(footprint, vec2(.002));
        for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
            vec2 cell = floor(at) + vec2(float(x), float(y));
            vec2 delta = at - cell - .5;
            vec2 overlap = max(vec2(0.0), min(vec2(.5), delta + width * .5) - max(vec2(-.5), delta - width * .5));
            if (overlap.x * overlap.y <= 0.0) continue;
            vec3 level = ledLevel(source, cell);
            float body = .48 * ledIntegral(delta.x, width.x, .225) * ledIntegral(delta.y, width.y, .225);
            float core = .13 * ledIntegral(delta.x, width.x, .12) * ledIntegral(delta.y, width.y, .12);
            light += ledLight(level, cell, body, core);
            float coverage = overlap.x * overlap.y / (width.x * width.y);
            meanLight += ledLight(level, cell, .48, .13) * coverage;
        }
    }
    #endif
    #if DOT_FILTER == 2
    float ledCarrier(vec2 at, vec2 width, float pitch) {
        vec2 p = fract(at / pitch) - .5;
        vec2 w = max(width / pitch, vec2(.002));
        vec2 sum = vec2(0.0);
        for (int i = -1; i <= 1; i++) {
            sum.x += ledIntegral(p.x - float(i), w.x, .225);
            sum.y += ledIntegral(p.y - float(i), w.y, .225);
        }
        return sum.x * sum.y;
    }
    vec3 ledLod(vec3 detailed, vec3 meanLight, vec2 at, vec2 width, float footprint) {
        // Crossfade between fixed, nested lattices, never slide the lamp centres.
        float level = clamp(log2(max(1.0, footprint * 3.8)), 0.0, 5.0);
        float pitch = exp2(floor(level));
        float grain = mix(ledCarrier(at, width, pitch), ledCarrier(at, width, pitch * 2.0), smoothstep(0.0, 1.0, fract(level)));
        float amount = smoothstep(.20, .55, footprint);
        // Keep a readable pedestal beneath the deliberately coarser texture.
        return mix(detailed, meanLight * mix(1.0, grain, .58), amount);
    }
    #endif
    #if DOT_FILTER == 3
    vec3 ledSupersample(sampler2D source, vec2 at, vec2 dx, vec2 dy) {
        vec3 light = vec3(0.0);
        // Deterministic 4x4 integration of the actual emission and glyph mask
        // across the pixel parallelogram, not 16 copies of the softened image.
        for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
            vec2 p = at + dx * ((float(x) + .5) * .25 - .5) + dy * ((float(y) + .5) * .25 - .5);
            vec2 cell = floor(p), delta = fract(p) - .5;
            float body = .48 * ledGaussian(delta.x, .225) * ledGaussian(delta.y, .225);
            float core = .13 * ledGaussian(delta.x, .12) * ledGaussian(delta.y, .12);
            light += ledLight(ledLevel(source, cell), cell, body, core);
        }
        return light / 16.0;
    }
    #endif
    #endif
`;
