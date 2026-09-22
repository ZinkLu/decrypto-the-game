import * as THREE from 'three';
import { crtOpticsShader } from './crt';
import type { CrtKind } from './crtMotion';
import { dotGrid, type WordDisplay } from './dotMatrix';
import { defaultDotFilter, dotFilterDefine, dotFilteringShader, type DotFilter } from './dotFiltering';

export interface CrtUniforms {
    scan: { value: THREE.Vector4 };
    light: { value: THREE.Vector4 };
    trail: { value: THREE.Vector4 };
    hot: { value: THREE.Color };
    after: { value: THREE.Color };
    tint: { value: THREE.Color };
}
export interface DotUniforms {
    drive: { value: THREE.Vector4 };
    panel: { value: THREE.Vector4 };
}
/** One shared semantic palette bus serves all four LED modules. */
// The warning channel reuses the legend die: the modules have only two colours.
export const dotInks = { word: { value: new THREE.Color('#f1b09d') }, legend: { value: new THREE.Color('#d7cfb8') }, warning: { value: new THREE.Color('#d7cfb8') } };
export const dotUniforms = (): DotUniforms => ({
    drive: { value: new THREE.Vector4(1, 1, 0, 0) },
    panel: { value: new THREE.Vector4(0, dotGrid.cols, 0, 0) },
});
export const crtUniforms = (kind: CrtKind = 'screen'): CrtUniforms => ({
    scan: { value: new THREE.Vector4(1, 1, 0, .004) },
    light: { value: new THREE.Vector4(1, 0, 1, 0) },
    trail: { value: new THREE.Vector4(0, 0, 0, 0) },
    hot: { value: new THREE.Color().setRGB(...looks[kind].hot) },
    after: { value: new THREE.Color().setRGB(...looks[kind].after) },
    tint: { value: new THREE.Color().setRGB(.002, .004, .004) },
});

// hot: a saturated phosphor seen through its filter. after: what still glows once
// the fastest component has gone. flood: an unblanked raster relative to white.
const looks: Record<CrtKind, { profile: number; hot: [number, number, number]; after: [number, number, number]; flood: number }> = {
    screen: { profile: 0, hot: [.80, .97, .90], after: [.62, 1, .76], flood: .30 },
    word: { profile: 1, hot: [1, .28, .12], after: [1, .82, .74], flood: .32 },
    scope: { profile: 2, hot: [.58, 1, .68], after: [.78, 1, .80], flood: .24 },
};

interface Options {
    kind: CrtKind;
    seed: number;
    lite: () => boolean;
    time: { value: number };
    eye: { value: THREE.Vector3 };
    tube: CrtUniforms;
    size: THREE.Vector2;
    curvature: { warp: number; rise: number; innerRise: number; depth: number };
    spot: number;
    /** Keyword windows can be fitted with a dot-matrix module instead of a tube. */
    display?: () => WordDisplay;
    filter?: () => DotFilter;
    dots?: DotUniforms;
}

