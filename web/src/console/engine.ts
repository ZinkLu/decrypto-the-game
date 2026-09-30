import { translate, type Locale } from './i18n';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import dracoWasmUrl from 'three/examples/jsm/libs/draco/gltf/draco_decoder.wasm?url';
import dracoWrapperUrl from 'three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js?url';
import type { Content, Target } from './paint';
import type { CrtSoundEvent } from './crtSound';
import type { DotFilter } from './dotFiltering';
import { crtProfile, crtHeight, crtDisplayUv } from './crt';
import { consoleHardware, type HardwareState, type KeyDiskState } from './model';
import { ConsoleInstruments } from './instruments';
import type { ConsoleSound } from './sound';
import { qualityProfiles, ambientRate, type QualityProfile } from './quality';
import { mergeRects, partialFrame, rectFromNdc, stillAfterFullFrame, type Rect } from './partialFrame';
import { handleSurfaces, type HandleSide } from './view';
import { Chassis, Effect, type Surface } from './parts/chassis';
import { DiskDrive } from './parts/diskDrive';
import { Displays } from './parts/displays';
import { fitCrystal } from './parts/glass';
import { Keys } from './parts/keys';
import { Lamps } from './parts/lamps';
import { NixieBay } from './parts/nixies';
import { Oscilloscope } from './parts/oscilloscope';
import { Printer } from './parts/printer';
import { RearPanel } from './parts/rearPanel';
import { RosterRack } from './parts/roster';
import { ScoreRegister } from './parts/scoreRegister';
import { Studio } from './parts/studio';
import { Viewpoint } from './parts/viewpoint';

export interface EngineHooks {
    /** Moves the DOM controls to where their parts are now. */
    project: () => void;
    fail: (message: string) => void;
    /** The paper is out far enough for the reader to open. */
    onPaperPull?: () => void;
    playSound?: (cue: ConsoleSound) => void;
    setPaperFeed?: (moving: boolean) => void;
    playCrt?: (event: CrtSoundEvent) => void;
    /** The preview page, where the machine can be orbited and zoomed. */
    inspection?: boolean;
    /** Development bench: also load the instruments kept for comparison. */
    instrumentPreview?: boolean;
}

/**
 * Draws the machine. The engine owns the renderer, the model and the frame
 * loop; every assembly in `parts/` keeps its own state and reports what its
 * frame did, so that a still machine costs nothing.
 */
export class ConsoleEngine {
    private renderer: THREE.WebGLRenderer;
    private scene = new THREE.Scene();
    private view: Viewpoint;
    private studio: Studio;
    private chassis: Chassis;
    private displays: Displays;
    private scope = new Oscilloscope();
    private lamps = new Lamps();
    private nixies = new NixieBay();
    private keys = new Keys();
    private rear = new RearPanel();
    private printer: Printer;
    private disk: DiskDrive;
    private roster: RosterRack;
    private score: ScoreRegister;
    private instruments?: ConsoleInstruments;
    private content?: Content;
    private local?: HardwareState;
    private locale: Locale = 'zh';
    private powered = true;
    private quality: QualityProfile = qualityProfiles.high;
    private observer: ResizeObserver;
    private raf = 0;
    private sleep = 0;
    private disposed = false;
    private last = 0;
    private dirty = true;
    private rendered = 0;
    private ambientOwed = false;
    private scopeDrawn = 0;
    // Ambient frames redraw only their moving regions, over a copy of the last
    // full frame. The copy and the regions live and die together; anything that
    // can change the picture invalidates both.
    private stillTexture?: THREE.FramebufferTexture;
    private stillRects?: Rect[];
    private stillSize = { width: 0, height: 0 };
    private stillScene?: THREE.Scene;
    private stillQuad?: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    private stillCamera = new THREE.OrthographicCamera();
    private partialFailed = false;
    private partialChecked = false;
    private partialMismatch = 0;
    private fullFrames = 0;
    private partialFrames = 0;
    private partialVerify = import.meta.env.DEV && new URLSearchParams(location.search).get('partial') === 'verify';
    private partialOn = !(import.meta.env.DEV && new URLSearchParams(location.search).get('partial') === 'off');
    // Ambient frames slow down while nobody is at the console (`ambientRate`).
    private lastInput = performance.now();
    private focused = document.hasFocus();
    private probing?: { warm: number; done: (cost: number) => void };
    private frames = 0;
    private framesSince = performance.now();
    private boundsEye = new THREE.Vector3();
    private boundsPoint = new THREE.Vector3();
    private reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    private motionRate = import.meta.env.DEV && new URLSearchParams(location.search).get('motion') === 'slow' ? .2 : 1;
    private draco = new DRACOLoader().setDecoderPath({ js: dracoWrapperUrl, wasm: dracoWasmUrl }).setWorkerLimit(2);
    private onContextLost = (e: Event) => { e.preventDefault(); this.hooks.fail(translate(this.locale, '图形连接已中断，请刷新终端。')); };
    private onInput = () => { this.lastInput = performance.now(); this.wake(); };
    private onFocus = () => { this.focused = true; this.lastInput = performance.now(); this.wake(); };
    private onBlur = () => { this.focused = false; };
    /** Anything that can change the machine asks for a frame; a still machine sleeps between ambient frames. */
    private wake = () => {
        if (this.disposed) return;
        clearTimeout(this.sleep);
        this.sleep = 0;
        if (!this.raf) this.raf = requestAnimationFrame(this.tick);
    };

