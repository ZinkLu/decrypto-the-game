import * as THREE from 'three';
import { crtOpticsShader } from './crt';
import type { CrtKind } from './crtMotion';

export interface CrtUniforms {
    scan: { value: THREE.Vector4 };
    light: { value: THREE.Vector4 };
    trail: { value: THREE.Vector4 };
}
export const crtUniforms = (): CrtUniforms => ({
    scan: { value: new THREE.Vector4(1, 1, 0, .004) },
    light: { value: new THREE.Vector4(1, 0, 1, 0) },
    trail: { value: new THREE.Vector4(0, 0, 0, 0) },
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
}

/** The picture tube's fragment stage: optics, raster, and the beam the tube state describes. */
export function shadeCrt(material: THREE.Material, options: Options) {
    const look = looks[options.kind];
    material.onBeforeCompile = shader => {
        const { curvature, size } = options;
        Object.assign(shader.uniforms, {
            crtTime: options.time, crtScan: options.tube.scan, crtLight: options.tube.light, crtTrail: options.tube.trail,
            crtHot: { value: new THREE.Vector3(...look.hot) }, crtAfter: { value: new THREE.Vector3(...look.after) },
            crtFlood: { value: look.flood }, crtSpot: { value: options.spot },
            crtProfile: { value: look.profile }, crtSeed: { value: options.seed },
            crtCurve: { value: curvature.warp }, crtAspect: { value: size.x / size.y },
            crtEye: options.eye, crtSize: { value: size },
            crtRise: { value: curvature.rise }, crtInnerRise: { value: curvature.innerRise }, crtDepth: { value: curvature.depth },
        });
        shader.fragmentShader = (options.lite() ? '#define CRT_LITE\n' : '') + crtOpticsShader + crtTubeShader + shader.fragmentShader
            .replace('#include <map_fragment>', crtPictureShader)
            .replace('#include <dithering_fragment>', crtRasterShader);
    };
    material.customProgramCacheKey = () => `console-crt-tube-v1-${options.kind}-${options.lite() ? 'lite' : 'full'}`;
}

const crtTubeShader = `
    uniform float crtTime;
    uniform vec4 crtScan;
    uniform vec4 crtLight;
    uniform vec4 crtTrail;
    uniform vec3 crtHot;
    uniform vec3 crtAfter;
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
    vec3 crtTube = crtProfile > .5 && crtProfile < 1.5 ? vec3(.004, .0007, .0004) : vec3(.002, .004, .004);
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
        gl_FragColor.rgb += vec3(.16, .035, .018) * crtTear * crtGlowing * crtPicture;
        gl_FragColor.rgb += (crtNoise - .5) * (.055 + .16 * crtUnstable) * crtBurst * crtGlowing * crtPicture;
    }
    #endif
`;