/** The picture tube's fragment stage: optics, raster, and the beam the tube state describes. */
export function shadeCrt(material: THREE.Material, options: Options) {
    const look = looks[options.kind];
    material.onBeforeCompile = shader => {
        const { curvature, size } = options;
        Object.assign(shader.uniforms, {
            crtTime: options.time, crtScan: options.tube.scan, crtLight: options.tube.light, crtTrail: options.tube.trail,
            crtHot: options.tube.hot, crtAfter: options.tube.after, crtTint: options.tube.tint,
            crtFlood: { value: look.flood }, crtSpot: { value: options.spot },
            crtProfile: { value: look.profile }, crtSeed: { value: options.seed },
            crtCurve: { value: curvature.warp }, crtAspect: { value: size.x / size.y },
            crtEye: options.eye, crtSize: { value: size },
            crtRise: { value: curvature.rise }, crtInnerRise: { value: curvature.innerRise }, crtDepth: { value: curvature.depth },
        });
        // Three reuses the latest material uniforms when returning to a cached
        // program. Keep both hardware bindings alive, including while CRT is fitted.
        if (options.dots) {
            // Square cells on a module that leaves the window a dark margin.
            const across = .94, cell = size.x * across / dotGrid.cols;
            Object.assign(shader.uniforms, {
                dotDrive: options.dots.drive, dotPanel: options.dots.panel, dotInkWord: dotInks.word, dotInkLegend: dotInks.legend, dotInkWarning: dotInks.warning,
                dotSize: { value: new THREE.Vector2(dotGrid.cols, dotGrid.rows) },
                dotFit: { value: new THREE.Vector2(1 / across, size.y / (dotGrid.rows * cell)) },
                dotBandRows: { value: new THREE.Vector2(dotGrid.bandTop, dotGrid.bandBottom) }, dotGap: { value: dotGrid.gap }, dotInset: { value: dotGrid.inset },
            });
        }
        const display = options.display?.() ?? 'crt';
        if (display !== 'crt' && options.dots) {
            shader.fragmentShader = `#define DOT_FILTER ${dotFilterDefine[options.filter?.() ?? defaultDotFilter]}\n` + (options.lite() ? '#define CRT_LITE\n' : '')
                + crtOpticsShader + crtTubeShader + dotDeclarations + dotFilteringShader + shader.fragmentShader.replace('#include <map_fragment>', dotMatrixShader);
            return;
        }
        shader.fragmentShader = (options.lite() ? '#define CRT_LITE\n' : '') + crtOpticsShader + crtTubeShader + shader.fragmentShader
            .replace('#include <map_fragment>', crtPictureShader)
            .replace('#include <dithering_fragment>', crtRasterShader);
    };
    material.customProgramCacheKey = () => `console-crt-tube-v2-${options.kind}-${options.display?.() ?? 'crt'}-${options.filter?.() ?? defaultDotFilter}-${options.lite() ? 'lite' : 'full'}`;
}

const crtTubeShader = `
    uniform float crtTime;
    uniform vec4 crtScan;
    uniform vec4 crtLight;
    uniform vec4 crtTrail;
    uniform vec3 crtHot;
    uniform vec3 crtAfter;
    uniform vec3 crtTint;
    uniform float crtFlood;
    uniform float crtSpot;
    uniform float crtProfile;
    uniform float crtSeed;
    uniform float crtCurve;
    uniform float crtAspect;
    float crtHash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }
    vec3 crtEmission(sampler2D crtMap, vec2 uv, float bias) {
        vec3 signal = texture2D(crtMap, clamp(uv, .002, .998), bias).rgb;
        float peak = max(max(signal.r, signal.g), signal.b);
        return signal * smoothstep(.035, .20, peak);
    }
    float crtErf(float x) {
        float a = abs(x);
        float d = 1.0 + a * (.278393 + a * (.230389 + a * (.000972 + a * .078108)));
        d *= d;
        return sign(x) * (1.0 - 1.0 / (d * d));
    }
    // Light a scan of half-extent reach leaves at u through a gaussian spot. It
    // integrates to one for any reach: what a raster loses in area it gains in
    // brightness, through the band, the line and the spot alike.
    float crtDensity(float u, float reach, float spot) {
        return (crtErf((u + reach) / spot) - crtErf((u - reach) / spot)) / (4.0 * reach);
    }
    // Eye and phosphor expose a frame for a while. A raster in flight is every
    // extent it passed through in that time, so its edges are gradients, not lines.
    float crtExposure(float u, float reach, float past, float spot) {
        float total = 0.0;
        for (int i = 0; i < 6; i++) total += crtDensity(u, reach * pow(past / reach, float(i) * .2), spot);
        return total / 6.0;
    }
    float crtFrame(vec2 rasterUv, vec2 soft) {
        vec2 aperture = abs(rasterUv - .5) * 2.0;
        return (1.0 - smoothstep(.99 - soft.x, .99 + soft.x, aperture.x)) * (1.0 - smoothstep(.99 - soft.y, .99 + soft.y, aperture.y));
    }
`;