    constructor(private host: HTMLElement, private hooks: EngineHooks) {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.04;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.autoUpdate = false;
        this.renderer.shadowMap.needsUpdate = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        this.renderer.domElement.setAttribute('aria-hidden', 'true');
        this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
        host.prepend(this.renderer.domElement);
        for (const type of ['pointerdown', 'pointermove', 'keydown', 'wheel'] as const)
            window.addEventListener(type, this.onInput, { capture: true, passive: true });
        window.addEventListener('focus', this.onFocus);
        window.addEventListener('blur', this.onBlur);
        const play = (cue: ConsoleSound) => hooks.playSound?.(cue);
        this.view = new Viewpoint(host, this.scene, !!hooks.inspection);
        this.studio = new Studio(this.scene, this.renderer);
        this.chassis = new Chassis(this.view.root, this.renderer.capabilities.getMaxAnisotropy(), () => { this.dirty = true; });
        this.displays = new Displays(this.chassis, host, event => hooks.playCrt?.(event));
        this.printer = new Printer(host, { onPull: () => hooks.onPaperPull?.(), play, setFeed: moving => hooks.setPaperFeed?.(moving) });
        this.disk = new DiskDrive(host, play);
        this.roster = new RosterRack(this.chassis);
        this.score = new ScoreRegister(play);
        this.observer = new ResizeObserver(() => this.resize());
        this.observer.observe(host);
        if (this.partialVerify) this.renderer.domElement.dataset.partialMismatch = '0';
        this.applyQuality();
        this.wake();
    }

    async load() {
        // Geometry and projected labels must always share a revision, including
        // on servers that allow the browser to reuse previously cached assets.
        const revision = 'console-encrypto-20260929-v1';
        const [gltf, response] = await Promise.all([
            new GLTFLoader().setDRACOLoader(this.draco).loadAsync(`/models/decrypto-console.glb?v=${revision}`),
            fetch(`/models/console-surfaces.json?v=${revision}`),
        ]);
        if (!response.ok)
            throw new Error('终端面板配置载入失败。');
        const surfaces = await response.json() as Record<string, Surface>;
        if (this.disposed) {
            this.disposeObject(gltf.scene);
            return;
        }
        const chassis = this.chassis;
        chassis.install(gltf.scene, {
            ...surfaces,
            ...handleSurfaces,
            batteryControl: { x: -3.4, y: .62, z: -3.66, w: 5.6, h: 4.2, rotationY: Math.PI },
            testControl: { x: -.05, y: -2.76, z: -3.27, w: .70, h: .70, rotationY: Math.PI },
        });
        // Every part finds its assemblies by name and claims the ones that move;
        // what nobody claims is merged into the static chassis below.
        this.displays.install();
        if (!this.disk.install(chassis) || !this.scope.install(chassis)) throw new Error('终端机械组件不完整。');
        if (!this.rear.install(chassis)) throw new Error('电池仓组件不完整。');
        this.lamps.install(chassis);
        if (!this.keys.install(chassis)) throw new Error('电源开关组件不完整。');
        this.nixies.install(chassis);
        fitCrystal(chassis.part('SignalGlass'));
        this.printer.install(chassis, this.content?.paperRecords ?? 0);
        this.roster.install();
        this.score.install(chassis);
        if (!await this.installInstruments()) return;
        chassis.batch();
        this.renderer.shadowMap.needsUpdate = true;
        this.scope.mount(chassis);
        if (this.content && this.local) this.update(this.content, this.local);
        this.applyQuality();
    }

