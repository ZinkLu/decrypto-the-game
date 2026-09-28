import { translate, type Locale } from './i18n';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import dracoWasmUrl from 'three/examples/jsm/libs/draco/gltf/draco_decoder.wasm?url';
import dracoWrapperUrl from 'three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js?url';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { crtFinish, screenBackground, type Blink, type Content, type Frame, type Target } from './paint';
import { RosterMotion, rosterPose } from './rosterMotion';
import { CrtMotion, crtRestSpot, type CrtKind } from './crtMotion';
import { CrtSoundMotion, type CrtSoundEvent } from './crtSound';
import { shadeCrt, crtUniforms, dotUniforms, dotInks, terminalUniforms, terminalRows, type CrtUniforms, type DotUniforms } from './crtShader';
import { DotBank, DotDriver, dotGrid, type WordDisplay } from './dotMatrix';
import { defaultDotFilter, type DotFilter } from './dotFiltering';
import { plateFinish } from './finishes';
import { ScoreFlagMotion } from './scoreFlagMotion';
import scoreRegisterSpec from './scoreRegister.json';
import { crtProfile, crtGeometry, crtHeight, crtDisplayUv } from './crt';
import { consoleHardware, initialLocal, scopeModes, scopeWaveBlend, scopeRatio, scopeSweepHz, scopeTimebase, scopeAxisAngle, scopeFigures, type HardwareState, type KeyDiskState } from './model';
import { VectorMonitor, scopeResonance, scopeTuning } from './scope';
import { paperTooth, paperTextureLength, receiptHeadPath, diskSeatTravel, diskEjectedTravel, keyDiskPose } from './mechanics';
import { ReceiptTransport, paperStillFrame } from './tearing';
import { ConsoleInstruments } from './instruments';
import type { ConsoleSound } from './sound';
import { qualityProfiles, ambientRate, type QualityProfile } from './quality';
import { gameFraming, handleSurfaces, inspectionZoom, type HandleSide } from './view';

type TubeFrame = { id: string; frame?: Frame; palette?: Content['wordTube'] };
interface Surface {
    x: number;
    y: number;
    z: number;
    w: number;
    h: number;
    rotationX?: number;
    rotationY?: number;
    lit?: boolean;
    digitScale?: number;
}
/** Canvas margin, in corona pixels, for the glow a Nixie throws beyond its cathode. */
const nixieHalo = 84;