const crtPictureShader = `
    #ifdef USE_MAP
    // Lite optics print the picture on the faceplate: no ray
    // through the glass, no fringing and no halation taps.
    #ifdef CRT_LITE
    vec2 crtCentered = vMapUv - .5;
    #else
    vec2 crtCentered = crtPhosphorUv(vMapUv) - .5;
    #endif
    float crtRadius = dot(crtCentered, crtCentered);
    vec2 crtDeflection = crtCentered * (1.0 + crtRadius * crtCurve);
    bool crtMoving = crtTrail.w > .5;
    vec2 crtField = crtDeflection;
    // Degauss: a decaying mains field swims through the picture.
    if (crtMoving) crtField += crtTrail.z * vec2(.010 * sin(crtDeflection.y * 23.0 + crtTime * 61.0), .007 * sin(crtDeflection.x * 17.0 + crtTime * 53.0));
    vec2 crtExtent = max(crtScan.xy, vec2(.002));
    vec2 crtRasterUv = .5 + crtField / crtExtent;
    vec2 crtFrameUv = crtRasterUv;
    // Until vertical sync locks the picture slips, its blanking bar in view.
    float crtBar = 1.0;
    if (crtMoving && crtScan.z != 0.0) {
        float crtSlip = mod(crtRasterUv.y + crtScan.z + .04, 1.08) - .04;
        crtBar = smoothstep(0.0, .012, crtSlip) * (1.0 - smoothstep(.988, 1.0, crtSlip));
        crtRasterUv.y = crtSlip;
    }
    vec2 crtUv = clamp(crtRasterUv, .002, .998);
    float crtUnstable = crtMoving ? crtLight.w : 0.0;
    // Each ruby window owns a separate clock and noise seed.
    // A burst now averages roughly once every four seconds
    // and lasts under 200ms instead of occupying a full tick.
    float crtClock = crtTime * .85 + crtSeed * 5.17;
    float crtTick = floor(crtClock);
    float crtPulse = 1.0 - step(.16, fract(crtClock));
    float crtBurst = step(.68, crtHash(vec2(crtTick, crtSeed * 13.7 + 4.7))) * crtPulse;
    crtBurst *= step(.5, crtProfile) * step(crtProfile, 1.5) * step(.0001, crtTime);
    // An unlocked picture tears continuously, wherever the hold happens to slip.
    crtBurst = max(crtBurst, smoothstep(.05, .5, crtUnstable));
    float crtTearY = .12 + crtHash(vec2(crtTick + crtSeed * 7.3 + floor(crtTime * 24.0) * crtUnstable, 8.3)) * .76;
    float crtTear = (1.0 - smoothstep(.003, .022 + crtUnstable * .05, abs(crtUv.y - crtTearY))) * crtBurst;
    crtUv.x += crtTear * (crtHash(vec2(crtTick, crtSeed * 9.1 + 2.1)) - .5) * (crtProfile > .5 ? .075 : .03);
    // Line jitter: each scan row starts a little early or late.
    float crtRow = floor(crtUv.y * 240.0);
    crtUv.x += (crtHash(vec2(crtRow, floor(crtTime * 60.0) + crtSeed)) - .5) * crtUnstable * .02;
    crtUv.x = clamp(crtUv.x, .002, .998);
    // A spot wider than at rest reads as a softer picture.
    float crtBlur = crtMoving ? log2(max(crtScan.w / crtSpot, 1.0)) * 1.35 : 0.0;
    vec4 crtCenter = texture2D(map, crtUv, crtBlur);
    if (crtBlur > .01) {
        // Mip levels alone blur in blocks; four taps across the spot round them off.
        vec2 crtSoft = vec2(crtScan.w / crtAspect, crtScan.w) * .85 / crtExtent;
        crtCenter = (crtCenter * 2.0
            + texture2D(map, clamp(crtUv + crtSoft, .002, .998), crtBlur) + texture2D(map, clamp(crtUv - crtSoft, .002, .998), crtBlur)
            + texture2D(map, clamp(crtUv + crtSoft * vec2(1.0, -1.0), .002, .998), crtBlur)
            + texture2D(map, clamp(crtUv - crtSoft * vec2(1.0, -1.0), .002, .998), crtBlur)) / 6.0;
    }
    #ifdef CRT_LITE
    vec4 sampledDiffuseColor = crtCenter;
    #else
    float crtSplit = .0012 + crtTear * .009;
    vec4 crtLeft = texture2D(map, clamp(crtUv - vec2(crtSplit, 0.0), .002, .998), crtBlur);
    vec4 crtRight = texture2D(map, clamp(crtUv + vec2(crtSplit, 0.0), .002, .998), crtBlur);
    vec4 sampledDiffuseColor = crtProfile > .5 && crtProfile < 1.5
        ? vec4(crtRight.r, crtCenter.g, crtLeft.b, crtCenter.a)
        : crtCenter;
    #endif
    // Halation follows bright ink and traces only. Dark glass
    // cannot produce this light, and power-off suppresses it.
    // Four near taps carry a slightly raised weight instead
    // of a second far ring; the ruby windows glow from one soft tap.
    vec3 crtHalo = vec3(0.0);
    #ifndef CRT_LITE
    if (crtProfile < .5 || crtProfile > 1.5) {
        vec2 glowStep = vec2(.0022 / crtAspect, .0022);
        crtHalo = (crtEmission(map, crtUv + vec2(glowStep.x, 0.0), crtBlur)
            + crtEmission(map, crtUv - vec2(glowStep.x, 0.0), crtBlur)
            + crtEmission(map, crtUv + vec2(0.0, glowStep.y), crtBlur)
            + crtEmission(map, crtUv - vec2(0.0, glowStep.y), crtBlur)) * .24;
    } else crtHalo = crtEmission(map, crtUv, crtBlur + 2.6) * .55;
    #endif
    sampledDiffuseColor.rgb += crtHalo * .36;
    sampledDiffuseColor.rgb *= 1.12 * crtBar;
    // A dark inner border separates the emitting coating
    // from the front glass. Out-of-frame samples fade rather
    // than stretching their last row onto the rounded rim.
    vec3 crtTube = crtTint;
    float crtPicture = crtFrame(crtFrameUv, min(vec2(.02) / crtExtent, vec2(.5)));
    float crtGlowing = crtLight.x;
    if (!crtMoving) {
        sampledDiffuseColor.rgb = mix(crtTube, sampledDiffuseColor.rgb, crtPicture * crtLight.x);
    } else {
        vec2 crtReach = crtExtent * .5;
        vec2 crtBeamSpot = vec2(crtScan.w / crtAspect, crtScan.w);
        vec2 crtPast = max(crtTrail.xy, vec2(.002)) * .5;
        float crtCore = crtExposure(crtField.x, crtReach.x, crtPast.x, crtBeamSpot.x) * crtExposure(crtField.y, crtReach.y, crtPast.y, crtBeamSpot.y);
        vec2 crtSwept = max(crtReach, crtPast) * 2.0;
        float crtCover = clamp(crtCore * crtSwept.x * crtSwept.y, 0.0, 1.0);
        float crtEnergy = crtLight.x * crtCore;
        // Without its video amplifier the gun floods the raster evenly.
        vec3 crtLive = mix(sampledDiffuseColor.rgb, crtHot * crtFlood, crtLight.y * .88) * crtEnergy;
        // Phosphor saturates: a crowded beam burns toward white, never past it.
        crtLive = mix(crtLive, vec3(1.0) - exp(-crtLive), smoothstep(1.0, 2.5, crtEnergy));
        float crtPeak = max(max(crtLive.r, crtLive.g), crtLive.b);
        crtLive = mix(crtLive, crtHot * crtPeak, smoothstep(2.0, 14.0, crtEnergy) * .8);
        // Light scattered inside the faceplate only shows once the raster is crowded.
        float crtCrowd = 1.0 - clamp(crtExtent.x * crtExtent.y, 0.0, 1.0);
        vec2 crtBloomSpot = crtBeamSpot * 3.0 + vec2(.016 / crtAspect, .016);
        vec2 crtHaloSpot = vec2(.10 / crtAspect, .10);
        float crtScatter = crtLight.x * crtCrowd * (
            crtDensity(crtField.x, crtReach.x, crtBloomSpot.x) * crtDensity(crtField.y, crtReach.y, crtBloomSpot.y) * .40
            + crtDensity(crtField.x, crtReach.x, crtHaloSpot.x) * crtDensity(crtField.y, crtReach.y, crtHaloSpot.y) * .08);
        // The last full picture dies where it stood.
        vec2 crtGhostUv = .5 + crtDeflection;
        vec3 crtGhost = texture2D(map, clamp(crtGhostUv, .002, .998), 1.0).rgb * 1.12 * crtFrame(crtGhostUv, vec2(.02))
            * mix(crtAfter, vec3(1.0), crtLight.z) * crtLight.z;
        // The frame's dark inner border belongs to a full raster; a crowded one is shaped by its beam alone.
        float crtOpen = mix(crtPicture, 1.0, smoothstep(0.0, .15, crtCrowd));
        sampledDiffuseColor.rgb = crtTube * (1.0 - crtOpen * crtCover * min(crtLight.x, 1.0)) + crtGhost * (1.0 - crtCover) + crtLive * crtOpen
            + crtHot * (1.0 - exp(-crtScatter * crtFlood * 2.4));
        crtGlowing = clamp(max(crtLight.x, crtLight.z), 0.0, 1.0);
    }
    sampledDiffuseColor.a = 1.0;
    diffuseColor *= sampledDiffuseColor;
    #endif
`;