    /** Returns false when the engine was disposed of while the bench models loaded. */
    private async installInstruments() {
        const chassis = this.chassis, model = chassis.model!;
        // The receiver is part of the shipped console model, including its controls.
        const receiver = chassis.part('Instrument_signal');
        if (!receiver) throw new Error('Missing production receiver');
        const instruments = new THREE.Group();
        instruments.name = 'ConsoleInstruments';
        model.add(instruments);
        model.updateWorldMatrix(true, true);
        instruments.attach(receiver);
        let original: THREE.Group | undefined;
        if (import.meta.env.DEV && this.hooks.instrumentPreview) {
            const loader = new GLTFLoader().setDRACOLoader(this.draco);
            const [studies, vu] = await Promise.all([
                loader.loadAsync('/models/instrument-studies.glb?v=20260918-5'),
                loader.loadAsync('/models/instrument-vu.glb?v=20260918-1'),
            ]);
            if (this.disposed) { this.disposeObject(studies.scene); this.disposeObject(vu.scene); return false; }
            // Compare the same production receiver against the archived alternatives.
            studies.scene.getObjectByName('Instrument_signal')?.removeFromParent();
            studies.scene.position.set(5.83, -1.4, 0);
            original = vu.scene;
            original.name = 'InstrumentOriginal';
            instruments.add(studies.scene, original);
        }
        this.instruments = new ConsoleInstruments(instruments, original);
        chassis.claim(instruments);
        // The perpetually swinging needle and knob pointers of the first meter.
        for (const name of ['ReceiverNeedle', 'MeterAmplitude', 'MeterRate']) chassis.moving(name, { merge: true, shadowless: true });
        return true;
    }

    update(content: Content, local: HardwareState) {
        this.dirty = true;
        this.wake();
        this.chassis.hash(Object.values(content.frames).map(frame => frame.canvas));
        const powered = consoleHardware(local).powered, reduced = this.reduced.matches;
        const previous = this.content;
        const resuming = content.connected && !previous?.connected;
        const traffic = content.connected && content.trafficKey !== previous?.trafficKey;
        if (this.powered !== powered || previous?.waiting !== content.waiting) this.scope.clear();
        this.content = content;
        this.local = local;
        this.locale = local.locale;
        this.powered = powered;
        this.nixies.show(content.roomCode);
        this.keys.update(local.powerOn, local.manual);
        this.displays.update(content, powered, local.wordDisplay, reduced);
        this.lamps.update(powered, local.unpluggedCables, content.connected, traffic);
        this.view.face(local.backView);
        this.view.blocked = local.archiveOpen;
        this.rear.update(local);
        this.instruments?.update(local);
        this.roster.update(content);
        this.printer.sync(local.archiveOpen, content.paperRecords, powered);
        this.setKeyDisk(local.keyDisk);
        this.scope.update(local);
        for (const [name, frame] of Object.entries(content.frames)) {
            // Tubes, cards and plaques take a new picture once the old one is out of sight.
            if (this.displays.has(name) || name === 'screen' || this.roster.owns(name)) continue;
            this.chassis.print(name, frame);
        }
        this.printer.thread(this.chassis.textures.get('paper'));
        this.lamps.sync(performance.now());
        this.score.update(content.scoreFlags, powered, resuming);
        this.hooks.project();
    }