export class ConsoleEngine {
    private renderer: THREE.WebGLRenderer;
    private scene = new THREE.Scene();
    private camera = new THREE.PerspectiveCamera(28, 1, .1, 150);
    private root = new THREE.Group();
    private turntable = new THREE.Group();
    private inspection = new THREE.Group();
    private inspectionYaw = 0;
    private inspectionPitch = 0;
    private inspectionTargetYaw = 0;
    private inspectionTargetPitch = 0;
    private inspectionDrag?: { pointerId: number; x: number; y: number };
    private zoom = 1;
    private zoomTarget = 1;
    private handleDrag?: number;
    private flipDirection = 1;
    private backView = false;
    private flipProgress = 0;
    private batteryOpen = false;
    private batteryAngle = 0;
    private batteryDoor = new THREE.Group() as THREE.Object3D;
    private soundOn = true;
    private musicOn = true;
    private powerOn = true;
    private switchOn = true;
    private networkLamps: THREE.MeshStandardMaterial[] = [];
    private connectionLamp?: THREE.MeshStandardMaterial;
    private indicatorColors = new Map<THREE.MeshStandardMaterial, THREE.Color>();
    private trafficUntil = 0;
    private powerSwitch?: THREE.Object3D;
    private copyKey?: THREE.Object3D;
    private copyKeyRestZ = 0;
    private powerAngle = 0;
    private poweredMaterials = new Map<THREE.MeshStandardMaterial, number>();
    private testUntil = 0;
    private testLamp?: THREE.Mesh;
    private surfaces: Record<string, Surface> = {};
    private planes = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial | THREE.MeshStandardMaterial>>();
    private textures = new Map<string, THREE.Texture>();
    private content?: Content;
    private model?: THREE.Group;
    private backdrop?: THREE.Mesh;
    private observer: ResizeObserver;
    private raf = 0;
    private sleep = 0;
    private disposed = false;
    private last = 0;
    private width = 1;
    private height = 1;
    private disk: THREE.Object3D = new THREE.Group();
    private ejectButton?: THREE.Object3D;
    private ejectButtonRest = new THREE.Vector3();
    private diskRest = new THREE.Vector3();
    private diskPivot = new THREE.Vector3();
    private diskPivotRotated = new THREE.Vector3();
    private diskAxis = new THREE.Vector3(0, 0, 1);
    private tuningKnob: THREE.Object3D = new THREE.Group();
    private waveKnob: THREE.Object3D = new THREE.Group();
    private rateKnob: THREE.Object3D = new THREE.Group();
    private persistenceKnob: THREE.Object3D = new THREE.Group();
    private diskOut = false;
    private diskTravel = diskSeatTravel;
    private keyDisk = initialLocal.keyDisk;
    private diskClunk = '';
    private screenPrivacyKey = '';
    private paper?: THREE.Mesh;
    private paperHead?: THREE.Mesh;
    private paperHeadArc: number[] = [];
    private paperRoller?: THREE.Object3D;
    private paperNipY = 0;
    private nixieDigits: { mesh: THREE.Mesh; slot: number; digit: number }[] = [];
    private nixieCoronas: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; material: THREE.MeshBasicMaterial; spill: THREE.MeshBasicMaterial; paths: string[]; code: string }[] = [];
    private crtTime = { value: 0 };
    // Every tube has its own supply tolerances, so no two come up or die alike.
    private crtTubes = new Map<string, { motion: CrtMotion<TubeFrame>; uniforms: CrtUniforms; printed?: Frame }>();
    private crtMotion = new CrtMotion<TubeFrame>();
    private crtSound = new CrtSoundMotion();
    // The main screen as a terminal: blinking cells, and new pages written out row by row.
    private terminal = terminalUniforms(screenBackground, 830 / 1400);
    private screenPage?: string;
    private screenSignal = '';
    private writeStarted = -Infinity;
    private writing = false;
    // The keyword windows can be fitted with dot-matrix modules instead of tubes.
    private wordDisplay: WordDisplay = initialLocal.wordDisplay;
    private dotFilter: DotFilter = defaultDotFilter;
    private wordReviewScale?: number;
    private dotModules = new Map<string, { driver: DotDriver; uniforms: DotUniforms; printed?: Frame }>();
    private dotBank = new DotBank<{ id: string; inks: Content['wordInks']; frames: Content['frames'] }>();
    private dotPrivacyKey = '';
    private rollerRest = new THREE.Quaternion();
    private receipt = new ReceiptTransport();
    private paperReaderStarted = false;
    private archiveOpen = false;
    private manual = false;
    private manualDepth = 0;
    private meterAngle = -.82;
    private meterAmplitude = initialLocal.meterAmplitude;
    private meterRate = initialLocal.meterRate;
    private instruments?: ConsoleInstruments;
    private instrumentVariant: HardwareState['instrumentVariant'] = initialLocal.instrumentVariant;
    private instrumentDemo = initialLocal.instrumentDemo;
    private detailOverride: string | null | undefined;
    private removedBatteries = 0;
    private unpluggedCables = 0;
    private removable = new Map<string, { object: THREE.Object3D; rest: THREE.Vector3; amount: number }>();
    private cableLeads = new Map<string, { mesh: THREE.Mesh; index: number }>();
    private rosterCards = new Map<string, { object: THREE.Object3D; rest: THREE.Vector3; travel: number;
        motion: RosterMotion<{ id: string; frame: Frame }>; printed?: Frame; materials: THREE.Material[] }>();
    private scoreFlags = new Map<string, { object: THREE.Object3D; motion: ScoreFlagMotion }>();
    private themePanels = new Map<string, { object: THREE.Group; rest: THREE.Vector3;
        motion: RosterMotion<{ id: string; frame: Frame; color: string }>; printed?: Frame;
        enamel: THREE.MeshStandardMaterial[];
        materials: { material: THREE.Material; opacity: number }[] }>();
    private scopeWave = initialLocal.scopeWave;
    private scopeWaveAngle = 0;
    private scopeWaveDesiredAngle = 0;
    private scopeAngle = 0;
    private scopeDesiredAngle = 0;
    private locale: Locale = 'zh';
    private scopeFreq = initialLocal.scopeFreq;
    private scopeRate = initialLocal.scopeRate;
    private scopeRateAngle = 0;
    private scopeRateDesiredAngle = 0;
    private scopeAxis = initialLocal.scopeAxis;
    private scopeAxisAngle = 0;
    private scopeAxisDesiredAngle = 0;
    private monitor = new VectorMonitor();
    private scopeLamp?: { material: THREE.MeshStandardMaterial; intensity: number };
    private scopeLampGlow = 1;
    private scopeFrames = 0;
    private scopeFpsStarted = performance.now();
    private manualKey?: THREE.Object3D;
    private receiverNeedle?: THREE.Object3D;
    private meterKnobs: THREE.Object3D[] = [];
    private soundSwitch?: THREE.Object3D;
    private musicSwitch?: THREE.Object3D;
    private dirty = true;
    private rendered = 0;
    private ambientOwed = false;
    private scopeDrawn = 0;
    // Ambient frames slow down while nobody is at the console (`ambientRate`).
    private lastInput = performance.now();
    private focused = document.hasFocus();
    private feeding = false;
    private quality: QualityProfile = qualityProfiles.high;
    private studio: { light: THREE.Light; intensity: number }[] = [];
    private areaLights: THREE.RectAreaLight[] = [];
    private keyLight?: THREE.DirectionalLight;
    private crtMaterials: THREE.Material[] = [];
    private screenGlass: THREE.Mesh[] = [];
    private wordGlass: THREE.MeshPhysicalMaterial[] = [];
    private nixieCovers: THREE.Mesh[] = [];
    private probing?: { warm: number; done: (cost: number) => void };
    private paperShadowSkip = 0;
    private frameHashes = new Map<string, number>();
    private boundsEye = new THREE.Vector3();
    private boundsPoint = new THREE.Vector3();
    private reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    private rosterMotionRate = import.meta.env.DEV && new URLSearchParams(location.search).get('motion') === 'slow' ? .2 : 1;
    private pulses = new Map<string, number>();
    private environment: THREE.WebGLRenderTarget;
    private draco = new DRACOLoader().setDecoderPath({ js: dracoWrapperUrl, wasm: dracoWasmUrl }).setWorkerLimit(2);
    private scopeCanvas = document.createElement('canvas');
    private scopeGridCanvas = document.createElement('canvas');
    private scopeTraceCanvas = document.createElement('canvas');
    private scopeBloomCanvas = document.createElement('canvas');
    private scopeGlow?: ImageData;
    private onContextLost = (e: Event) => { e.preventDefault(); this.fail(translate(this.locale, '图形连接已中断，请刷新终端。')); };
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
    private onInspectionDown = (e: PointerEvent) => {
        if (!this.inspectionEnabled || this.handleDrag !== undefined || this.archiveOpen) return;
        const control = e.target instanceof Element && e.target.closest('button, input, a, textarea');
        if (e.button !== 1 && (e.button !== 0 || control)) return;
        e.preventDefault();
        e.stopPropagation();
        this.inspectionDrag = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
        this.host.dataset.inspecting = 'true';
        this.host.setPointerCapture(e.pointerId);
    };
    private onInspectionMove = (e: PointerEvent) => {
        const drag = this.inspectionDrag;
        if (!drag || drag.pointerId !== e.pointerId) return;
        e.preventDefault();
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        this.inspectionTargetYaw += dx * .0055;
        this.inspectionTargetPitch = THREE.MathUtils.clamp(this.inspectionTargetPitch + dy * .0045, -1.25, 1.25);
        drag.x = e.clientX; drag.y = e.clientY;
    };
    private finishInspection = (e: PointerEvent) => {
        if (this.inspectionDrag?.pointerId !== e.pointerId) return;
        if (this.host.hasPointerCapture(e.pointerId)) this.host.releasePointerCapture(e.pointerId);
        this.inspectionDrag = undefined;
        delete this.host.dataset.inspecting;
    };
    private onInspectionAuxClick = (e: MouseEvent) => {
        if (this.inspectionEnabled && e.button === 1) e.preventDefault();
    };
    private onInspectionWheel = (e: WheelEvent) => {
        if (!this.inspectionEnabled || this.archiveOpen || this.handleDrag !== undefined) return;
        // Knobs own their wheel input; inspecting must never retune hardware.
        if (e.target instanceof Element && e.target.closest('[role="slider"], input, textarea')) return;
        e.preventDefault();
        this.zoomTarget = inspectionZoom(this.zoomTarget, e.deltaY, e.deltaMode);
    };
    constructor(private host: HTMLElement, private project: () => void, private fail: (message: string) => void,
        private onPaperPull: () => void = () => {}, private inspectionEnabled = false,
        private instrumentPreview = false, private playSound: (cue: ConsoleSound) => void = () => {},
        private setPaperFeed: (moving: boolean) => void = () => {},
        private playCrt: (event: CrtSoundEvent) => void = () => {}) {
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
        if (this.inspectionEnabled) {
            host.dataset.inspection = 'enabled';
            host.addEventListener('pointerdown', this.onInspectionDown, true);
            host.addEventListener('pointermove', this.onInspectionMove, true);
            host.addEventListener('pointerup', this.finishInspection, true);
            host.addEventListener('pointercancel', this.finishInspection, true);
            host.addEventListener('lostpointercapture', this.finishInspection, true);
            host.addEventListener('auxclick', this.onInspectionAuxClick, true);
            host.addEventListener('wheel', this.onInspectionWheel, { passive: false });
            const inspectionView = import.meta.env.DEV ? new URLSearchParams(location.search).get('view') : null;
            if (inspectionView === 'oblique' || inspectionView === 'opposite') {
                this.inspectionYaw = this.inspectionTargetYaw = inspectionView === 'opposite' ? -.48 : .48;
                this.inspectionPitch = this.inspectionTargetPitch = -.12;
            }
        }
        this.scene.background = new THREE.Color('#d3cfc4');
        this.scene.add(this.inspection);
        this.inspection.add(this.turntable);
        this.turntable.add(this.root);
        // The inspection pivot passes through the chassis instead of its face.
        // These offsets cancel at rest, but rotation now happens around the
        // physical center of the machine's depth.
        this.inspection.position.z = -1.5;
        this.turntable.position.z = .5;
        this.root.position.z = 1;
        // The full machine, inset hardware, and printed surfaces share one
        // perspective camera. resize() fits this fixed viewing direction.
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        const room = new RoomEnvironment();
        this.environment = pmrem.fromScene(room, .035);
        this.scene.environment = this.environment.texture;
        room.dispose();
        pmrem.dispose();
        this.scene.environmentIntensity = .30;
        const sky = new THREE.HemisphereLight('#f5e4cb', '#53636d', .26);
        this.scene.add(sky);
        const key = new THREE.DirectionalLight('#ffe9c7', 3.4);
        key.position.set(-8, 10, 12);
        key.castShadow = true;
        key.shadow.mapSize.set(1024, 1024);
        key.shadow.camera.left = -11;
        key.shadow.camera.right = 11;
        key.shadow.camera.top = 9;
        key.shadow.camera.bottom = -9;
        key.shadow.normalBias = .012;
        key.shadow.bias = -.00015;
        key.shadow.camera.near = 1;
        key.shadow.camera.far = 40;
        key.shadow.radius = 5;
        key.shadow.blurSamples = 8;
        this.scene.add(key);
        const fill = new THREE.DirectionalLight('#b9d0df', .38);
        fill.position.set(9, 1, 5);
        this.scene.add(fill);
        // Broad studio sources light every material, including the enamel,
        // aluminum edges and acrylic. No light is attached to the tube readout.
        RectAreaLightUniformsLib.init();
        const softbox = new THREE.RectAreaLight('#fff2dd', 4.5, 8, 2.2);
        softbox.position.set(-3.5, 7, 7);
        softbox.lookAt(0, 0, 0);
        softbox.rotateZ(-.2);
        this.scene.add(softbox);
        const rim = new THREE.RectAreaLight('#d6e5ec', 3, 9, .55);
        rim.position.set(6.5, 3, 8);
        rim.lookAt(6.5, 3, 0);
        rim.rotateZ(-.12);
        this.scene.add(rim);
        this.keyLight = key;
        this.areaLights = [softbox, rim];
        this.studio = [sky, key, fill].map(light => ({ light, intensity: light.intensity }));
        const back = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#bcb5a5', roughness: .94 }));
        back.position.z = -3.95;
        back.receiveShadow = true;
        this.backdrop = back;
        this.scene.add(back);
        for (const canvas of [this.scopeCanvas, this.scopeGridCanvas]) {
            canvas.width = 420;
            canvas.height = 350;
        }
        // The phosphor owns the plotting area; a quarter-size copy is its bloom.
        this.scopeTraceCanvas.width = scopeTuning.width;
        this.scopeTraceCanvas.height = scopeTuning.height;
        this.scopeBloomCanvas.width = scopeTuning.width / 4;
        this.scopeBloomCanvas.height = scopeTuning.height / 4;
        this.drawScopeGraticule();
        this.observer = new ResizeObserver(() => this.resize());
        this.observer.observe(host);
        this.applyQuality();
        this.wake();
    }
    async load() {
        // Geometry and projected labels must always share a revision, including
        // on servers that allow the browser to reuse previously cached assets.
        const revision = 'console-encrypto-20260928-v1';
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
        this.surfaces = {
            ...surfaces,
            ...handleSurfaces,
            batteryControl: { x: -3.4, y: .62, z: -3.66, w: 5.6, h: 4.2, rotationY: Math.PI },
            testControl: { x: -.05, y: -2.76, z: -3.27, w: .70, h: .70, rotationY: Math.PI },
        };
        this.model = gltf.scene;
        // Old exports may still contain the previous title on the rear panel.
        gltf.scene.getObjectByName('Instrument_rear wordmark')?.removeFromParent();
        gltf.scene.traverse(o => { if (o instanceof THREE.Mesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            if (/^Ruby[ _]lens[ _][0-3]$/.test(o.name) && o.material instanceof THREE.MeshStandardMaterial) {
                // The exported flat lens becomes the dark seat beneath the new
                // curved glass; a second glossy face left straight white strips.
                o.material.color.set('#0b1012');
                o.material.roughness = .94;
                o.material.metalness = 0;
            }
        } });
        this.root.add(gltf.scene);
        for (const [name, s] of Object.entries(this.surfaces)) {
            const material = s.lit
                ? new THREE.MeshStandardMaterial({ transparent: true, roughness: .83, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
                : new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false });
            const curvature = crtProfile(name);
            const geometry = curvature ? crtGeometry(s.w, s.h, curvature) : new THREE.PlaneGeometry(s.w, s.h);
            const plane = new THREE.Mesh(geometry, material);
            plane.receiveShadow = !!s.lit;
            plane.position.set(s.x, s.y, s.z);
            plane.rotation.x = s.rotationX ?? 0;
            plane.rotation.y = s.rotationY ?? 0;
            plane.renderOrder = name === 'paper' ? 3 : 2;
            this.root.add(plane);
            this.planes.set(name, plane);
            if (name === 'channel' || name === 'paper' || name.startsWith('handle')) plane.visible = false;
            if (curvature) {
                const kind: CrtKind = name.startsWith('word') ? 'word' : name === 'scope' ? 'scope' : 'screen';
                const seed = name.startsWith('word') ? Number(name.slice(4)) + 1 : name === 'scope' ? 5 : 0;
                const eye = { value: new THREE.Vector3() };
                plane.onBeforeRender = (_renderer, _scene, camera) => {
                    camera.getWorldPosition(eye.value);
                    plane.worldToLocal(eye.value);
                };
                const uniforms = crtUniforms(kind);
                const motion = name === 'screen' ? this.crtMotion : new CrtMotion<TubeFrame>(kind, seed);
                this.crtTubes.set(name, { motion, uniforms });
                const dots = kind === 'word' ? dotUniforms() : undefined;
                if (dots) {
                    const driver = new DotDriver(seed - 1);
                    this.dotModules.set(name, { driver, uniforms: dots });
                    this.dotBank.drivers.push(driver);
                }
                shadeCrt(material, { kind, seed, lite: () => this.quality.crtOptics === 'lite', time: this.crtTime, eye,
                    tube: uniforms, size: new THREE.Vector2(s.w, s.h), curvature, spot: crtRestSpot(kind),
                    display: () => kind === 'word' ? this.wordDisplay : 'crt',
                    filter: () => kind === 'word' ? this.dotFilter : 'baseline', dots,
                    terminal: kind === 'screen' ? this.terminal : undefined });
                this.crtMaterials.push(material);
                this.addScreenGlass(name, plane);
            }
        }
        // Blender owns the assemblies: the fixed drive housing must never eject.
        const disk = this.part('FloppyTransport');
        const knob = this.part('ScopeTuning');
        const wave = this.part('ScopeWave');
        const rate = this.part('ScopeRate');
        const persistence = this.part('ScopePersistence');
        if (!disk || !knob || !wave || !rate || !persistence) throw new Error('终端机械组件不完整。');
        this.disk = disk;
        this.ejectButton = this.part('FloppyEject');
        if (this.ejectButton) this.ejectButtonRest.copy(this.ejectButton.position);
        this.diskRest.copy(disk.position);
        this.diskPivot.copy(this.part('Floppy disk')?.position ?? new THREE.Vector3());
        this.diskAxis.fromArray(disk.userData.travel_axis ?? [0, 0, 1]).normalize();
        this.diskTravel = diskSeatTravel;
        this.tuningKnob = knob;
        this.waveKnob = wave;
        this.rateKnob = rate;
        this.persistenceKnob = persistence;
        const battery = this.part('BatteryDoor');
        if (!battery) throw new Error('电池仓组件不完整。');
        this.batteryDoor = battery;
        for (const [name, control] of [
            ...[0, 1, 2, 3].map(i => [`BatteryCell_${i}`, `batteryCell${i}Control`]),
            ...['RJ45', 'Serial', 'DC'].map(name => [`CablePlug_${name}`, `${name}PlugControl`]),
        ]) {
            const object = this.part(name), plane = this.planes.get(control);
            if (!object) continue;
            this.removable.set(name, { object, rest: object.position.clone(), amount: 0 });
            if (plane) object.attach(plane);
        }
        // Leads are separate anchored meshes, never parented to their plug: an
        // `unplugged` morph bends the cable while the far end stays put.
        for (const name of ['RJ45', 'Serial', 'DC']) {
            const lead = this.part(`Tactile_${name} flexible lead`);
            if (lead instanceof THREE.Mesh && lead.morphTargetDictionary?.unplugged !== undefined)
                this.cableLeads.set('CablePlug_' + name, { mesh: lead, index: lead.morphTargetDictionary.unplugged });
        }
        // Roster cards are insertable assemblies; the printed face plane rides
        // with its card while the stamped well floor stays on the rack.
        for (const team of ['A', 'B']) for (let i = 0; i < 4; i++) {
            const card = this.part(`RosterCard_${team}${i}`);
            if (!card) continue;
            const plane = this.planes.get(`roster${team}${i}`);
            if (plane) card.attach(plane);
            const travel = card.userData.travel;
            const materials: THREE.Material[] = [];
            card.traverse(object => {
                if (!(object instanceof THREE.Mesh)) return;
                if (object !== plane) object.material = object.material.clone();
                // Solid card/ink depth stays authoritative against the fixed
                // clips. Only the fully withdrawn end fades, using coverage
                // instead of transparent-object sorting through the rack.
                object.material.transparent = object === plane;
                object.material.alphaHash = object !== plane;
                materials.push(object.material);
            });
            this.rosterCards.set(team + i, { object: card, rest: card.position.clone(),
                travel: typeof travel === 'number' ? travel : .58,
                motion: new RosterMotion(), materials });
        }
        this.testLamp = this.part('RearTestLamp') as THREE.Mesh;
        // Keep the lamp independent from other lenses for the local self-test.
        const testMaterial = (this.testLamp.material as THREE.MeshStandardMaterial).clone();
        this.testLamp.material = testMaterial;
        this.indicatorColors.set(testMaterial, testMaterial.color.clone());
        for (const name of ['Connection lens', 'Instrument_RJ45 lamp 0', 'Instrument_RJ45 lamp 1']) {
            const lamp = this.part(name);
            if (!(lamp instanceof THREE.Mesh) || !(lamp.material instanceof THREE.MeshStandardMaterial)) continue;
            lamp.material = lamp.material.clone();
            this.indicatorColors.set(lamp.material, lamp.material.color.clone());
            if (name === 'Connection lens') this.connectionLamp = lamp.material;
            else this.networkLamps.push(lamp.material);
        }
        this.root.updateMatrixWorld(true);
        this.disk.attach(this.planes.get('disklabel')!);
        // The label must ride with the transport: attach at the modeled rest
        // pose, only then sink the assembly to the seated offset.
        this.applyDiskTravel();
        for (const [part, surface] of [['ManualKey', 'badge'], ['ChannelCopy', 'channelCopy'], ['TransmitLever', 'transmitLabel']]) {
            const assembly = this.part(part), plane = this.planes.get(surface);
            if (assembly && plane) assembly.attach(plane);
        }
        this.powerSwitch = this.part('PowerSwitch');
        if (!this.powerSwitch) throw new Error('电源开关组件不完整。');
        this.copyKey = this.part('ChannelCopy');
        this.copyKeyRestZ = this.copyKey?.position.z ?? 0;
        this.setupNixies();
        // The meter's crystal was exported as ordinary alpha, which faded its
        // reflections along with the glass: at 7% opacity it looked uncovered.
        const crystal = this.part('SignalGlass');
        if (crystal instanceof THREE.Mesh) {
            // A dead-flat pane facing the camera mirrors only the dim room behind
            // it. Meter crystals are pressed slightly convex, which is what lets
            // them catch the key light the way the tube faces do.
            const box = crystal.geometry.boundingBox ?? new THREE.Box3().setFromBufferAttribute(crystal.geometry.getAttribute('position') as THREE.BufferAttribute);
            const size = box.getSize(new THREE.Vector3());
            crystal.geometry.dispose();
            crystal.geometry = crtGeometry(size.x, size.y, { rise: .07, radius: .05, columns: 48, rows: 24, warp: 0, depth: 0, innerRise: 0, seat: 0 });
            crystal.material = this.glassMaterial(true);
            crystal.renderOrder = 6;
            crystal.castShadow = crystal.receiveShadow = false;
        }
        this.paperRoller = this.part('Paper roller');
        if (this.paperRoller) this.rollerRest.copy(this.paperRoller.quaternion);
        const paper = this.part('Paper back');
        if (paper instanceof THREE.Mesh && paper.parent?.name === 'PaperFeed') {
            this.paperNipY = paper.parent.position.y;
            // The mesh is the tearing simulation's particle grid: two columns
            // per tooth, rows crowding toward the tooth line where it bends.
            paper.geometry.dispose();
            this.receipt.width = this.surfaces.paper.w;
            paper.geometry = new THREE.PlaneGeometry(this.surfaces.paper.w, 1, this.receipt.columns, this.receipt.rows);
            // Long stock leans forward from the nip to clear the raised launch key.
            paper.rotation.x = -THREE.MathUtils.degToRad(3);
            paper.geometry.getAttribute('position').setUsage(THREE.DynamicDrawUsage);
            paper.material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .96, side: THREE.FrontSide, transparent: true });
            paper.castShadow = true;
            paper.receiveShadow = true;
            const reverse = new THREE.Mesh(paper.geometry,
                new THREE.MeshStandardMaterial({ color: '#eadfc5', roughness: 1, side: THREE.BackSide, transparent: true }));
            reverse.name = 'Receipt unprinted reverse';
            reverse.receiveShadow = true;
            paper.add(reverse);
            // The stub above the tear line follows the real paper path: out of
            // the printer opening, around the underside of the platen roller
            // and forward to the teeth, registered to the exported parts.
            const feed = paper.parent;
            const inFeed = (object: THREE.Object3D) => feed.worldToLocal(object.getWorldPosition(new THREE.Vector3()));
            const roller = this.paperRoller ? inFeed(this.paperRoller) : new THREE.Vector3(0, .165, -.167);
            const rollerBox = this.paperRoller ? new THREE.Box3().setFromObject(this.paperRoller) : null;
            const rollerRadius = rollerBox ? (rollerBox.max.y - rollerBox.min.y) / 2 : .095;
            const opening = this.part('Printer opening');
            const openingBackZ = opening ? new THREE.Box3().setFromObject(opening).min.z - feed.getWorldPosition(new THREE.Vector3()).z : roller.z - .14;
            const path = receiptHeadPath({ y: roller.y, z: roller.z, radius: rollerRadius + .006 }, openingBackZ);
            const columns = this.receipt.columns, width = this.surfaces.paper.w;
            const headPositions = new Float32Array(path.length * (columns + 1) * 3);
            const headUv = new Float32Array(path.length * (columns + 1) * 2);
            const headIndex: number[] = [];
            // Print continues up the stub: arc length back from the tear line.
            this.paperHeadArc = path.map(() => 0);
            for (let i = path.length - 2; i >= 0; i--) {
                this.paperHeadArc[i] = this.paperHeadArc[i + 1] + Math.hypot(path[i].y - path[i + 1].y, path[i].z - path[i + 1].z);
            }
            for (let i = 0; i < path.length; i++) for (let j = 0; j <= columns; j++) {
                const vertex = (i * (columns + 1) + j) * 3;
                headPositions[vertex] = -width / 2 + width * j / columns;
                headPositions[vertex + 1] = path[i].y - (i === path.length - 1 ? paperTooth(j / columns) : 0);
                headPositions[vertex + 2] = path[i].z;
                headUv[(i * (columns + 1) + j) * 2] = j / columns;
                if (i < path.length - 1 && j < columns) {
                    const a = i * (columns + 1) + j, b = a + 1, c = a + columns + 1, d = c + 1;
                    headIndex.push(a, c, b, b, c, d);
                }
            }
            const headGeometry = new THREE.BufferGeometry();
            headGeometry.setAttribute('position', new THREE.BufferAttribute(headPositions, 3));
            headGeometry.setAttribute('uv', new THREE.BufferAttribute(headUv, 2).setUsage(THREE.DynamicDrawUsage));
            headGeometry.setIndex(headIndex);
            headGeometry.computeVertexNormals();
            const head = new THREE.Mesh(headGeometry,
                new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .96, side: THREE.DoubleSide, alphaTest: .5 }));
            head.name = 'Receipt clamped head';
            head.receiveShadow = true;
            head.castShadow = true;
            feed.add(head);
            this.paperHead = head;
            this.paper = paper;
            // Deterministic development stills run the same mechanics to a frame.
            const frame = import.meta.env.DEV ? paperStillFrame(new URLSearchParams(location.search).get('paper-frame')) : null;
            if (frame !== null) {
                const phase = new URLSearchParams(location.search).get('paper-phase');
                this.receipt.still(phase === 'feed' ? 'feed' : phase === 'refill' ? 'refill' : 'tear', frame, this.content?.paperRecords ?? 0);
            }
            this.syncPaperGeometry();
            this.receipt.warmUp();
        }
        this.model.traverse(object => {
            if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial &&
                ['Tactile warm meter dial', 'Scope indicator glass'].includes(object.material.name)) {
                this.poweredMaterials.set(object.material, object.material.emissiveIntensity);
                if (object.material.name === 'Scope indicator glass')
                    this.scopeLamp = { material: object.material, intensity: object.material.emissiveIntensity };
                if (object.material.name === 'Scope indicator glass')
                    this.indicatorColors.set(object.material, object.material.color.clone());
            }
        });
        this.setupPlateFinishes();
        this.setupThemePanels();
        this.setupScoreFlags();
        // The receiver is part of the shipped console model, including its controls.
        const receiver = this.part('Instrument_signal');
        if (!receiver) throw new Error('Missing production receiver');
        const instruments = new THREE.Group();
        instruments.name = 'ConsoleInstruments';
        this.model.add(instruments);
        this.model.updateWorldMatrix(true, true);
        instruments.attach(receiver);
        let original: THREE.Group | undefined;
        if (import.meta.env.DEV && this.instrumentPreview) {
            const loader = new GLTFLoader().setDRACOLoader(this.draco);
            const [studies, vu] = await Promise.all([
                loader.loadAsync('/models/instrument-studies.glb?v=20260918-5'),
                loader.loadAsync('/models/instrument-vu.glb?v=20260918-1'),
            ]);
            if (this.disposed) { this.disposeObject(studies.scene); this.disposeObject(vu.scene); return; }
            // Compare the same production receiver against the archived alternatives.
            studies.scene.getObjectByName('Instrument_signal')?.removeFromParent();
            studies.scene.position.set(5.83, -1.4, 0);
            original = vu.scene;
            original.name = 'InstrumentOriginal';
            instruments.add(studies.scene, original);
        }
        this.instruments = new ConsoleInstruments(instruments, original);
        this.batchStaticGeometry();
        this.manualKey = this.part('ManualKey');
        this.receiverNeedle = this.part('ReceiverNeedle');
        this.soundSwitch = this.part('RearSoundSwitch');
        this.musicSwitch = this.part('RearMusicSwitch');
        this.meterKnobs = ['MeterAmplitude', 'MeterRate'].flatMap(name => {
            const knob = this.part(name);
            return knob ? [knob] : [];
        });
        // The perpetually swinging needle and knob pointers are too small to
        // read in the shadow map; excluding them keeps static shadows static.
        for (const object of [this.manualKey, this.receiverNeedle, ...this.meterKnobs])
            object?.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = false; });
        this.renderer.shadowMap.needsUpdate = true;
        const scope = new THREE.CanvasTexture(this.scopeCanvas);
        scope.colorSpace = THREE.SRGBColorSpace;
        this.textures.set('scope', scope);
        this.planes.get('scope')!.material.map = scope;
        if (this.content)
            this.update(this.content, { locale: this.locale, scopeFreq: this.scopeFreq, diskOut: this.diskOut, keyDisk: this.keyDisk, scopeWave: this.scopeWave,
                scopeRate: this.scopeRate, scopeAxis: this.scopeAxis,
                backView: this.backView, batteryOpen: this.batteryOpen, soundOn: this.soundOn, musicOn: this.musicOn,
                powerOn: this.switchOn, wordDisplay: this.wordDisplay,
                archiveOpen: this.archiveOpen, manual: this.manual,
                removedBatteries: this.removedBatteries, unpluggedCables: this.unpluggedCables,
                meterAmplitude: this.meterAmplitude, meterRate: this.meterRate,
                instrumentVariant: this.instrumentVariant, instrumentDemo: this.instrumentDemo });
        this.applyQuality();
    }
    /** Clear glass whose reflections do not fade with its transparency. */
    private glassMaterial(bright = false) {
        // Over a dark tube the pane may trade background for reflection. Over a pale
        // dial that trade cancels the reflection out, so there the mirrored light is
        // added on top, and the pane only takes the few percent real glass keeps.
        const material = new THREE.MeshPhysicalMaterial({
            color: '#091412', metalness: 0, roughness: bright ? .09 : .22,
            ior: 1.52, specularIntensity: bright ? 1 : .35, envMapIntensity: bright ? 1 : .30, premultipliedAlpha: bright,
            transparent: true, opacity: 1, depthWrite: false,
        });
        // Keep the physical specular response independent of the clear substrate.
        // Every reflection comes from the shared lights / environment and the
        // mesh's actual curved normals; there are no painted softboxes or streaks.
        material.onBeforeCompile = shader => {
            shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
                vec3 glassReflection = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
                float glassPeak = max(max(glassReflection.r, glassReflection.g), glassReflection.b);
                #ifdef GLASS_ADDITIVE
                gl_FragColor = vec4(glassReflection, .06);
                #else
                float glassAlpha = clamp(.006 + glassPeak, .006, .32);
                gl_FragColor = vec4((diffuseColor.rgb * .006 + glassReflection) / glassAlpha, glassAlpha);
                #endif
            `);
        };
        if (bright) material.defines = { ...material.defines, GLASS_ADDITIVE: '' };
        material.customProgramCacheKey = () => `crt-physical-glass-v2-${bright}`;
        return material;
    }
    private addScreenGlass(name: string, display: THREE.Mesh) {
        const glass = new THREE.Mesh(display.geometry.clone(), this.glassMaterial());
        if (this.dotModules.has(name)) {
            this.wordGlass.push(glass.material);
            this.syncWordGlass();
        }
        glass.name = `Runtime CRT glass ${name}`;
        glass.position.z = .006;
        glass.renderOrder = 6;
        glass.castShadow = glass.receiveShadow = false;
        display.add(glass);
        this.screenGlass.push(glass);
    }
    private syncWordGlass() {
        // The LED contrast filter has a quieter finish than the CRT's clear cover.
        const led = this.wordDisplay !== 'crt';
        for (const material of this.wordGlass) {
            material.roughness = led ? .26 : .22;
            material.specularIntensity = led ? .22 : .35;
            material.envMapIntensity = led ? .20 : .30;
        }
    }
    private setupPlateFinishes() {
        const enamel = plateFinish('enamel'), nickel = plateFinish('nickel');
        for (const [kind, finish] of [['enamel', enamel], ['nickel', nickel]] as const)
            for (const [name, texture] of Object.entries(finish)) {
                texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
                this.textures.set(`${kind}-${name}`, texture);
            }
        const score = this.part('Front_score enamel bed');
        score?.traverse(part => {
            if (!(part instanceof THREE.Mesh)) return;
            part.material = new THREE.MeshPhysicalMaterial({
                ...nickel, color: scoreRegisterSpec.materials.faceplate, metalness: .35,
                roughnessMap: null, roughness: .82, normalScale: new THREE.Vector2(.18, .18),
                envMapIntensity: .3,
            });
        });
        for (const team of ['A', 'B']) {
            const plaque = this.part(`Front_roster team plaque ${team}`), plane = this.planes.get('roster' + team);
            if (!(plaque instanceof THREE.Mesh) || !plane) continue;
            // Map the enamel in faceplate coordinates, including the beveled
            // return. The transparent print no longer hides its real lighting.
            plaque.updateWorldMatrix(true, false); plane.updateWorldMatrix(true, false);
            const matrix = plane.matrixWorld.clone().invert().multiply(plaque.matrixWorld);
            const position = plaque.geometry.getAttribute('position');
            const uv = new Float32Array(position.count * 2), point = new THREE.Vector3();
            const surface = this.surfaces['roster' + team];
            for (let i = 0; i < position.count; i++) {
                point.fromBufferAttribute(position, i).applyMatrix4(matrix);
                uv[i * 2] = point.x / surface.w + .5;
                uv[i * 2 + 1] = point.y / surface.h + .5;
            }
            plaque.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
            // Orange peel shows as a soft ripple in the clearcoat, not as grit.
            plaque.material = new THREE.MeshPhysicalMaterial({ ...enamel, color: '#efe5cf',
                normalScale: new THREE.Vector2(.5, .5),
                roughness: .72, metalness: .16, clearcoat: .28, clearcoatRoughness: .34 });
        }
        // Silk-screen ink fills the fine relief it is printed on: a trace of the
        // surface normal keeps it seated without striping the letters.
        for (const name of ['score', 'rosterA', 'rosterB']) {
            const material = this.planes.get(name)?.material;
            if (!(material instanceof THREE.MeshStandardMaterial)) continue;
            const finish = name === 'score' ? nickel : enamel;
            material.normalMap = finish.normalMap;
            material.normalScale.set(.08, .08);
            material.roughnessMap = null;
            material.roughness = .9;
            material.metalness = .04;
        }
    }
    private setupThemePanels() {
        const model = this.model!;
        const assemblies: [string, THREE.Object3D[]][] = [
            ...['A', 'B'].map<[string, THREE.Object3D[]]>(team => {
                const plaque = this.part(`Front_roster team plaque ${team}`);
                return ['roster' + team, plaque ? [plaque] : []];
            }),
        ];
        for (const [name, parts] of assemblies) {
            const surface = this.surfaces[name], plane = this.planes.get(name);
            if (!parts.length || !plane) continue;
            const object = new THREE.Group();
            object.name = 'ThemePanel_' + name;
            object.position.set(surface.x, surface.y, surface.z);
            model.add(object);
            model.updateWorldMatrix(true, true);
            for (const part of parts) object.attach(part);
            object.attach(plane);
            // Clone per source material, so fading one module never affects the
            // chassis and its static meshes can still be batched by material.
            const clones = new Map<THREE.Material, THREE.Material>();
            const materials = new Set<THREE.Material>();
            const enamel = new Set<THREE.MeshStandardMaterial>();
            object.traverse(part => {
                if (!(part instanceof THREE.Mesh)) return;
                const remap = (source: THREE.Material) => {
                    let material = source;
                    if (part !== plane) {
                        material = clones.get(source) ?? source.clone();
                        clones.set(source, material);
                        if (material instanceof THREE.MeshStandardMaterial)
                            enamel.add(material);
                    }
                    if (!material.transparent) material.alphaHash = true;
                    materials.add(material);
                    return material;
                };
                part.material = Array.isArray(part.material) ? part.material.map(remap) : remap(part.material);
            });
            this.themePanels.set(name, { object, rest: object.position.clone(), motion: new RosterMotion(), enamel: [...enamel],
                materials: [...materials].map(material => ({ material, opacity: material.opacity })) });
        }
    }
    private setupScoreFlags() {
        for (const team of ['A', 'B']) for (const category of ['intercept', 'failure']) for (let k = 0; k < 2; k++) {
            const name = `${team}_${category}_${k}`;
            const object = this.part('ScoreFlag_' + name);
            if (!object) throw new Error(`Missing score flag: ${name}`);
            object.traverse(part => {
                if (part instanceof THREE.Mesh) {
                    part.castShadow = part.receiveShadow = false;
                    if (part.material instanceof THREE.MeshStandardMaterial) part.material.envMapIntensity = .35;
                }
            });
            this.scoreFlags.set(name, { object, motion: new ScoreFlagMotion() });
        }
        this.model?.traverse(object => {
            if (!(object instanceof THREE.Mesh) || !object.name.startsWith('ScoreRegister_glass ')) return;
            object.castShadow = object.receiveShadow = false;
            if (object.material instanceof THREE.MeshStandardMaterial) {
                object.material.depthWrite = false;
                object.material.envMapIntensity = .2;
            }
        });
    }
    private setupNixies() {
        this.model?.traverse(object => {
            if (!(object instanceof THREE.Mesh)) return;
            const match = /^Nixie_Digit_(\d)_(\d)$/.exec(object.name);
            if (match) {
                object.visible = false; object.castShadow = false;
                const material = object.material as THREE.MeshStandardMaterial;
                material.toneMapped = false;
                this.nixieDigits.push({ mesh: object, slot: Number(match[1]), digit: Number(match[2]) });
            }
            if (object.name.startsWith('NixieCover_') && object.material instanceof THREE.MeshStandardMaterial && object.material.transparent) {
                object.castShadow = false; object.receiveShadow = false;
                const acrylic = object.material as THREE.MeshPhysicalMaterial;
                acrylic.depthWrite = false; acrylic.side = THREE.FrontSide;
                acrylic.roughness = .10; acrylic.metalness = 0;
                acrylic.ior = 1.49; acrylic.clearcoat = 1; acrylic.clearcoatRoughness = .065;
                acrylic.envMapIntensity = .14;
                // Preserve the real light/environment specular independently of
                // the clear substrate's opacity. Ordinary alpha fades both away;
                // screen-space transmission also omits the transparent tube glass.
                acrylic.onBeforeCompile = shader => {
                    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
                        vec3 acrylicReflection = totalSpecular;
                        #ifdef USE_CLEARCOAT
                        acrylicReflection += material.clearcoat * (clearcoatSpecularDirect + clearcoatSpecularIndirect);
                        #endif
                        float reflectionPeak = max(max(acrylicReflection.r, acrylicReflection.g), acrylicReflection.b);
                        float acrylicAlpha = clamp(0.055 + reflectionPeak * 0.80, 0.055, 0.48);
                        gl_FragColor = vec4((acrylicReflection + diffuseColor.rgb * 0.002) / acrylicAlpha, acrylicAlpha);
                    `);
                };
                acrylic.customProgramCacheKey = () => 'clear-acrylic-specular-v1';
                object.renderOrder = 7;
                this.nixieCovers.push(object);
            }
            if (/^Nixie_.*glass$/.test(object.name)) {
                object.castShadow = false; object.receiveShadow = false;
                const glass = object.material as THREE.MeshPhysicalMaterial;
                glass.depthWrite = false; glass.side = THREE.FrontSide;
                glass.opacity = .105; glass.roughness = .075; glass.metalness = .05;
                object.renderOrder = 5;
                this.nixieCovers.push(object);
            }
        });
        for (let slot = 0; slot < 4; slot++) {
            // The glow reaches well past the cathode: the canvas keeps the digit's
            // scale and adds a margin for the neon sheath and the lit envelope.
            const canvas = document.createElement('canvas'); canvas.width = 180 + nixieHalo * 2; canvas.height = 270 + nixieHalo * 2;
            const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
            const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false,
                blending: THREE.AdditiveBlending, toneMapped: false, opacity: .85 });
            const channel = this.surfaces.channel, scale = channel.digitScale ?? 1;
            const glow = new THREE.Mesh(new THREE.PlaneGeometry(.40 * canvas.width / 180, .60 * scale * canvas.height / 270), material);
            glow.position.set(channel.x + (slot - 1.5) * .52, channel.y, channel.z - .097); glow.renderOrder = 4;
            this.root.add(glow); this.textures.set('nixie' + slot, texture);
            const paths = Array.from({ length: 10 }, (_, digit) =>
                this.nixieDigits.find(d => d.slot === slot && d.digit === digit)?.mesh.userData.cathode_path || '');
            // What the glow throws onto the recess: a wide, dim pool behind each lit tube.
            const spill = new THREE.Mesh(new THREE.PlaneGeometry(.78, .95 * scale), new THREE.MeshBasicMaterial({ map: this.nixieSpill(),
                transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 }));
            spill.position.set(glow.position.x, channel.y - .04, channel.z - .19); spill.renderOrder = 3;
            this.root.add(spill);
            this.nixieCoronas.push({ canvas, texture, material, spill: spill.material, paths, code: '?' });
        }
    }
    private nixieSpillTexture?: THREE.CanvasTexture;
    private nixieSpill() {
        if (this.nixieSpillTexture) return this.nixieSpillTexture;
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
        const c = canvas.getContext('2d')!, pool = c.createRadialGradient(64, 64, 4, 64, 64, 64);
        pool.addColorStop(0, 'rgba(255, 88, 22, .55)'); pool.addColorStop(.45, 'rgba(255, 66, 12, .20)'); pool.addColorStop(1, 'rgba(255, 60, 10, 0)');
        c.fillStyle = pool; c.fillRect(0, 0, 128, 128);
        const texture = this.nixieSpillTexture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        this.textures.set('nixieSpill', texture);
        return texture;
    }
    private updateNixies(code: string) {
        for (const { mesh, slot, digit } of this.nixieDigits) mesh.visible = code[slot] === String(digit);
        this.nixieCoronas.forEach((tube, slot) => {
            const digit = code[slot] || '';
            if (tube.code === digit) return;
            tube.code = digit;
            const c = tube.canvas.getContext('2d')!;
            c.clearRect(0, 0, tube.canvas.width, tube.canvas.height);
            if (digit && tube.paths[Number(digit)]) {
                // Neon fills the envelope with a soft orange haze, densest around the lit cathode.
                const haze = c.createRadialGradient(tube.canvas.width / 2, tube.canvas.height / 2, 10, tube.canvas.width / 2, tube.canvas.height / 2, tube.canvas.height * .34);
                haze.addColorStop(0, 'rgba(255, 96, 26, .22)'); haze.addColorStop(.5, 'rgba(255, 72, 14, .08)'); haze.addColorStop(1, 'rgba(255, 60, 10, 0)');
                c.fillStyle = haze; c.fillRect(0, 0, tube.canvas.width, tube.canvas.height);
                c.save(); c.translate(22.5 + nixieHalo, 18 + nixieHalo); c.scale(1.35, 1.4625);
                c.lineCap = c.lineJoin = 'round';
                const path = new Path2D(tube.paths[Number(digit)]);
                c.strokeStyle = '#ff4109'; c.shadowColor = '#ff490c';
                c.globalAlpha = .20; c.lineWidth = 7; c.shadowBlur = 24; c.stroke(path);
                c.globalAlpha = .28; c.lineWidth = 5; c.shadowBlur = 13; c.stroke(path);
                c.globalAlpha = .46; c.lineWidth = 2.7; c.shadowBlur = 6; c.stroke(path);
                c.restore();
            }
            tube.texture.needsUpdate = true;
            tube.spill.opacity = digit ? .24 : 0;
        });
    }
    private part(name: string) {
        return this.model?.getObjectByName(name) || this.model?.getObjectByName(name.replaceAll(' ', '_'));
    }
    update(content: Content, local: HardwareState) {
        this.dirty = true;
        this.wake();
        this.hashFrames(Object.values(content.frames).map(frame => frame.canvas));
        const hardware = consoleHardware(local);
        const resuming = content.connected && !this.content?.connected;
        if (content.connected && content.trafficKey !== this.content?.trafficKey) this.trafficUntil = performance.now() + 140;
        if (this.powerOn !== hardware.powered || this.content?.waiting !== content.waiting) this.clearScopePersistence();
        this.content = content;
        this.updateNixies(content.roomCode);
        this.switchOn = local.powerOn;
        this.powerOn = hardware.powered;
        if (!this.powerOn) this.testUntil = 0;
        if (this.wordDisplay !== local.wordDisplay) this.fitWordDisplay(local.wordDisplay);
        // Every tube keeps its outgoing picture and phosphor colour until dark;
        // paint's blank power-off frames wait for that same exchange.
        this.crtMotion.sync(this.powerOn, { id: content.displayKey, frame: content.frames.screen });
        this.syncTerminal(content);
        // Revoking a key also replaces the outgoing image during palette changes
        // and power-off afterglow; no secret is kept in the phosphor snapshot.
        if (this.screenPrivacyKey !== content.screenPrivacyKey && this.crtMotion.current)
            this.crtMotion.current = { ...this.crtMotion.current, frame: content.frames.screen };
        this.screenPrivacyKey = content.screenPrivacyKey;
        // Observe the power edge before reduced motion settles the tube instantly.
        this.syncCrtSound();
        for (const [name, tube] of this.crtTubes) {
            if (tube.motion === this.crtMotion) continue;
            const word = name.startsWith('word');
            tube.motion.sync(this.powerOn && (!word || this.wordDisplay === 'crt'), {
                id: word ? content.displayKey : name, frame: content.frames[name],
                palette: word ? content.wordTube : undefined,
            });
            if (name.startsWith('word') && this.dotPrivacyKey !== content.wordPrivacyKey && tube.motion.current)
                tube.motion.current = { ...tube.motion.current, frame: content.frames[name] };
        }
        this.dotBank.sync(this.powerOn && this.wordDisplay !== 'crt', {
            id: content.displayKey, inks: content.wordInks, frames: content.frames,
        });
        // Concealment and team/room changes revoke the outgoing picture immediately,
        // even during a palette shutdown. Keep its old colour until the bus is dark.
        if (this.dotPrivacyKey !== content.wordPrivacyKey && this.dotBank.current)
            this.dotBank.current = { ...this.dotBank.current, frames: content.frames };
        this.dotPrivacyKey = content.wordPrivacyKey;
        if (this.reduced.matches) this.dotBank.advance(0, true);
        if (this.reduced.matches) for (const tube of this.crtTubes.values()) tube.motion.advance(0, true);
        this.syncCrt();
        for (const [material, intensity] of this.poweredMaterials) material.emissiveIntensity = this.powerOn ? intensity : 0;
        this.backView = local.backView;
        this.batteryOpen = local.batteryOpen;
        this.soundOn = local.soundOn;
        this.musicOn = local.musicOn;
        this.manual = local.manual;
        this.removedBatteries = local.removedBatteries;
        this.unpluggedCables = local.unpluggedCables;
        this.meterAmplitude = local.meterAmplitude;
        this.meterRate = local.meterRate;
        this.instrumentVariant = local.instrumentVariant;
        this.instrumentDemo = local.instrumentDemo;
        this.instruments?.update(local);
        // Identity matters: replacing an occupied seat also exchanges its card.
        for (const [id, seat] of this.rosterCards) {
            const player = content.seats[id];
            seat.motion.sync(player === null || player === undefined ? null : { id: player, frame: content.frames['roster' + id] });
        }
        for (const [name, panel] of this.themePanels)
            panel.motion.sync({ id: content.paletteKey, frame: content.frames[name], color: content.teamPlates[name.slice(-1) as 'A' | 'B'] });
        this.archiveOpen = local.archiveOpen;
        if (!local.archiveOpen || !this.powerOn) this.paperReaderStarted = false;
        this.receipt.sync(local.archiveOpen, content.paperRecords);
        this.beginPaperReader();
        this.diskOut = local.diskOut;
        this.setKeyDisk(local.keyDisk);
        this.locale = local.locale;
        this.scopeWave = local.scopeWave;
        this.scopeFreq = local.scopeFreq;
        this.scopeRate = local.scopeRate;
        this.scopeAxis = local.scopeAxis;
        // Analog knobs have physical end stops and retain every fractional turn.
        // Each pointer sweeps exactly between the outer index marks of its dial.
        this.scopeDesiredAngle = Math.PI * .75 * (1 - 2 * local.scopeFreq);
        this.scopeWaveDesiredAngle = 2.182 * (1 - 2 * local.scopeWave);
        this.scopeRateDesiredAngle = 2.182 * (1 - 2 * local.scopeRate);
        this.scopeAxisDesiredAngle = 2.182 * (1 - 2 * local.scopeAxis);
        for (const [name, frame] of Object.entries(content.frames)) {
            if (this.crtTubes.has(name) || name === 'screen' || /^roster[AB][0-3]$/.test(name) || this.themePanels.has(name)) continue;
            this.updateFrame(name, frame);
        }
        this.syncIndicators(performance.now());
        let scorePulses = 0;
        for (const [name, flag] of this.scoreFlags) {
            if (flag.motion.sync(!!content.scoreFlags[name], this.powerOn, scorePulses * .022)) scorePulses++;
            if (resuming) flag.motion.advance(0, true);
            flag.object.rotation.x = flag.motion.angle;
        }
        this.project();
    }
    /**
     * A briefing is a new signal: the tube loses its hold for a moment and locks on again,
     * once per briefing. Any new page is then written out from the top, as a terminal
     * receives it. Only a steady picture does either: never dark glass, a tube still
     * warming up or changing palette, nor for anyone who asked for reduced motion.
     */
    private syncTerminal(content: Content) {
        const steady = this.powerOn && this.crtMotion.interactive && !this.reduced.matches;
        if (content.screenSignal && content.screenSignal !== this.screenSignal && steady) this.crtMotion.tube.disturb(.5);
        if (content.screenSignal) this.screenSignal = content.screenSignal;
        if (this.screenPage !== undefined && content.screenPage !== this.screenPage && steady) this.writeStarted = performance.now();
        this.screenPage = content.screenPage;
        this.setBlink(content.screenBlink, content.frames.screen);
    }
    private setBlink(cells: Blink[], page: Frame) {
        const kinds = [0, 0, 0, 0];
        cells.slice(0, 4).forEach((cell, i) => {
            // Canvas rows run down the page; texture rows run up.
            this.terminal.blink.value[i].set(cell.x / page.width, 1 - (cell.y + cell.h) / page.height,
                (cell.x + cell.w) / page.width, 1 - cell.y / page.height);
            kinds[i] = this.reduced.matches ? 0 : cell.kind === 'cursor' ? 1 : 2;
        });
        this.terminal.blinkKind.value.fromArray(kinds);
    }
    /** Review only: keep the same frame and supply while exchanging its filter. */
    setDotFilter(filter: DotFilter) {
        if (filter === this.dotFilter) return;
        this.dotFilter = filter;
        for (const name of this.dotModules.keys()) this.planes.get(name)!.material.needsUpdate = true;
        this.dirty = true;
        this.wake();
    }
    /** Swaps the keyword windows' hardware; the newly fitted modules start from cold. */
    private fitWordDisplay(display: WordDisplay) {
        this.wordDisplay = display;
        this.syncWordGlass();
        for (const [name, tube] of this.crtTubes) {
            if (!this.dotModules.has(name)) continue;
            this.planes.get(name)!.material.needsUpdate = true;
            tube.printed = undefined;
            tube.motion.tube.settle(false);
        }
        for (const module of this.dotModules.values()) {
            module.printed = undefined;
            module.driver.settle(false);
            module.driver.power(this.powerOn);
            if (this.reduced.matches) module.driver.settle(this.powerOn);
        }
        this.dirty = true;
    }
    private syncCrtSound() {
        for (const event of this.crtSound.update(this.crtMotion.tube, this.powerOn, this.reduced.matches)) this.playCrt(event);
    }
    private syncCrt() {
        this.syncCrtSound();
        const snapshot = this.dotBank.current;
        if (snapshot) {
            dotInks.word.value.set(snapshot.inks.word);
            dotInks.legend.value.set(snapshot.inks.legend);
            dotInks.warning.value.set(snapshot.inks.warning);
        }
        for (const [name, module] of this.dotModules) {
            if (this.wordDisplay === 'crt') break;
            const { driver } = module, frame = snapshot?.frames[name];
            // The bank keeps the outgoing frame through shutdown, except explicit concealment.
            if (frame && frame !== module.printed) {
                const lit = module.printed !== undefined && driver.on;
                module.printed = frame;
                driver.strip = Math.max(dotGrid.cols, frame.canvas.width);
                if (this.updateFrame(name, frame) && lit && !this.reduced.matches) driver.load();
            }
            driver.pack(module.uniforms.drive.value, module.uniforms.panel.value);
        }
        for (const [name, tube] of this.crtTubes) {
            const { motion, uniforms } = tube;
            if (this.wordDisplay !== 'crt' && this.dotModules.has(name)) continue;
            motion.tube.pack(uniforms.scan.value, uniforms.light.value, uniforms.trail.value);
            const frame = motion.current?.frame;
            if (!frame || frame === tube.printed) continue;
            // New words on a lit window arrive as a new signal, which the hold has to find again.
            const lit = tube.printed !== undefined && motion.tube.on;
            tube.printed = frame;
            const palette = motion.current?.palette;
            if (palette) {
                uniforms.hot.value.set(palette.light);
                uniforms.after.value.set(palette.light).lerp(new THREE.Color(1, 1, 1), .45);
                uniforms.tint.value.set(palette.background).multiplyScalar(.04);
            }
            if (this.updateFrame(name, frame) && lit && name !== 'screen') motion.tube.disturb(.55);
        }
        if (import.meta.env.DEV) {
            this.host.dataset.crtPhase = this.crtMotion.phase;
            this.host.dataset.crtTheme = this.crtMotion.current?.id ?? '';
            this.host.dataset.crtLevel = this.crtMotion.level.toFixed(3);
        }
    }
    // paint() always returns fresh canvases; a downsampled hash skips the GPU
    // upload whenever a surface's pixels are unchanged (the 840x2630 paper
    // texture is by far the most expensive upload).
    private canvasHashes = new WeakMap<HTMLCanvasElement, number>();
    /**
     * Every readback waits for the GPU, so a repaint's canvases are reduced into
     * one atlas and read once (26 ms for 61 surfaces one by one, 6 ms together).
     * Mipmapped reduction averages each whole cell, so a small glyph still counts.
     */
    private hashFrames(canvases: HTMLCanvasElement[]) {
        const fresh = [...new Set(canvases)].filter(canvas => !this.canvasHashes.has(canvas));
        if (!fresh.length) return;
        const size = 32, columns = 8;
        // A new atlas each time: Chrome moves a canvas read back repeatedly to the CPU.
        const atlas = document.createElement('canvas');
        atlas.width = size * columns;
        atlas.height = size * Math.ceil(fresh.length / columns);
        const c = atlas.getContext('2d')!;
        c.imageSmoothingQuality = 'medium';
        fresh.forEach((canvas, i) => c.drawImage(canvas, i % columns * size, Math.floor(i / columns) * size, size, size));
        const data = c.getImageData(0, 0, atlas.width, atlas.height).data;
        fresh.forEach((canvas, i) => {
            let hash = (2166136261 ^ Math.imul(canvas.width, 73856093) ^ Math.imul(canvas.height, 19349663)) | 0;
            for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
                const p = ((Math.floor(i / columns) * size + y) * atlas.width + i % columns * size + x) * 4;
                hash = Math.imul(hash ^ (data[p] | data[p + 1] << 8 | data[p + 2] << 16 | data[p + 3] << 24), 16777619);
            }
            this.canvasHashes.set(canvas, hash);
        });
    }
    private frameHash(canvas: HTMLCanvasElement) {
        this.hashFrames([canvas]);
        return this.canvasHashes.get(canvas)!;
    }
    /** Returns whether the surface's pixels changed. */
    private updateFrame(name: string, frame: Frame) {
        const plane = this.planes.get(name);
        if (!plane) return false;
        const hash = this.frameHash(frame.canvas);
        let texture = this.textures.get(name);
        if (!texture) {
            texture = new THREE.CanvasTexture(frame.canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
            this.textures.set(name, texture);
            plane.material.map = texture;
            plane.material.needsUpdate = true;
            if (name === 'paper' && this.paper) {
                const stock = this.paper.material as THREE.MeshStandardMaterial;
                stock.map = texture; stock.needsUpdate = true;
                if (this.paperHead) {
                    const head = this.paperHead.material as THREE.MeshStandardMaterial;
                    head.map = texture; head.needsUpdate = true;
                }
            }
        } else {
            if (this.frameHashes.get(name) === hash) return false;
            // GPU storage is allocated once per texture: a canvas of another size
            // (a marquee strip, a differently fitted keyword module) needs a fresh one.
            const before = texture.image as HTMLCanvasElement;
            if (before.width !== frame.canvas.width || before.height !== frame.canvas.height) texture.dispose();
            texture.image = frame.canvas;
            texture.needsUpdate = true;
        }
        this.frameHashes.set(name, hash);
        this.dirty = true;
        return true;
    }
    private batchStaticGeometry(root: THREE.Object3D = this.model!, preserveAssemblies = true) {
        // Keep the .blend and GLB fully editable. Only the runtime coalesces
        // static, opaque parts by material; animated assemblies retain names.
        const moving = /^(ThemePanel_.*|ConsoleInstruments|InstrumentOriginal|Nixie_Digit_.*|FloppyTransport|FloppyEject|ScopeTuning|ScopeWave|ScopeRate|ScopePersistence|TransmitLever|PowerSwitch|Key_[0-4]|BatteryDoor|BatteryCell_[0-3]|CablePlug_.*|RosterCard_[AB][0-3]|MeterAmplitude|MeterRate|RearSoundSwitch|RearMusicSwitch|RearTestLamp|Connection[ _]lens|Instrument_RJ45[ _]lamp[ _][01]|Archive[ _]scroll[ _]wheel|PaperFeed|Paper[ _]roller|ReceiverNeedle|ManualKey|ChannelCopy|ScoreFlag_.*)$/;
        const batches = new Map<THREE.Material, THREE.Mesh[]>();
        root.updateWorldMatrix(true, true);
        const inverse = root.matrixWorld.clone().invert();
        root.traverse(o => {
            if (!(o instanceof THREE.Mesh) || Array.isArray(o.material) || o.material.transparent) return;
            // Morph-animated meshes (cable leads) must never merge into a batch.
            if (o.morphTargetInfluences?.length) return;
            for (let p: THREE.Object3D | null = o; preserveAssemblies && p && p !== root; p = p.parent) {
                if (moving.test(p.name)) return;
            }
            const list = batches.get(o.material) ?? [];
            list.push(o); batches.set(o.material, list);
        });
        for (const [material, meshes] of batches) {
            if (meshes.length < 2) continue;
            const geometries = meshes.map(mesh => {
                const geometry = mesh.geometry.clone().applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));
                // Preserve manufacturing UVs and baked mounting-contact colors.
                for (const name of Object.keys(geometry.attributes)) {
                    if (!['position', 'normal', 'uv', 'color'].includes(name)) geometry.deleteAttribute(name);
                }
                if (!geometry.getAttribute('uv')) geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 2), 2));
                return geometry;
            });
            const geometry = mergeGeometries(geometries, false);
            geometries.forEach(g => g.dispose());
            if (!geometry) continue;
            const batch = new THREE.Mesh(geometry, material);
            batch.name = 'Static batch / ' + material.name;
            batch.castShadow = batch.receiveShadow = true;
            root.add(batch);
            meshes.forEach(mesh => { mesh.removeFromParent(); mesh.geometry.dispose(); });
        }
        if (preserveAssemblies) {
            for (const panel of this.themePanels.values()) this.batchStaticGeometry(panel.object, false);
            for (const name of ['FloppyTransport', 'FloppyEject', 'ScopeTuning', 'ScopeWave', 'ScopeRate', 'ScopePersistence', 'TransmitLever', 'PowerSwitch', 'BatteryDoor', 'ManualKey', 'ChannelCopy', 'ReceiverNeedle']) {
                const assembly = this.part(name);
                if (assembly) this.batchStaticGeometry(assembly, false);
            }
            for (const { object } of this.removable.values()) this.batchStaticGeometry(object, false);
            for (const name of ['MeterAmplitude', 'MeterRate']) {
                const object = this.part(name);
                if (object) this.batchStaticGeometry(object, false);
            }
        }
    }
    testLamps() { if (this.powerOn) { this.testUntil = performance.now() + 1800; this.dirty = true; this.wake(); } }
    private indicatorState = -1;
    /** Returns whether a lamp went on or off, which the frame has to show even when nothing moves. */
    private syncIndicators(now: number) {
        const testing = this.powerOn && now < this.testUntil;
        const linked = this.powerOn && !(this.unpluggedCables & 1);
        const traffic = !!this.content?.connected && now < this.trafficUntil;
        const state = +testing | +linked << 1 | +traffic << 2 | +!!this.content?.connected << 3 | +this.powerOn << 4;
        const switched = state !== this.indicatorState;
        this.indicatorState = state;
        if (this.connectionLamp) {
            this.connectionLamp.emissive.set(this.content?.connected || testing ? '#328248' : '#a66318');
            this.connectionLamp.emissiveIntensity = testing ? .7 : !linked ? 0 : this.content?.connected ? .5 : .16;
        }
        this.networkLamps.forEach((material, index) => {
            material.emissive.set(index ? '#c89336' : '#328248');
            material.emissiveIntensity = testing ? .8 : !linked ? 0 : index === 0 ? .5 : traffic ? .8 : 0;
        });
        if (this.testLamp?.material instanceof THREE.MeshStandardMaterial) {
            this.testLamp.material.emissive.set('#80dc65');
            this.testLamp.material.emissiveIntensity = !this.powerOn ? 0 : testing ? .8 : .25;
        }
        if (testing && this.scopeLamp) this.scopeLamp.material.emissiveIntensity = this.scopeLamp.intensity;
        for (const [material, color] of this.indicatorColors)
            material.color.copy(color).multiplyScalar(material.emissiveIntensity > 0 ? 1 : .14);
        return switched;
    }
    private clearScopePersistence() {
        this.monitor.clear();
    }
    pulse(id: string) {
        this.pulses.set(id, performance.now());
        this.wake();
    }
    private syncPaperGeometry() {
        if (!this.paper) return;
        const position = this.paper.geometry.getAttribute('position');
        const uv = this.paper.geometry.getAttribute('uv');
        const columns = this.receipt.columns + 1, length = this.receipt.length;
        for (let i = 0; i <= this.receipt.rows; i++) for (let j = 0; j < columns; j++) {
            const vertex = this.receipt.sample(j, i);
            position.setXYZ(i * columns + j, vertex.x, vertex.y, vertex.z);
            uv.setXY(i * columns + j, vertex.u, vertex.v);
        }
        position.needsUpdate = true;
        this.paper.geometry.getAttribute('uv').needsUpdate = true;
        this.paper.geometry.computeVertexNormals();
        this.paper.geometry.computeBoundingSphere();
        if (this.paperHead) {
            // The stub shows the roll beyond the sheet's top, so its print
            // scrolls onto the leader as stock feeds out.
            const headUv = this.paperHead.geometry.getAttribute('uv');
            for (let i = 0; i < this.paperHeadArc.length; i++) for (let j = 0; j < columns; j++) {
                headUv.setY(i * columns + j, (length + this.paperHeadArc[i]) / paperTextureLength);
            }
            headUv.needsUpdate = true;
        }
        const plane = this.planes.get('paper');
        // The small printed leader moves with the free end; text never stretches
        // over the full paper length or stays behind on the metal panel.
        if (plane) { plane.position.y = this.paperNipY - length / 2; plane.scale.y = length / this.surfaces.paper.h; }
        if (this.paperRoller) {
            this.paperRoller.quaternion.copy(this.rollerRest);
            this.paperRoller.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.receipt.feedTravel / .095));
        }
        if (this.paperShadowSkip-- <= 0) {
            this.renderer.shadowMap.needsUpdate = true;
            this.paperShadowSkip = 3;
        }
        this.project();
    }
    private beginPaperReader() {
        if (!this.powerOn || !this.archiveOpen || this.paperReaderStarted || !['feeding', 'reading'].includes(this.receipt.phase)) return;
        this.paperReaderStarted = true;
        this.onPaperPull();
    }
    setQuality(profile: QualityProfile) {
        if (profile === this.quality) return;
        this.quality = profile;
        this.applyQuality();
    }
    private applyQuality() {
        const quality = this.quality;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio));
        // Without the softbox and rim, the remaining sources rise to the same
        // mean exposure (matched on the lit front of the late-game console).
        for (const light of this.areaLights) light.visible = quality.areaLights;
        for (const { light, intensity } of this.studio) light.intensity = intensity * (quality.areaLights ? 1 : 1.26);
        if (this.keyLight) this.keyLight.castShadow = quality.shadows;
        for (const glass of this.screenGlass) glass.visible = quality.screenGlass;
        for (const cover of this.nixieCovers) cover.visible = quality.nixieCover;
        // The cache key names the optics, so this selects the other program.
        for (const material of this.crtMaterials) material.needsUpdate = true;
        this.renderer.shadowMap.needsUpdate = true;
        // Also reprojects the DOM inputs, whose mapping follows the optics.
        this.resize();
    }
    /** Cost in ms of one frame at the current quality, measured once `warm` frames have settled the pipelines. */
    probe(warm = 8) {
        this.probing?.done(NaN);
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
        const gl = this.renderer.getContext(), pixel = new Uint8Array(4), costs: number[] = [];
        const deadline = performance.now() + 250;
        do {
            const started = performance.now();
            this.renderer.render(this.scene, this.camera);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            costs.push(performance.now() - started);
        } while (costs.length < 2 || performance.now() < deadline);
        const settled = costs.slice(costs.length >> 1).sort((a, b) => a - b);
        return settled[settled.length >> 1];
    }
    inspectInstrument(closeup: boolean) { this.inspectDetail(closeup ? 'meter' : null); }
    inspectWordScale(scale: number) {
        this.wordReviewScale = Math.max(1, Math.min(4, scale));
        this.inspectDetail('words');
    }
    inspectDetail(detail: string | null) {
        this.detailOverride = detail;
        this.resize();
    }
    facingRear() {
        this.root.updateWorldMatrix(true, false);
        return this.root.worldToLocal(this.camera.getWorldPosition(new THREE.Vector3())).z < -1;
    }
    beginHandle(side: HandleSide) {
        if (Math.abs(this.flipProgress - (this.backView ? 1 : 0)) > .02) return false;
        this.flipDirection = side === 'left' ? 1 : -1;
        this.handleDrag = 0;
        this.inspectionTargetYaw = this.inspectionTargetPitch = 0;
        this.wake();
        return true;
    }
    pullHandle(progress: number) { this.handleDrag = progress; this.wake(); }
    releaseHandle() { this.handleDrag = undefined; this.wake(); }
    turnTo(back: boolean, side: HandleSide = 'left') {
        if (back) this.flipDirection = side === 'left' ? 1 : -1;
        this.inspectionTargetYaw = this.inspectionTargetPitch = 0;
        this.handleDrag = undefined;
        this.backView = back;
        this.wake();
    }
    resetInspection() {
        this.inspectionTargetYaw = this.inspectionTargetPitch = 0;
        this.zoomTarget = 1;
        this.wake();
    }
    private resize() {
        this.width = this.host.clientWidth;
        this.height = this.host.clientHeight;
        this.renderer.setSize(this.width, this.height, false);
        this.fitCamera();
        this.dirty = true;
        this.wake();
        this.project();
        // ResizeObserver fires after the frame's draw; repaint the cleared canvas.
        if (this.width > 0 && this.height > 0) this.renderer.render(this.scene, this.camera);
    }
    private fitCamera() {
        const aspect = Math.max(1, this.width) / Math.max(1, this.height);
        const detail = this.detailOverride !== undefined ? this.detailOverride : import.meta.env.DEV ? new URLSearchParams(location.search).get('detail') : null;
        const framing = gameFraming(this.width, this.height);
        const normalHeight = this.inspectionEnabled ? Math.max(13.15, 19.8 / aspect) : framing.height;
        this.camera.aspect = aspect;
        const target = this.inspectionEnabled ? new THREE.Vector3(0, .1, -.4) : new THREE.Vector3(0, framing.centerY, 1.25);
        const direction = this.inspectionEnabled ? new THREE.Vector3(-.18, .28, 1).normalize() : new THREE.Vector3(0, 0, 1);
        const distance = normalHeight / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
        this.camera.zoom = this.inspectionEnabled ? this.zoom : 1;
        this.camera.clearViewOffset();
        this.camera.position.copy(target).addScaledVector(direction, distance);
        this.camera.lookAt(target);
        this.camera.updateProjectionMatrix();
        this.camera.updateMatrixWorld();
        const display = detail === 'words' ? this.surfaces.word1 : detail ? this.surfaces[detail] : undefined;
        if (detail === 'disk' || detail === 'meter' || detail === 'nixie' || detail === 'recorder' || display && (detail === 'screen' || detail === 'scope' || detail === 'words' || detail === 'score' || detail === 'roster')) {
            // Crop the original camera frustum without moving the camera:
            // close-up and full-console views keep exactly the same perspective.
            this.inspection.rotation.set(this.inspectionPitch, this.inspectionYaw, 0);
            this.root.updateWorldMatrix(true, false);
            const focus = (display
                ? this.root.localToWorld(new THREE.Vector3(detail === 'words' ? -.45 : display.x, display.y, display.z))
                : detail === 'meter' ? this.root.localToWorld(new THREE.Vector3(5.83, -1.78, 1.1))
                : new THREE.Vector3(5.83, detail === 'nixie' ? 3.55 : -.2, 1.1)).project(this.camera);
            const detailHeight = display
                ? Math.max(display.h * (detail === 'scope' ? 2.7 : detail === 'disk' ? 3.5 : 1.35), (detail === 'words' ? 9.8 : display.w * (detail === 'scope' ? 1.9 : 1.3)) / aspect)
                : Math.max(detail === 'nixie' ? 3.6 : 3.3, 4.1 / aspect);
            const scale = detail === 'words' && this.wordReviewScale !== undefined ? this.wordReviewScale : normalHeight / detailHeight;
            // The review slider starts at the normal full-console framing and
            // eases its focus up to the word windows as the view approaches 2x.
            if (detail === 'words' && this.wordReviewScale !== undefined) focus.multiplyScalar(Math.min(1, scale - 1));
            const w = this.width / scale, h = this.height / scale;
            this.camera.setViewOffset(this.width, this.height,
                (focus.x + 1) * this.width / 2 - w / 2, (1 - focus.y) * this.height / 2 - h / 2, w, h);
        }
    }
    bounds(target: Target) {
        if (target.surface === 'screen' && !this.crtMotion.interactive) return null;
        if (this.handleDrag !== undefined || Math.abs(this.flipProgress - (this.backView ? 1 : 0)) > .02) return null;
        const frame = target.surface in handleSurfaces ? { width: 1, height: 1 } : this.content?.frames[target.surface];
        const plane = this.planes.get(target.surface);
        const surface = this.surfaces[target.surface];
        if (!frame || !plane || !surface)
            return null;
        plane.updateWorldMatrix(true, false);
        const curvature = crtProfile(target.surface);
        const eye = plane.worldToLocal(this.camera.getWorldPosition(this.boundsEye));
        // DOM targets do not participate in depth testing. Cull the opposite
        // face and edge-on surfaces before they can intercept visible hardware.
        if (eye.z / eye.length() < .18) return null;
        // Include edge midpoints: a convex display's projected bounds can extend
        // beyond its four corners. Invert raster warp before sampling the face.
        const point = this.boundsPoint;
        let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
        for (const fy of [0, .5, 1]) for (const fx of [0, .5, 1]) {
            const u = (target.x + target.w * fx) / frame.width;
            const v = 1 - (target.y + target.h * fy) / frame.height;
            const uv = curvature ? crtDisplayUv(u, v, surface.w, surface.h, curvature, eye, this.quality.crtOptics === 'full') : { u, v };
            point.set((uv.u - .5) * surface.w, (uv.v - .5) * surface.h,
                curvature ? crtHeight(uv.u, uv.v, curvature.rise) : 0)
                .applyMatrix4(plane.matrixWorld).project(this.camera);
            const sx = (point.x + 1) * this.width / 2, sy = (1 - point.y) * this.height / 2;
            if (sx < left) left = sx;
            if (sx > right) right = sx;
            if (sy < top) top = sy;
            if (sy > bottom) bottom = sy;
        }
        if (target.id === 'disk-toggle' && ['pulling', 'settling', 'ejected', 'removed', 'returning'].includes(this.keyDisk.phase)) {
            this.disk.updateWorldMatrix(true, false);
            // Extend the grip to the physical disk as it emerges from the fascia.
            for (const x of [-.7, .7]) for (const z of [-.66, .66]) {
                point.set(this.diskPivot.x + x, this.diskPivot.y + .04, this.diskPivot.z + z).applyMatrix4(this.disk.matrixWorld).project(this.camera);
                const sx = (point.x + 1) * this.width / 2, sy = (1 - point.y) * this.height / 2;
                left = Math.min(left, sx); right = Math.max(right, sx);
                top = Math.min(top, sy); bottom = Math.max(bottom, sy);
            }
        }
        return { left, top, width: right - left, height: bottom - top };
    }
    diskPullAxis() {
        const from = this.diskRest.clone().add(this.diskPivot).addScaledVector(this.diskAxis, diskSeatTravel);
        const to = this.diskRest.clone().add(this.diskPivot).addScaledVector(this.diskAxis, diskEjectedTravel);
        this.disk.parent?.localToWorld(from);
        this.disk.parent?.localToWorld(to);
        from.project(this.camera); to.project(this.camera);
        const x = (to.x - from.x) * this.width / 2, y = -(to.y - from.y) * this.height / 2;
        const length = Math.hypot(x, y);
        return length > 2 ? { x: x / length, y: y / length, pixels: Math.max(48, Math.min(90, length)) } :
            { x: 0, y: 1, pixels: 90 };
    }
    setKeyDisk(disk: KeyDiskState) {
        this.keyDisk = disk;
        if (this.applyKeyDisk(performance.now())) this.dirty = true;
        this.wake();
    }
    private applyDiskTravel() {
        // The exported guide axis is perpendicular to the fascia. Keep lateral
        // position and height constant throughout both manual pushes and eject.
        this.disk.position.copy(this.diskRest).addScaledVector(this.diskAxis, this.diskTravel);
    }
    private applyKeyDisk(now: number) {
        const pose = keyDiskPose(this.keyDisk, now, this.reduced.matches);
        const previousVisible = this.disk.visible, previousTilt = this.disk.rotation.x;
        const previousX = this.disk.position.x, previousY = this.disk.position.y, previousZ = this.disk.position.z;
        this.disk.visible = pose.visible;
        this.diskTravel = pose.travel;
        this.applyDiskTravel();
        this.disk.position.x += pose.x;
        this.disk.position.y += pose.y;
        this.disk.position.z += pose.z;
        this.disk.rotation.x = pose.tilt;
        // The exported assembly origin is outside the shell: rotate delivery
        // about the disk itself, then align its entire surface with the guides.
        this.diskPivotRotated.copy(this.diskPivot).applyQuaternion(this.disk.quaternion);
        this.disk.position.add(this.diskPivot).sub(this.diskPivotRotated);
        if (this.ejectButton) {
            this.ejectButton.position.copy(this.ejectButtonRest);
            this.ejectButton.position.z -= pose.button * .058;
        }
        const elapsed = now - this.keyDisk.startedAt;
        const clunk = `${this.keyDisk.id}:${this.keyDisk.phase}:${this.keyDisk.startedAt}`;
        if (this.diskClunk !== clunk && (this.keyDisk.phase === 'inserting' && elapsed >= 1100 ||
            this.keyDisk.phase === 'ejecting' && elapsed >= 250)) {
            this.diskClunk = clunk;
            this.playSound(this.keyDisk.phase === 'ejecting' ? 'disk-out' : 'disk-seat');
        }
        if (import.meta.env.DEV) this.host.dataset.keyDiskPhase = this.keyDisk.phase;
        const changed = previousVisible !== this.disk.visible || previousTilt !== this.disk.rotation.x ||
            previousX !== this.disk.position.x || previousY !== this.disk.position.y || previousZ !== this.disk.position.z ||
            this.keyDisk.phase === 'ejecting';
        if (changed) this.renderer.shadowMap.needsUpdate = true;
        return changed;
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
        let changed = false, ambient = false;
        const crtInteractive = this.crtMotion.interactive;
        for (const tube of this.crtTubes.values()) {
            // A glass that is still changing owes every frame, whatever the ambient pace.
            changed ||= tube.motion.moving;
            tube.motion.advance(dt * this.rosterMotionRate, this.reduced.matches);
        }
        if (this.wordDisplay !== 'crt') {
            changed ||= !this.reduced.matches && this.dotBank.moving;
            this.dotBank.advance(dt * this.rosterMotionRate, this.reduced.matches);
        }
        this.syncCrt();
        // A page takes a little under half a second to arrive; every frame shows its progress.
        const written = this.reduced.matches ? 1 : Math.min(1, (now - this.writeStarted) / 450);
        this.terminal.write.value.x = written * terminalRows;
        // Including the frame that completes it.
        if (written < 1 || this.writing) changed = true;
        this.writing = written < 1;
        if (crtInteractive !== this.crtMotion.interactive) {
            this.project();
            changed = true;
        }
        const oldInspectionYaw = this.inspectionYaw, oldInspectionPitch = this.inspectionPitch;
        this.inspectionYaw = this.reduced.matches ? this.inspectionTargetYaw :
            THREE.MathUtils.damp(this.inspectionYaw, this.inspectionTargetYaw, 18, dt);
        this.inspectionPitch = this.reduced.matches ? this.inspectionTargetPitch :
            THREE.MathUtils.damp(this.inspectionPitch, this.inspectionTargetPitch, 18, dt);
        this.inspection.rotation.set(this.inspectionPitch, this.inspectionYaw, 0);
        const oldZoom = this.zoom;
        this.zoom = this.reduced.matches ? this.zoomTarget : THREE.MathUtils.damp(this.zoom, this.zoomTarget, 18, dt);
        if (Math.abs(this.zoom - this.zoomTarget) < .0001) this.zoom = this.zoomTarget;
        if (oldZoom !== this.zoom) {
            this.camera.zoom = this.zoom;
            this.camera.updateProjectionMatrix();
            this.project();
            changed = true;
        }
        let backdropMoved = false;
        if (this.backdrop) {
            // Keep the shadow receiver close head-on, then move it behind the
            // rotated chassis' conservative bounding depth before an edge can
            // cross the visible background.
            const safeZ = -3.95 - Math.abs(Math.sin(this.inspectionYaw + this.flipDirection * this.flipProgress * Math.PI)) * 8.2
                - Math.abs(Math.sin(this.inspectionPitch)) * 5.2;
            const oldZ = this.backdrop.position.z;
            this.backdrop.position.z = safeZ;
            backdropMoved = Math.abs(oldZ - this.backdrop.position.z) > .00001;
        }
        if (Math.abs(oldInspectionYaw - this.inspectionYaw) > .00001 ||
            Math.abs(oldInspectionPitch - this.inspectionPitch) > .00001 || backdropMoved) {
            this.project();
            this.renderer.shadowMap.needsUpdate = true;
            changed = true;
        }
        const previousPowerAngle = this.powerAngle;
        const powerTarget = this.switchOn ? 0 : -THREE.MathUtils.degToRad(this.powerSwitch?.userData.throw_degrees ?? 32);
        this.powerAngle = this.reduced.matches ? powerTarget : THREE.MathUtils.damp(this.powerAngle, powerTarget, 22, dt);
        if (Math.abs(this.powerAngle - powerTarget) < .001) this.powerAngle = powerTarget;
        if (this.powerSwitch) this.powerSwitch.rotation.z = this.powerAngle;
        if (previousPowerAngle !== this.powerAngle) { this.renderer.shadowMap.needsUpdate = true; changed = true; }
        let feeding = false;
        if (this.receipt.active && (this.powerOn || this.receipt.phase === 'tearing')) {
            const phase = this.receipt.phase, travel = this.receipt.feedTravel, tear = this.receipt.pose.tear;
            this.receipt.advance(dt * 1000 * this.rosterMotionRate, this.reduced.matches, this.powerOn);
            // Rollers sound only while moving; the rip starts when fibers break.
            if (this.receipt.feedTravel > travel) {
                if (this.reduced.matches) this.playSound('paper-feed');
                else feeding = true;
            }
            if (phase === 'tearing' && (this.reduced.matches || (tear === 0 && this.receipt.pose.tear > 0)))
                this.playSound('paper-tear');
            this.syncPaperGeometry();
            changed = true;
            if (!this.receipt.active) this.renderer.shadowMap.needsUpdate = true;
            if (this.paper) {
                this.paper.visible = this.receipt.opacity > 0 && this.receipt.length > .0001;
                this.paper.traverse(object => {
                    if (object instanceof THREE.Mesh) (object.material as THREE.MeshStandardMaterial).opacity = this.receipt.opacity;
                });
            }
            if (import.meta.env.DEV) {
                this.host.dataset.paperPhase = this.receipt.phase;
                this.host.dataset.paperLength = this.receipt.length.toFixed(4);
                this.host.dataset.paperTear = this.receipt.pose.tear.toFixed(3);
            }
            // Also start the reader for a queued reopening after refill.
            this.beginPaperReader();
        }
        // Asked every frame while the rollers turn (a start can still be refused), once when they stop.
        if (feeding || this.feeding) this.setPaperFeed(feeding);
        this.feeding = feeding;
        const manualDepth = this.manualDepth;
        this.manualDepth = this.reduced.matches ? (this.manual ? .035 : 0) : THREE.MathUtils.damp(this.manualDepth, this.manual ? .035 : 0, 20, dt);
        if (this.manualKey) this.manualKey.position.z = .85 - this.manualDepth;
        if (Math.abs(this.manualDepth - manualDepth) > .00001) { this.project(); this.renderer.shadowMap.needsUpdate = true; changed = true; }
        if (this.instrumentVariant === 'original') {
            const oldMeter = this.meterAngle;
            // A local analog toy. Its motion has no connection to game progress.
            const level = .12 + this.meterAmplitude * .19;
            const speed = .5 * 2 ** (this.meterRate * .62);
            const wave = Math.sin(now / 1000 * speed * 3.2) * .70 + Math.sin(now / 1000 * speed * 7.7) * .30;
            const meterTarget = this.powerOn ? this.reduced.matches ? 0 : wave * level : -.82;
            this.meterAngle = this.reduced.matches ? meterTarget : THREE.MathUtils.damp(this.meterAngle, meterTarget, 12, dt);
            if (this.receiverNeedle) this.receiverNeedle.rotation.z = -this.meterAngle;
            if (Math.abs(oldMeter - this.meterAngle) > .0001) ambient = true;
            for (const [knob, value] of [[this.meterKnobs[0], this.meterAmplitude], [this.meterKnobs[1], this.meterRate]] as const) {
                if (knob) knob.rotation.z = -.85 + value * .425;
            }
        }
        const instruments = this.instruments?.tick(now, dt, this.reduced.matches);
        if (instruments === 'control') changed = true;
        else if (instruments === 'needle') ambient = true;
        for (const [name, item] of this.removable) {
            const battery = name.startsWith('BatteryCell_');
            const index = battery ? Number(name.slice(-1)) : ['RJ45', 'Serial', 'DC'].indexOf(name.slice(10));
            const target = ((battery ? this.removedBatteries : this.unpluggedCables) & (1 << index)) ? 1 : 0;
            const previous = item.amount;
            item.amount = this.reduced.matches ? target : THREE.MathUtils.damp(item.amount, target, 10, dt);
            if (Math.abs(item.amount - target) < .001) item.amount = target;
            item.object.position.copy(item.rest);
            if (battery) {
                // Clear the retaining clips before lowering the removed cell
                // below its bay; the empty seat remains visibly inspectable.
                item.object.position.z -= Math.min(1, item.amount / .38) * 1.1;
                item.object.position.y -= Math.max(0, (item.amount - .38) / .62) * 3.55;
            } else {
                item.object.position.z -= item.amount * .85;
                item.object.position.y -= item.amount * .22;
                const lead = this.cableLeads.get(name);
                if (lead?.mesh.morphTargetInfluences)
                    lead.mesh.morphTargetInfluences[lead.index] = item.amount;
            }
            if (previous !== item.amount) { this.project(); this.renderer.shadowMap.needsUpdate = true; changed = true; }
        }
        for (const [id, seat] of this.rosterCards) {
            const previous = seat.motion.amount;
            seat.motion.advance(dt * this.rosterMotionRate, this.reduced.matches);
            const pose = rosterPose(seat.motion.amount, seat.travel);
            seat.object.visible = !!seat.motion.current && pose.opacity > 0;
            seat.object.position.copy(seat.rest);
            seat.object.position.y += pose.y;
            seat.object.position.z += pose.z;
            for (const material of seat.materials) material.opacity = pose.opacity;
            const frame = seat.motion.current?.frame;
            if (frame && frame !== seat.printed) {
                this.updateFrame('roster' + id, frame);
                seat.printed = frame;
            }
            if (previous !== seat.motion.amount) { this.project(); this.renderer.shadowMap.needsUpdate = true; changed = true; }
        }
        for (const [name, panel] of this.themePanels) {
            const previous = panel.motion.amount;
            panel.motion.advance(dt * this.rosterMotionRate, this.reduced.matches);
            const pose = rosterPose(panel.motion.amount, .5);
            panel.object.visible = !!panel.motion.current && pose.opacity > 0;
            panel.object.position.set(panel.rest.x, panel.rest.y + pose.y, panel.rest.z + pose.z);
            for (const { material, opacity } of panel.materials) material.opacity = opacity * pose.opacity;
            const frame = panel.motion.current?.frame;
            if (panel.motion.current) for (const material of panel.enamel) material.color.set(panel.motion.current.color);
            if (frame && frame !== panel.printed) {
                this.updateFrame(name, frame);
                panel.printed = frame;
            }
            if (previous !== panel.motion.amount) { this.renderer.shadowMap.needsUpdate = true; changed = true; }
        }
        const previousFlip = this.flipProgress;
        const targetFlip = this.handleDrag ?? (this.backView ? 1 : 0);
        this.flipProgress = this.reduced.matches ? targetFlip : THREE.MathUtils.damp(this.flipProgress, targetFlip, 7.5, dt);
        if (Math.abs(this.flipProgress - targetFlip) < .0005) this.flipProgress = targetFlip;
        const lift = Math.sin(this.flipProgress * Math.PI);
        this.turntable.rotation.set(-lift * .09, this.flipDirection * this.flipProgress * Math.PI, -this.flipDirection * lift * .035);
        this.turntable.position.set(0, lift * .32, .5 + lift * 1.3);
        const oldBatteryAngle = this.batteryAngle;
        this.batteryAngle = this.reduced.matches ? (this.batteryOpen ? 1.85 : 0) :
            THREE.MathUtils.damp(this.batteryAngle, this.batteryOpen ? 1.85 : 0, 11, dt);
        if (Math.abs(this.batteryAngle - (this.batteryOpen ? 1.85 : 0)) < .0005)
            this.batteryAngle = this.batteryOpen ? 1.85 : 0;
        this.batteryDoor.rotation.y = this.batteryAngle;
        for (const [slider, enabled] of [[this.soundSwitch, this.soundOn], [this.musicSwitch, this.musicOn]] as const) {
            if (!slider) continue;
            const target = slider.userData.centerX + (enabled ? -.22 : .22);
            if (slider.position.x === target) continue;
            slider.position.x = this.reduced.matches ? target : THREE.MathUtils.damp(slider.position.x, target, 24, dt);
            if (Math.abs(slider.position.x - target) < .0005) slider.position.x = target;
            this.renderer.shadowMap.needsUpdate = true;
            changed = true;
        }
        for (const flag of this.scoreFlags.values()) {
            if (flag.motion.advance(dt * this.rosterMotionRate, this.reduced.matches)) {
                flag.object.rotation.x = flag.motion.angle;
                changed = true;
            }
            if (flag.motion.consumeImpact()) this.playSound('score');
        }
        if (this.syncIndicators(now)) changed = true;
        if (previousFlip !== this.flipProgress || oldBatteryAngle !== this.batteryAngle) { this.project(); changed = true; }
        const diskChanged = this.applyKeyDisk(now);
        if (diskChanged) this.project();
        if (previousFlip !== this.flipProgress || oldBatteryAngle !== this.batteryAngle ||
            diskChanged ||
            Math.abs(this.scopeAngle - this.scopeDesiredAngle) > .0001 ||
            Math.abs(this.scopeWaveAngle - this.scopeWaveDesiredAngle) > .0001 ||
            Math.abs(this.scopeRateAngle - this.scopeRateDesiredAngle) > .0001 ||
            Math.abs(this.scopeAxisAngle - this.scopeAxisDesiredAngle) > .0001 || this.pulses.size > 0) {
            this.renderer.shadowMap.needsUpdate = true;
            changed = true;
        }
        this.scopeAngle = this.reduced.matches ? this.scopeDesiredAngle : THREE.MathUtils.damp(this.scopeAngle, this.scopeDesiredAngle, 16, dt);
        this.tuningKnob.rotation.z = this.scopeAngle;
        this.scopeWaveAngle = this.reduced.matches ? this.scopeWaveDesiredAngle : THREE.MathUtils.damp(this.scopeWaveAngle, this.scopeWaveDesiredAngle, 16, dt);
        this.waveKnob.rotation.z = this.scopeWaveAngle;
        this.scopeRateAngle = this.reduced.matches ? this.scopeRateDesiredAngle : THREE.MathUtils.damp(this.scopeRateAngle, this.scopeRateDesiredAngle, 16, dt);
        this.rateKnob.rotation.z = this.scopeRateAngle;
        this.scopeAxisAngle = this.reduced.matches ? this.scopeAxisDesiredAngle : THREE.MathUtils.damp(this.scopeAxisAngle, this.scopeAxisDesiredAngle, 16, dt);
        this.persistenceKnob.rotation.z = this.scopeAxisAngle;
        for (const [id, time] of this.pulses) {
            const age = (now - time) / 1000;
            const amount = this.reduced.matches ? 0 : Math.sin(Math.min(age / .36, 1) * Math.PI);
            if (id.startsWith('key-')) {
                const index = id.slice(4);
                const obj = this.model?.getObjectByName('Key_' + index);
                if (obj)
                    obj.position.z = .76 - amount * .07;
                const face = this.planes.get('key' + index);
                if (face)
                    face.position.z = .888 - amount * .07;
            }
            else if (id === 'transmit') {
                const lever = this.model?.getObjectByName('TransmitLever');
                if (lever)
                    lever.position.z = .91 - amount * .12;
            } else if (id === 'copy-code') {
                if (this.copyKey) this.copyKey.position.z = this.copyKeyRestZ - amount * .035;
            }
            if (age > .36)
                this.pulses.delete(id);
        }
        const live = this.powerOn && !this.reduced.matches;
        // Power-on keeps the CRT raster, scope and needle alive. Frames that
        // carry nothing else are ambient, paced by the quality level and slower
        // still while nobody is at the console; any state the player changed
        // (`dirty`, `changed`) renders at once. A stage without a size (the
        // phone layout hides it) renders nothing.
        const probing = this.probing;
        // A paced-out needle movement stays owed, so its resting pose is drawn.
        this.ambientOwed ||= ambient;
        const pace = ambientRate(this.quality, this.focused, now - this.lastInput);
        const due = this.width > 0 && this.height > 0 && (changed || this.dirty || !!probing ||
            (live || this.ambientOwed) && now - this.rendered >= 1000 / pace - 2);
        if (due && this.flipProgress < .65 && (live || this.dirty)) {
            // The beam runs for all the time since the phosphor was last shown.
            this.drawScope(Math.min((now - this.scopeDrawn) / 1000, .1));
            this.scopeDrawn = now;
        }
        this.crtTime.value = this.reduced.matches ? 0 : now / 1000;
        // A glow discharge is never quite still: each tube breathes a little on its own.
        this.nixieCoronas.forEach((tube, slot) => {
            const breath = this.reduced.matches ? 1 : 1 + .04 * Math.sin(now * .0131 + slot * 2.1) + .025 * Math.sin(now * .0473 + slot * 1.3);
            tube.material.opacity = .85 * breath;
            if (tube.spill.opacity > 0) tube.spill.opacity = .24 * breath;
        });
        if (due) {
            this.dirty = this.ambientOwed = false;
            this.rendered = now;
            this.scopeFrames++;
            this.renderer.render(this.scene, this.camera);
            if (probing && probing.warm-- <= 0) {
                this.probing = undefined;
                probing.done(this.frameCost());
            }
        }
        if (import.meta.env.DEV && now - this.scopeFpsStarted >= 750) {
            this.renderer.domElement.dataset.scopeFps = (this.scopeFrames * 1000 / (now - this.scopeFpsStarted)).toFixed(1);
            this.renderer.domElement.dataset.drawCalls = String(this.renderer.info.render.calls);
            this.renderer.domElement.dataset.triangles = String(this.renderer.info.render.triangles);
            this.renderer.domElement.dataset.face = this.backView ? 'rear' : 'front';
            this.renderer.domElement.dataset.ambientPace = String(pace);
            this.scopeFrames = 0;
            this.scopeFpsStarted = now;
        }
        // Motion, a change still to draw or a measurement: every display frame.
        // Otherwise sleep until just before the next ambient frame or lamp
        // timeout; input and every public call wake the loop at once.
        if (this.raf) return;
        const visible = this.width > 0 && this.height > 0;
        if (changed || visible && (this.dirty || !!this.probing)) {
            this.raf = requestAnimationFrame(this.tick);
            return;
        }
        const next = Math.min(visible && (live || this.ambientOwed) ? this.rendered + 1000 / pace - 2 : Infinity,
            ...[this.testUntil, this.trafficUntil].filter(until => until > now), now + 500);
        // A frame request must land in the display interval before the one that is due.
        clearTimeout(this.sleep);
        this.sleep = window.setTimeout(this.wake, Math.max(0, next - performance.now() - 12));
    };
    private drawScopeGraticule() {
        const c = this.scopeGridCanvas.getContext('2d')!;
        const w = 420, plotBottom = 292;
        c.fillStyle = '#0e2118';
        c.fillRect(0, 0, w, 350);
        const bloom = c.createRadialGradient(210, 145, 10, 210, 145, 278);
        bloom.addColorStop(0, 'rgba(117, 156, 67, .14)');
        bloom.addColorStop(.72, 'rgba(45, 74, 31, .05)');
        bloom.addColorStop(1, 'rgba(3, 12, 8, .72)');
        c.fillStyle = bloom;
        c.fillRect(0, 0, w, 350);
        c.strokeStyle = 'rgba(111, 143, 72, .20)';
        c.lineWidth = 1;
        for (let x = 0; x <= w; x += 35) {
            c.beginPath(); c.moveTo(x, 0); c.lineTo(x, plotBottom); c.stroke();
        }
        for (let y = 5; y <= plotBottom; y += 35) {
            c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
        }
        c.strokeStyle = 'rgba(136, 159, 88, .38)';
        c.beginPath(); c.moveTo(210, 0); c.lineTo(210, plotBottom); c.stroke();
        c.beginPath(); c.moveTo(0, 146); c.lineTo(w, 146); c.stroke();
        c.fillStyle = 'rgba(139, 163, 94, .46)';
        for (let n = -10; n <= 10; n++) {
            c.fillRect(210 + n * 7 - .5, 142, 1, 8);
            c.fillRect(206, 146 + n * 7 - .5, 8, 1);
        }
        c.fillStyle = 'rgba(8, 28, 35, .42)';
        c.fillRect(0, plotBottom, w, 58);
        c.strokeStyle = 'rgba(160, 203, 200, .15)';
        c.beginPath(); c.moveTo(0, plotBottom + .5); c.lineTo(w, plotBottom + .5); c.stroke();
    }
    private drawScope(dt: number) {
        // Unpowered, the tube keeps its last trace while it collapses; dark glass shows no picture at all.
        if (!this.powerOn) return;
        // The tube is simulated, not plotted: two oscillators steer one beam and
        // the phosphor keeps what it wrote. Reduced motion shows a long exposure.
        this.monitor.run(dt, { freq: this.scopeFreq, wave: this.scopeWave, rate: this.scopeRate, axis: this.scopeAxis }, this.reduced.matches);
        // LOCK lamp: a phase detector seen through a slow, warm filament. Fast
        // slipping blurs to a half glow; near a tongue it beats ever more slowly,
        // then steadies as the oscillators lock, brightest dead in tune.
        if (this.scopeLamp) {
            const drive = (1 + this.monitor.signal.coherence) / 2;
            this.scopeLampGlow = this.reduced.matches ? drive : THREE.MathUtils.damp(this.scopeLampGlow, drive, 5.5, dt);
            // A filament's light rises much faster than its drive, so beats read clearly.
            this.scopeLamp.material.emissiveIntensity = this.scopeLamp.intensity * (performance.now() < this.testUntil ? 1 : .03 + .97 * this.scopeLampGlow ** 3);
        }
        const trace = this.scopeTraceCanvas.getContext('2d')!;
        const glow = this.scopeGlow ??= trace.createImageData(scopeTuning.width, scopeTuning.height);
        this.monitor.phosphor.expose(glow.data);
        trace.putImageData(glow, 0, 0);
        const bloom = this.scopeBloomCanvas.getContext('2d')!;
        bloom.clearRect(0, 0, this.scopeBloomCanvas.width, this.scopeBloomCanvas.height);
        bloom.drawImage(this.scopeTraceCanvas, 0, 0, this.scopeBloomCanvas.width, this.scopeBloomCanvas.height);

        const c = this.scopeCanvas.getContext('2d')!;
        c.clearRect(0, 0, 420, 350);
        c.drawImage(this.scopeGridCanvas, 0, 0);
        // Light adds to the lit graticule: a soft halo in the glass, then the trace.
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = .5; c.drawImage(this.scopeBloomCanvas, 0, 0, scopeTuning.width, scopeTuning.height);
        c.globalAlpha = 1; c.drawImage(this.scopeTraceCanvas, 0, 0);
        c.restore();
        const ratio = scopeRatio(this.scopeFreq), hz = scopeSweepHz(this.scopeRate), resonance = scopeResonance(ratio);
        c.fillStyle = 'rgba(211, 239, 232, .86)';
        c.font = '17px "PingFang SC", sans-serif';
        const blend = scopeWaveBlend(this.scopeWave), shape = translate(this.locale, scopeModes[blend.from]);
        c.fillText(`${blend.mix ? `${shape}›${translate(this.locale, scopeModes[blend.to])}` : shape} · ${scopeFigures(ratio * hz)} Hz`, 20, 319);
        c.textAlign = 'right';
        // Inside a tongue the oscillators hold a whole-number ratio and the figure stands.
        if (!resonance?.locked) c.fillStyle = '#c99d65';
        c.fillText(resonance?.locked ? translate(this.locale, '锁定 {0}', [`${resonance.p}:${resonance.q}`]) : translate(this.locale, '自由运行'), 400, 319);
        c.textAlign = 'left';
        c.fillStyle = 'rgba(174, 211, 205, .75)';
        c.font = '14px "PingFang SC", sans-serif';
        const div = translate(this.locale, '每格'), turned = Math.round(scopeAxisAngle(this.scopeAxis) * 180 / Math.PI);
        const horizontal = turned <= 0 ? `${scopeFigures(scopeTimebase(this.scopeRate) * 1000)} ms/${div}` : turned >= 90 ? 'X-Y' : `X-Y ${turned}°`;
        c.fillText(`0.5 V/${div} · ${horizontal}`, 20, 340);
        c.textAlign = 'right';
        c.fillText(`Y:X ${ratio.toFixed(3)}`, 400, 340);
        c.textAlign = 'left';
        crtFinish(c, 420, 350);
        const texture = this.textures.get('scope');
        if (texture)
            texture.needsUpdate = true;
    }
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
        this.host.removeEventListener('pointerdown', this.onInspectionDown, true);
        this.host.removeEventListener('pointermove', this.onInspectionMove, true);
        this.host.removeEventListener('pointerup', this.finishInspection, true);
        this.host.removeEventListener('pointercancel', this.finishInspection, true);
        this.host.removeEventListener('lostpointercapture', this.finishInspection, true);
        this.host.removeEventListener('auxclick', this.onInspectionAuxClick, true);
        this.host.removeEventListener('wheel', this.onInspectionWheel);
        delete this.host.dataset.inspection;
        delete this.host.dataset.inspecting;
        delete this.host.dataset.crtPhase;
        delete this.host.dataset.crtTheme;
        delete this.host.dataset.crtLevel;
        this.disposeObject(this.scene);
        for (const texture of this.textures.values())
            texture.dispose();
        this.environment.dispose();
        this.draco.dispose();
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