const crtRasterShader = `
    #include <dithering_fragment>
    #ifdef USE_MAP
    // One raster, curved with the picture. Pixel integration
    // preserves visible scan rows without distant moire.
    float crtRows = crtProfile < .5 ? 142.0 : crtProfile > 1.5 ? 54.0 : 46.0;
    float crtFootprint = max(.001, fwidth(crtFrameUv.y) * crtRows * 3.14159265);
    float crtVisibility = max(0.0, sin(crtFootprint) / crtFootprint);
    float crtLines = .5 + .5 * cos(crtRasterUv.y * crtRows * 6.2831853) * crtVisibility;
    float crtRoll = fract(crtRasterUv.y - crtTime * .095 + crtSeed * .17);
    float crtBand = exp(-pow((crtRoll - .5) / .045, 2.0));
    // A supply still finding its level breathes through the picture.
    float crtFlicker = 1.0 + sin(crtTime * 37.0 + crtSeed * 2.0) * .006 * crtGlowing
        + (crtHash(vec2(floor(crtTime * 30.0), crtSeed + 3.0)) - .5) * .34 * crtUnstable;
    vec2 crtEdgeUv = abs(vMapUv - .5) * 2.0;
    float crtEdge = pow(crtEdgeUv.x, 6.0) + pow(crtEdgeUv.y, 6.0);
    float crtGrain = crtHash(floor(crtUv * vec2(960.0, 640.0)) + floor(crtTime * 18.0));
    gl_FragColor.rgb *= mix(1.0, .79 + .27 * crtLines, crtGlowing * crtPicture);
    gl_FragColor.rgb *= 1.0 + crtBand * .10 * crtGlowing * crtPicture;
    gl_FragColor.rgb *= crtFlicker * (1.0 - min(.54, crtEdge * .30) * crtGlowing);
    gl_FragColor.rgb *= 1.0 + (crtGrain - .5) * .035 * crtGlowing;
    if (crtProfile > .5 && crtProfile < 1.5) {
        float crtNoise = crtHash(floor(vMapUv * vec2(420.0, 180.0)) + floor(crtTime * 28.0));
        gl_FragColor.rgb += crtHot * .16 * crtTear * crtGlowing * crtPicture;
        gl_FragColor.rgb += (crtNoise - .5) * (.055 + .16 * crtUnstable) * crtBurst * crtGlowing * crtPicture;
    }
    #endif
`;