    /** Review only: keep the same frame and supply while exchanging its filter. */
    setDotFilter(filter: DotFilter) {
        this.displays.setFilter(filter);
        this.wake();
    }
    testLamps() {
        if (!this.lamps.selfTest()) return;
        this.dirty = true;
        this.wake();
    }
    pulse(id: string) {
        this.keys.pulse(id);
        this.wake();
    }
    setKeyDisk(disk: KeyDiskState) {
        if (this.local) this.local = { ...this.local, keyDisk: disk };
        this.disk.set(disk);
        // Whoever moved the disk places its grip as well.
        if (this.apply(this.disk.tick(performance.now(), this.reduced.matches) & ~Effect.projects)) this.dirty = true;
        this.wake();
    }
    setQuality(profile: QualityProfile) {
        if (profile === this.quality) return;
        this.quality = profile;
        this.applyQuality();
    }
    /**
     * Ambient frames redraw only their moving regions instead of the whole
     * canvas. The runtime switch lets the power probe compare both settings on
     * one page; turning it on starts over with a full frame and a fresh copy.
     */
    get partialRedraw() { return this.partialOn; }
    set partialRedraw(on: boolean) {
        if (on && !this.partialOn) this.invalidateStill();
        this.partialOn = on;
    }
    private applyQuality() {
        const quality = this.quality;
        this.invalidateStill();
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio));
        this.studio.applyQuality(quality);
        this.displays.applyQuality(quality.screenGlass, quality.crtOptics === 'lite');
        this.nixies.applyQuality(quality.nixieCover);
        this.renderer.shadowMap.needsUpdate = true;
        // Also reprojects the DOM inputs, whose mapping follows the optics.
        this.resize();
    }
    /** Cost in ms of one frame at the current quality, measured once `warm` frames have settled the pipelines. */
    probe(warm = 8) {
        this.probing?.done(NaN);
        this.invalidateStill();
        const cost = new Promise<number>(done => { this.probing = { warm, done }; });
        this.wake();
        return cost;
    }
    /**
     * Reading a pixel back makes the GPU's share of a frame count, whatever
     * rate the display or a power saver paces frames at. Frames run back to
     * back for a quarter second because an idle GPU clocks down and stretches
     * its frames (an M4 Max read 8 ms for a 5 ms frame after 120 ms, and the
     * true cost after 250); the settled half shows what the device sustains.
     * The pause follows the much longer stall of the first compiled frame.
     */
    private frameCost() {
        this.invalidateStill();
        const gl = this.renderer.getContext(), pixel = new Uint8Array(4), costs: number[] = [];
        const deadline = performance.now() + 250;
        do {
            const started = performance.now();
            this.renderer.render(this.scene, this.view.camera);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            costs.push(performance.now() - started);
        } while (costs.length < 2 || performance.now() < deadline);
        const settled = costs.slice(costs.length >> 1).sort((a, b) => a - b);
        return settled[settled.length >> 1];
    }

    inspectInstrument(closeup: boolean) { this.inspectDetail(closeup ? 'meter' : null); }
    inspectWordScale(scale: number) { this.inspectDetail('words', scale); }
    inspectDetail(detail: string | null, wordScale?: number) {
        this.view.inspect(detail, wordScale);
        this.resize();
    }
    facingRear() { return this.view.facingRear(); }
    beginHandle(side: HandleSide) {
        if (!this.view.beginHandle(side)) return false;
        this.wake();
        return true;
    }
    pullHandle(progress: number) { this.view.pullHandle(progress); this.wake(); }
    releaseHandle() { this.view.releaseHandle(); this.wake(); }
    turnTo(back: boolean, side: HandleSide = 'left') {
        if (this.local) this.local = { ...this.local, backView: back };
        this.view.turnTo(back, side);
        this.wake();
    }
    resetInspection() { this.view.reset(); this.wake(); }
    diskPullAxis() { return this.disk.pullAxis(this.view.camera, this.view.width, this.view.height); }

    private resize() {
        const width = this.host.clientWidth, height = this.host.clientHeight;
        this.invalidateStill();
        this.renderer.setSize(width, height, false);
        this.view.fit(width, height, this.chassis.surfaces);
        this.dirty = true;
        this.wake();
        this.hooks.project();
        // ResizeObserver fires after the frame's draw; repaint the cleared canvas.
        if (width > 0 && height > 0) this.renderer.render(this.scene, this.view.camera);
    }

    /** Where a target painted on a surface is on screen now, or null while it cannot be reached. */
    bounds(target: Target) {
        if (target.surface === 'screen' && !this.displays.interactive) return null;
        if (!this.view.settled) return null;
        const { camera, width, height } = this.view;
        const frame = target.surface in handleSurfaces ? { width: 1, height: 1 } : this.content?.frames[target.surface];
        const plane = this.chassis.planes.get(target.surface);
        const surface = this.chassis.surfaces[target.surface];
        if (!frame || !plane || !surface)
            return null;
        plane.updateWorldMatrix(true, false);
        const curvature = crtProfile(target.surface);
        const eye = plane.worldToLocal(camera.getWorldPosition(this.boundsEye));
        // DOM targets do not participate in depth testing. Cull the opposite
        // face and edge-on surfaces before they can intercept visible hardware.
        if (eye.z / eye.length() < .18) return null;
        // Include edge midpoints: a convex display's projected bounds can extend
        // beyond its four corners. Invert raster warp before sampling the face.
        const point = this.boundsPoint;
        let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
        const include = () => {
            point.project(camera);
            const sx = (point.x + 1) * width / 2, sy = (1 - point.y) * height / 2;
            if (sx < left) left = sx;
            if (sx > right) right = sx;
            if (sy < top) top = sy;
            if (sy > bottom) bottom = sy;
        };
        for (const fy of [0, .5, 1]) for (const fx of [0, .5, 1]) {
            const u = (target.x + target.w * fx) / frame.width;
            const v = 1 - (target.y + target.h * fy) / frame.height;
            const uv = curvature ? crtDisplayUv(u, v, surface.w, surface.h, curvature, eye, this.quality.crtOptics === 'full') : { u, v };
            point.set((uv.u - .5) * surface.w, (uv.v - .5) * surface.h,
                curvature ? crtHeight(uv.u, uv.v, curvature.rise) : 0)
                .applyMatrix4(plane.matrixWorld);
            include();
        }
        // Extend the grip to the physical disk as it emerges from the fascia.
        if (target.id === 'disk-toggle' && this.disk.out) this.disk.grip(point, include);
        return { left, top, width: right - left, height: bottom - top };
    }

    /** Carries out what a part's frame asked for. Returns whether the picture has to be drawn. */
    private apply(effect: number) {
        if (effect & Effect.casts) this.renderer.shadowMap.needsUpdate = true;
        if (effect & Effect.projects) this.hooks.project();
        return !!(effect & Effect.redraw);
    }

    /** The copy of the last full frame no longer matches what the machine would draw now. */
    private invalidateStill() {
        this.stillRects = undefined;
    }

    /**
     * The canvas rectangles of everything the parts register as moving in
     * ambient frames, from the camera of the frame just drawn. Camera, view and
     * poses cannot drift while the copy is valid: any of those draws a full
     * frame and drops the copy, so the rectangles are worked out once per copy.
     */
    private ambientRects() {
        const objects = [
            ...this.displays.ambientRegions(),
            ...this.nixies.ambientRegions(),
            ...this.lamps.ambientRegions(),
            ...this.instruments?.ambientRegions() ?? [],
        ];
        const { camera, width, height } = this.view, corner = new THREE.Vector3();
        const rects: Rect[] = [];
        for (const object of objects) {
            object.updateWorldMatrix(true, true);
            const corners: [number, number, number][] = [];
            object.traverse(mesh => {
                if (!(mesh instanceof THREE.Mesh)) return;
                mesh.geometry.computeBoundingBox();
                const box = mesh.geometry.boundingBox!;
                for (let i = 0; i < 8; i++) {
                    corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)
                        .applyMatrix4(mesh.matrixWorld).project(camera);
                    corners.push([corner.x, corner.y, corner.z]);
                }
            });
            const rect = rectFromNdc(corners, width, height, 6);
            if (rect) rects.push(rect);
        }
        return mergeRects(rects);
    }

    /**
     * Copies the frame just drawn, for the partial frames that follow while the
     * picture stands still. The copy must happen in the same task as the draw:
     * the drawing buffer is not preserved once the frame is presented. If the
     * copy fails (some browsers refuse RGB into RGBA), partial frames turn off
     * for the page rather than risk a wrong picture.
     */
    private captureStill() {
        const renderer = this.renderer, size = renderer.getDrawingBufferSize(new THREE.Vector2());
        if (!this.stillScene) {
            // The copy holds tone-mapped, sRGB-encoded bytes; a raw shader puts it back unchanged.
            const material = new THREE.ShaderMaterial({
                uniforms: { map: { value: null } }, depthTest: false, depthWrite: false,
                vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
                fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main() { gl_FragColor = texture2D(map, vUv); }',
            });
            const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
            quad.frustumCulled = false;
            this.stillQuad = quad;
            this.stillScene = new THREE.Scene().add(quad);
        }
        if (!this.stillTexture || this.stillSize.width !== size.x || this.stillSize.height !== size.y) {
            this.stillTexture?.dispose();
            this.stillTexture = new THREE.FramebufferTexture(size.x, size.y);
            this.stillSize = { width: size.x, height: size.y };
            this.stillQuad!.material.uniforms.map.value = this.stillTexture;
        }
        renderer.copyFramebufferToTexture(this.stillTexture);
        if (renderer.getContext().getError() !== 0) {
            this.stillTexture.dispose();
            this.stillTexture = undefined;
            this.stillSize = { width: 0, height: 0 };
            this.partialFailed = true;
            if (import.meta.env.DEV) console.warn('Partial redraw disabled for this page: copying a full frame to a texture failed.');
            return;
        }
        this.stillRects = this.ambientRects();
    }

    /**
     * An ambient frame: the still goes back, then the scene renders once more,
     * but only the registered regions survive the depth mask, so nothing else
     * is shaded. Depth starts at 0 everywhere (nothing passes); inside each
     * rectangle it is cleared back to 1, where the full scene draws as usual.
     */
    private drawPartial() {
        const renderer = this.renderer, depth = renderer.state.buffers.depth;
        renderer.autoClear = false;
        renderer.setScissorTest(false);
        depth.setClear(0); renderer.clear(true, true, true); depth.setClear(1);
        renderer.render(this.stillScene!, this.stillCamera);
        renderer.setScissorTest(true);
        for (const [x0, y0, x1, y1] of this.stillRects!) {
            renderer.setScissor(x0, y0, x1 - x0, y1 - y0);
            renderer.clear(false, true, false);
        }
        renderer.setScissorTest(false);
        // A colour background makes three clear before every render, whatever
        // autoClear says; the flags keep the still and the depth mask intact.
        renderer.autoClearColor = renderer.autoClearDepth = renderer.autoClearStencil = false;
        renderer.render(this.scene, this.view.camera);
        renderer.autoClearColor = renderer.autoClearDepth = renderer.autoClearStencil = true;
        renderer.autoClear = true;
    }

    /**
     * Reads the partial frame back and compares it with a full frame of the
     * same state. Returns the differing pixel count and their bounding box.
     */
    private compareWithFullFrame() {
        const renderer = this.renderer, gl = renderer.getContext(), { x: width, y: height } = renderer.getDrawingBufferSize(new THREE.Vector2());
        const read = () => { const pixels = new Uint8Array(width * height * 4); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels; };
        const partial = read();
        renderer.render(this.scene, this.view.camera);
        const full = read();
        let count = 0, x0 = width, y0 = height, x1 = -1, y1 = -1;
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            if (partial[i] !== full[i] || partial[i + 1] !== full[i + 1] || partial[i + 2] !== full[i + 2]) {
                count++;
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
        return { count, box: [x0, y0, x1, y1] as const };
    }

    /** DEV `?partial=verify`: every partial frame must equal a full frame of the same state, pixel for pixel. */
    private verifyPartial() {
        const { count, box } = this.compareWithFullFrame();
        if (count) {
            this.partialMismatch += count;
            this.renderer.domElement.dataset.partialMismatch = String(this.partialMismatch);
            console.warn(`Partial frame mismatch: ${count} pixels differ from a full frame, inside (${box[0]}, ${box[1]})-(${box[2]}, ${box[3]}).`);
        }
    }

    /**
     * The first partial frame of a page proves the path on this browser: if a
     * partial frame cannot be told from a full one there, partial frames turn
     * off for the page rather than risk a wrong picture. Some browsers
     * (Firefox) are not bit-stable between two renders of the same state, so
     * they stay on full frames.
     */
    private selfCheckPartial() {
        this.partialChecked = true;
        const { count, box } = this.compareWithFullFrame();
        if (count) {
            this.partialFailed = true;
            this.invalidateStill();
            if (import.meta.env.DEV)
                console.warn(`Partial redraw disabled for this page: a partial frame differed from a full frame at ${count} pixels, inside (${box[0]}, ${box[1]})-(${box[2]}, ${box[3]}).`);
        }
    }

    private tick = (now: number) => {
        this.raf = 0;
        if (this.disposed)
            return;
        if (document.hidden || now - this.last < 16) {
            this.raf = requestAnimationFrame(this.tick);
            return;
        }
        const dt = Math.min((now - this.last) / 1000, .1);
        this.last = now;
        const reduced = this.reduced.matches, paced = dt * this.motionRate;
        let effect = this.displays.tick(now, paced, reduced);
        effect |= this.view.tickOrbit(dt, reduced);
        if (this.studio.clear(this.view.swing, this.view.tilt)) effect |= Effect.project | Effect.shadow;
        effect |= this.view.tickFlip(dt, reduced);
        effect |= this.keys.tick(now, dt, reduced);
        effect |= this.printer.tick(paced, reduced, this.powered);
        const instruments = this.instruments?.tick(now, dt, reduced);
        if (instruments === 'control') effect |= Effect.redraw;
        else if (instruments === 'needle') effect |= Effect.ambient;
        effect |= this.rear.tick(dt, reduced);
        effect |= this.roster.tick(paced, reduced);
        effect |= this.score.tick(paced, reduced);
        if (this.lamps.sync(now)) effect |= Effect.redraw;
        effect |= this.disk.tick(now, reduced);
        effect |= this.scope.tick(dt, reduced);
        const changed = this.apply(effect);
        const live = this.powered && !reduced;
        // Power-on keeps the CRT raster, scope and needle alive. Frames that
        // carry nothing else are ambient, paced by the quality level and slower
        // still while nobody is at the console; any state the player changed
        // (`dirty`, `changed`) renders at once. A stage without a size (the
        // phone layout hides it) renders nothing.
        const probing = this.probing;
        // A paced-out needle movement stays owed, so its resting pose is drawn.
        this.ambientOwed ||= !!(effect & Effect.ambient);
        const visible = this.view.width > 0 && this.view.height > 0;
        const pace = ambientRate(this.quality, this.focused, now - this.lastInput);
        const dirty = this.dirty;
        const due = visible && (changed || dirty || !!probing ||
            (live || this.ambientOwed) && now - this.rendered >= 1000 / pace - 2);
        if (due && this.view.frontInView && (live || dirty)) {
            // The beam runs for all the time since the phosphor was last shown.
            // Unpowered, the tube keeps its last trace while it collapses; dark glass shows no picture at all.
            const exposure = Math.min((now - this.scopeDrawn) / 1000, .1);
            if (this.powered) {
                this.scope.draw(exposure, reduced);
                this.lamps.lock(this.scope.coherence, exposure, reduced);
            }
            this.scopeDrawn = now;
        }
        this.nixies.breathe(now, reduced);
        if (due) {
            this.dirty = this.ambientOwed = false;
            this.rendered = now;
            // The rear of the machine has no ambient motion: a frame that is due
            // only by the ambient pace draws nothing while the back faces forward.
            if (!changed && !dirty && !probing && !this.view.frontInView) {
                // Owed to no one: the front's first frame back is a full one anyway.
            } else if (partialFrame({ enabled: this.partialOn && !this.partialFailed, stillValid: !!this.stillRects,
                changed, dirty, probing: !!probing,
                // No shadow-casting light (the low level) means no shadow map is
                // pending either: three leaves needsUpdate set when there is
                // nothing to render, and it would force full frames forever.
                shadowPending: this.renderer.shadowMap.needsUpdate && this.quality.shadows })) {
                this.frames++;
                this.partialFrames++;
                this.drawPartial();
                if (this.partialVerify) this.verifyPartial();
                else if (!this.partialChecked) this.selfCheckPartial();
            } else {
                this.frames++;
                this.fullFrames++;
                this.renderer.render(this.scene, this.view.camera);
                // Only a picture that is about to stand still is copied, once per
                // stop; interaction frames never pay for the copy.
                if (!this.partialFailed && this.partialOn && stillAfterFullFrame(changed, !!probing)) this.captureStill();
                else this.invalidateStill();
            }
            if (probing && probing.warm-- <= 0) {
                this.probing = undefined;
                probing.done(this.frameCost());
            }
        }
        if (import.meta.env.DEV && now - this.framesSince >= 750) {
            this.renderer.domElement.dataset.scopeFps = (this.frames * 1000 / (now - this.framesSince)).toFixed(1);
            this.renderer.domElement.dataset.drawCalls = String(this.renderer.info.render.calls);
            this.renderer.domElement.dataset.triangles = String(this.renderer.info.render.triangles);
            this.renderer.domElement.dataset.face = this.view.rear ? 'rear' : 'front';
            this.renderer.domElement.dataset.ambientPace = String(pace);
            this.renderer.domElement.dataset.fullFrames = String(this.fullFrames);
            this.renderer.domElement.dataset.partialFrames = String(this.partialFrames);
            this.frames = 0;
            this.framesSince = now;
        }
        // Motion, a change still to draw or a measurement: every display frame.
        // Otherwise sleep until just before the next ambient frame or lamp
        // timeout; input and every public call wake the loop at once.
        if (this.raf) return;
        if (changed || visible && (this.dirty || !!this.probing)) {
            this.raf = requestAnimationFrame(this.tick);
            return;
        }
        const next = Math.min(visible && (live || this.ambientOwed) ? this.rendered + 1000 / pace - 2 : Infinity,
            ...this.lamps.deadlines(now), now + 500);
        // A frame request must land in the display interval before the one that is due.
        clearTimeout(this.sleep);
        this.sleep = window.setTimeout(this.wake, Math.max(0, next - performance.now() - 12));
    };

    private disposeObject(object: THREE.Object3D) { object.traverse(o => { if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
            m.dispose();
    } }); }
    dispose() {
        this.disposed = true;
        this.probing?.done(NaN);
        this.probing = undefined;
        cancelAnimationFrame(this.raf);
        clearTimeout(this.sleep);
        this.observer.disconnect();
        this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
        for (const type of ['pointerdown', 'pointermove', 'keydown', 'wheel'] as const)
            window.removeEventListener(type, this.onInput, true);
        window.removeEventListener('focus', this.onFocus);
        window.removeEventListener('blur', this.onBlur);
        this.view.dispose();
        this.displays.dispose();
        this.disposeObject(this.scene);
        this.stillTexture?.dispose();
        if (this.stillQuad) {
            this.stillQuad.geometry.dispose();
            this.stillQuad.material.dispose();
        }
        for (const texture of this.chassis.textures.values())
            texture.dispose();
        this.studio.dispose();
        this.draco.dispose();
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