// LED dots behind a smoked contrast filter. Nothing scans and nothing persists;
// what the driver clocks in is what glows. The source's RGB channels address the
// keyword, legend and warning channels, one texel per lamp. Legends and warnings
// share the same die colour.
const dotDeclarations = `
    uniform vec4 dotDrive;
    uniform vec4 dotPanel;
    uniform vec2 dotSize;
    uniform vec2 dotFit;
    uniform vec2 dotBandRows;
    uniform float dotGap;
    uniform float dotInset;
    uniform vec3 dotInkWord;
    uniform vec3 dotInkLegend;
    uniform vec3 dotInkWarning;
`;
const dotMatrixShader = `
    #ifdef USE_MAP
    // The module sits a little behind its filter window, so it shifts with the eye.
    #ifdef CRT_LITE
    vec2 dotUv = vMapUv;
    #else
    vec2 dotUv = crtPhosphorUv(vMapUv);
    #endif
    vec2 dotCells = (dotUv - .5) * dotFit * dotSize + .5 * dotSize;
    // Cells per screen pixel. A lamp can only be drawn while it spans a few pixels.
    // Below that its cell carries the same light evenly, so the window's size, the
    // pixel ratio and a tilted console change what is resolved, never beat against the grid.
    float dotFootprint = max(length(dFdx(dotCells)), length(dFdy(dotCells)));
    float dotResolved = 1.0 - smoothstep(.20, .46, dotFootprint);
    vec2 dotCell = floor(dotCells);
    // Read whole lamps, with the step between two of them one screen pixel wide: cells
    // stay crisp while they span pixels and turn into plain filtering once they do not.
    vec2 dotBetween = dotCells - .5;
    vec2 dotReadCell = floor(dotBetween) + clamp((fract(dotBetween) - .5) / max(dotFootprint, .001) + .5, 0.0, 1.0);
    vec2 dotLocal = fract(dotCells) - .5;
    float dotInside = step(0.0, dotCell.x) * step(dotCell.x, dotSize.x - 1.0) * step(0.0, dotCell.y) * step(dotCell.y, dotSize.y - 1.0);
    float dotRow = dotSize.y - 1.0 - dotCell.y;
    // A keyword wider than the module crawls through its band as a marquee.
    float dotStrip = max(dotPanel.y, dotSize.x);
    float dotSource = dotReadCell.x;
    float dotWordBand = step(dotBandRows.x, dotRow) * step(dotRow, dotBandRows.y);
    float dotBandClip = step(dotInset, dotCell.x) * step(dotCell.x, dotSize.x - dotInset - 1.0);
    if (dotStrip > dotSize.x + .5 && dotWordBand > .5)
        dotSource = mod(dotReadCell.x - dotInset + dotPanel.x, dotStrip - 2.0 * dotInset + dotGap) + dotInset;
    float dotValid = step(dotSource, dotStrip - .5) * mix(1.0, dotBandClip, dotWordBand);
    vec2 dotSampleUv = vec2((dotSource + .5) / dotStrip, (dotReadCell.y + .5) / dotSize.y);
    // The painter's antialiased coverage is the lamp's duty cycle: a thin stroke of an
    // ideograph lights two half-bright lamps. Far away, whole cells are integrated instead.
    float dotLod = max(0.0, log2(dotFootprint));
    vec3 dotSignal = smoothstep(.30, .78, pow(max(textureLod(map, dotSampleUv, dotLod).rgb, vec3(0.0)), vec3(.4545))) * dotValid;
    // Columns are clocked in from the left; the self-test lights every tenth keyword column.
    float dotLoaded = step(dotCell.x + .5, dotDrive.y * dotSize.x);
    float dotBanks = step(floor(dotRow / 10.0) + .5, dotDrive.w * ceil(dotSize.y / 10.0));
    float dotTest = dotDrive.z * (1.0 - step(1.0, mod(dotCell.x, 10.0)));
    vec3 dotLevel = max(dotSignal * dotLoaded, vec3(dotTest, 0.0, 0.0)) * dotInside * dotBanks;
    // A diffused lens with a hotter die at its centre. The even light of an unresolved
    // cell is the lamp's mean over that cell, so zooming changes detail and not brightness.
    float dotReach = length(dotLocal), dotAa = max(.03, dotFootprint * .7);
    float dotLens = 1.0 - smoothstep(.36 - dotAa, .36 + dotAa, dotReach);
    float dotCore = exp(-dotReach * dotReach / .022);
    float dotShape = mix(.48, dotLens * .92 + dotCore * .55, dotResolved);
    // Diodes are binned, not matched.
    float dotUnit = 1.0 + (crtHash(dotCell + dotPanel.z * 17.0) - .5) * .12 * dotResolved;
    vec3 dotGlow = dotInkWord * dotLevel.r + dotInkLegend * dotLevel.g + dotInkWarning * dotLevel.b;
    float dotSum = dotLevel.r + dotLevel.g + dotLevel.b;
    vec3 dotEmit = mix(dotGlow, dotGlow * .6 + vec3(.4) * dotSum, dotCore * dotResolved * .5) * dotShape * dotUnit * 1.25;
    #if DOT_FILTER > 0
    vec2 dotDx = dFdx(dotCells), dotDy = dFdy(dotCells);
    vec2 dotPixel = abs(dotDx) + abs(dotDy);
    // Once a pixel covers many complete lamps, use the mip-filtered duty cycle.
    // Both experimental integrators converge to the same mean emission.
    vec3 dotMean = (dotGlow * .48 + (vec3(dotSum) - dotGlow) * .20 * .13) * 1.25;
    vec3 dotFiltered = dotMean, dotFlat = dotMean;
    if (dotFootprint < 2.5) {
        #if DOT_FILTER == 3
        dotFiltered = ledSupersample(map, dotCells, dotDx, dotDy);
        #else
        ledArea(map, dotCells, dotPixel, dotFiltered, dotFlat);
        #endif
        dotFiltered = mix(dotFiltered, dotMean, smoothstep(1.75, 2.5, dotFootprint));
        dotFlat = mix(dotFlat, dotMean, smoothstep(1.75, 2.5, dotFootprint));
    }
    #if DOT_FILTER == 2
    dotFiltered = ledLod(dotFiltered, dotFlat, dotCells, dotPixel, dotFootprint);
    #endif
    dotEmit = dotFiltered;
    #endif
    // Visible scatter stays close to each stroke, with dark space around the word.
    // The cover's reflection should not turn it into a wash across the window.
    vec2 dotHaloUv = vec2((dotSource - dotReadCell.x + dotCells.x) / dotStrip, dotCells.y / dotSize.y);
    vec2 dotHaloStep = 1.0 / vec2(dotStrip, dotSize.y);
    vec3 dotHalo = vec3(0.0);
    // Two small rings with a smooth falloff; no wide wash behind the whole word.
    for (int i = 0; i < 6; i++) {
        float dotTurn = 1.0471976 * float(i);
        vec2 dotTap = vec2(cos(dotTurn), sin(dotTurn)) * dotHaloStep;
        vec2 dotSkew = vec2(cos(dotTurn + .5236), sin(dotTurn + .5236)) * dotHaloStep;
        dotHalo += textureLod(map, dotHaloUv + dotTap * 2.0, max(1.0, dotLod)).rgb * .046
            + textureLod(map, dotHaloUv + dotSkew * 4.8, max(1.9, dotLod)).rgb * .044;
    }
    dotHalo = pow(dotHalo, vec3(1.6)) * 1.5;
    // Scatter follows the columns as they load and the supply as it falls.
    dotHalo *= step(dotSource, dotStrip - .5) * (1.0 - smoothstep(-4.0, 4.0, dotCells.x - dotDrive.y * dotSize.x));
    dotHalo = max(dotHalo, vec3(dotDrive.z * .06, 0.0, 0.0)) * dotDrive.w;
    dotEmit += (dotInkWord * dotHalo.r + dotInkLegend * dotHalo.g + dotInkWarning * dotHalo.b) * .60;
    vec3 dotWindow = vec3(.0028) + dotInkLegend * .0007;
    vec4 sampledDiffuseColor = vec4(dotWindow * (1.0 + 1.2 * mix(.4, dotLens, dotResolved) * dotInside) + dotEmit * max(dotDrive.x, 0.0), 1.0);
    diffuseColor *= sampledDiffuseColor;
    #endif
`;
