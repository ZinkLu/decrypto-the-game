import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import dracoWasmUrl from 'three/examples/jsm/libs/draco/gltf/draco_decoder.wasm?url';
import dracoWrapperUrl from 'three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js?url';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { crtFinish, type Content, type Frame, type Target } from './paint';
import { RosterMotion, rosterPose } from './rosterMotion';
import { crtProfile, crtGeometry, crtHeight, crtDisplayUv, crtOpticsShader } from './crt';
import { scopeModes, scopeRates, scopePersistenceModes, type HardwareState } from './model';
import { waveSample, paperTooth, paperTextureLength, receiptHeadPath } from './mechanics';
import { ReceiptTransport } from './tearing';
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
    private backView = false;
    private flipProgress = 0;
    private batteryOpen = false;
    private batteryAngle = 0;
    private batteryDoor = new THREE.Group() as THREE.Object3D;
    private soundOn = false;
    private powerOn = true;
    private powerSwitch?: THREE.Object3D;
    private copyKey?: THREE.Object3D;
    private copyKeyRestZ = 0;
    private powerAngle = 0;
    private poweredMaterials = new Map<THREE.MeshStandardMaterial, number>();
    private audio?: AudioContext;
    private testUntil = 0;
    private testLamp?: THREE.Mesh;
    private surfaces: Record<string, Surface> = {};
    private planes = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial | THREE.MeshStandardMaterial>>();
    private textures = new Map<string, THREE.CanvasTexture>();
    private content?: Content;
    private model?: THREE.Group;
    private backdrop?: THREE.Mesh;
    private observer: ResizeObserver;
    private raf = 0;
    private disposed = false;
    private last = 0;
    private width = 1;
    private height = 1;
    private disk: THREE.Object3D = new THREE.Group();
    private diskRest = new THREE.Vector3();
    private tuningKnob: THREE.Object3D = new THREE.Group();
    private rateKnob: THREE.Object3D = new THREE.Group();
    private persistenceKnob: THREE.Object3D = new THREE.Group();
    private diskOut = false;
    private diskProgress = 0;
    private paper?: THREE.Mesh;
    private paperHead?: THREE.Mesh;
    private paperHeadArc: number[] = [];
    private paperRoller?: THREE.Object3D;
    private paperNipY = 0;
    private nixieDigits: { mesh: THREE.Mesh; slot: number; digit: number }[] = [];
    private nixieCoronas: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; paths: string[]; code: string }[] = [];
    private crtTime = { value: 0 };
    private crtPower = { value: 1 };
    private rollerRest = new THREE.Quaternion();
    private receipt = new ReceiptTransport();
    private paperReaderStarted = false;
    private archiveOpen = false;
    private manual = false;
    private manualDepth = 0;
    private meterAngle = -.82;
    private meterAmplitude = 2;
    private meterRate = 2;
    private removedBatteries = 0;
    private unpluggedCables = 0;
    private removable = new Map<string, { object: THREE.Object3D; rest: THREE.Vector3; amount: number }>();
    private cableLeads = new Map<string, { mesh: THREE.Mesh; index: number }>();
    private rosterCards = new Map<string, { object: THREE.Object3D; rest: THREE.Vector3; travel: number;
        motion: RosterMotion<{ id: string; frame: Frame }>; printed?: Frame; materials: THREE.Material[] }>();
    private lampMaterials = new Map<string, THREE.MeshStandardMaterial>();
    private scopeMode = 0;
    private scopeAngle = 0;
    private scopeDesiredAngle = 0;
    private scopeRate = 2;
    private scopeRateAngle = 0;
    private scopeRateDesiredAngle = 0;
    private scopePersistence = 1;
    private scopePersistenceAngle = 0;
    private scopePersistenceDesiredAngle = 0;
    private scopeFrames = 0;
    private scopeFpsStarted = performance.now();
    private reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    private rosterMotionRate = import.meta.env.DEV && new URLSearchParams(location.search).get('motion') === 'slow' ? .2 : 1;
    private pulses = new Map<string, number>();
    private environment: THREE.WebGLRenderTarget;
    private draco = new DRACOLoader().setDecoderPath({ js: dracoWrapperUrl, wasm: dracoWasmUrl }).setWorkerLimit(2);
    private scopeCanvas = document.createElement('canvas');
    private scopeGridCanvas = document.createElement('canvas');
    private scopeTraceCanvas = document.createElement('canvas');
    private onContextLost = (e: Event) => { e.preventDefault(); this.fail('图形连接已中断，请刷新终端。'); };
    private onInspectionDown = (e: PointerEvent) => {
        if (!this.inspectionEnabled || e.button !== 1) return;
        e.preventDefault();
        this.inspectionDrag = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
        this.host.dataset.inspecting = 'true';
        this.host.setPointerCapture(e.pointerId);
    };
    private onInspectionMove = (e: PointerEvent) => {
        const drag = this.inspectionDrag;
        if (!drag || drag.pointerId !== e.pointerId) return;
        e.preventDefault();
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        this.inspectionTargetYaw = THREE.MathUtils.clamp(this.inspectionTargetYaw + dx * .0055, -.70, .70);
        this.inspectionTargetPitch = THREE.MathUtils.clamp(this.inspectionTargetPitch + dy * .0045, -.36, .36);
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
    constructor(private host: HTMLElement, private project: () => void, private fail: (message: string) => void,
        private onPaperPull: () => void = () => {}, private inspectionEnabled = false) {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.04;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.autoUpdate = false;
        this.renderer.shadowMap.needsUpdate = true;
        this.renderer.shadowMap.type = THREE.VSMShadowMap;
        this.renderer.domElement.setAttribute('aria-hidden', 'true');
        this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
        host.prepend(this.renderer.domElement);
        if (this.inspectionEnabled) {
            host.dataset.inspection = 'enabled';
            host.addEventListener('pointerdown', this.onInspectionDown, true);
            host.addEventListener('pointermove', this.onInspectionMove, true);
            host.addEventListener('pointerup', this.finishInspection, true);
            host.addEventListener('pointercancel', this.finishInspection, true);
            host.addEventListener('auxclick', this.onInspectionAuxClick, true);
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
        this.scene.add(new THREE.HemisphereLight('#f5e4cb', '#53636d', .26));
        const key = new THREE.DirectionalLight('#ffe9c7', 3.4);
        key.position.set(-8, 10, 12);
        key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048);
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
        const back = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#bcb5a5', roughness: .94 }));
        back.position.z = -3.95;
        back.receiveShadow = true;
        this.backdrop = back;
        this.scene.add(back);
        for (const canvas of [this.scopeCanvas, this.scopeGridCanvas, this.scopeTraceCanvas]) {
            canvas.width = 420;
            canvas.height = 350;
        }
        this.drawScopeGraticule();
        this.observer = new ResizeObserver(() => this.resize());
        this.observer.observe(host);
        this.resize();
        this.raf = requestAnimationFrame(this.tick);
    }
    async load() {
        // Geometry and projected labels must always share a revision, including
        // on servers that allow the browser to reuse previously cached assets.
        const revision = 'console-lighting-20260915-v20';
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
            batteryControl: { x: -3.4, y: .62, z: -3.66, w: 5.6, h: 4.2, rotationY: Math.PI },
            soundControl: { x: 4.92, y: -1.4, z: -3.25, w: 1.35, h: .60, rotationY: Math.PI },
            testControl: { x: -.05, y: -2.76, z: -3.27, w: .70, h: .70, rotationY: Math.PI },
        };
        this.model = gltf.scene;
        gltf.scene.traverse(o => { if (o instanceof THREE.Mesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            if (/^Ruby[ _]lens[ _][0-3]$/.test(o.name) && o.material instanceof THREE.MeshStandardMaterial) {
                // The exported flat lens becomes the dark seat beneath the new
                // curved glass; a second glossy face left straight white strips.
                o.material.color.set('#160806');
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
            if (name === 'channel' || name === 'paper') plane.visible = false;
            if (curvature) {
                const profile = name.startsWith('word') ? 1 : name === 'scope' ? 2 : 0;
                const seed = name.startsWith('word') ? Number(name.slice(4)) + 1 : 0;
                const eye = { value: new THREE.Vector3() };
                plane.onBeforeRender = (_renderer, _scene, camera) => {
                    camera.getWorldPosition(eye.value);
                    plane.worldToLocal(eye.value);
                };
                material.onBeforeCompile = shader => {
                    shader.uniforms.crtTime = this.crtTime;
                    shader.uniforms.crtPower = this.crtPower;
                    shader.uniforms.crtProfile = { value: profile };
                    shader.uniforms.crtSeed = { value: seed };
                    shader.uniforms.crtCurve = { value: curvature.warp };
                    shader.uniforms.crtAspect = { value: s.w / s.h };
                    shader.uniforms.crtEye = eye;
                    shader.uniforms.crtSize = { value: new THREE.Vector2(s.w, s.h) };
                    shader.uniforms.crtRise = { value: curvature.rise };
                    shader.uniforms.crtInnerRise = { value: curvature.innerRise };
                    shader.uniforms.crtDepth = { value: curvature.depth };
                    shader.fragmentShader = crtOpticsShader + `
                        uniform float crtTime;
                        uniform float crtPower;
                        uniform float crtProfile;
                        uniform float crtSeed;
                        uniform float crtCurve;
                        uniform float crtAspect;
                        float crtHash(vec2 p) {
                            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
                        }
                        vec3 crtEmission(sampler2D crtMap, vec2 uv) {
                            vec3 signal = texture2D(crtMap, clamp(uv, .002, .998)).rgb;
                            float peak = max(max(signal.r, signal.g), signal.b);
                            return signal * smoothstep(.035, .20, peak);
                        }
                    ` + shader.fragmentShader;
                    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
                        #ifdef USE_MAP
                        vec2 crtCentered = crtPhosphorUv(vMapUv) - .5;
                        float crtRadius = dot(crtCentered, crtCentered);
                        vec2 crtRasterUv = .5 + crtCentered * (1.0 + crtRadius * crtCurve);
                        vec2 crtUv = clamp(crtRasterUv, .002, .998);
                        // Each ruby window owns a separate clock and noise seed.
                        // A burst now averages roughly once every four seconds
                        // and lasts under 200ms instead of occupying a full tick.
                        float crtClock = crtTime * .85 + crtSeed * 5.17;
                        float crtTick = floor(crtClock);
                        float crtPulse = 1.0 - step(.16, fract(crtClock));
                        float crtBurst = step(.68, crtHash(vec2(crtTick, crtSeed * 13.7 + 4.7))) * crtPulse;
                        crtBurst *= step(.5, crtProfile) * step(crtProfile, 1.5) * step(.0001, crtTime);
                        float crtTearY = .12 + crtHash(vec2(crtTick + crtSeed * 7.3, 8.3)) * .76;
                        float crtTear = (1.0 - smoothstep(.003, .022, abs(crtUv.y - crtTearY))) * crtBurst;
                        crtUv.x = clamp(crtUv.x + crtTear * (crtHash(vec2(crtTick, crtSeed * 9.1 + 2.1)) - .5) * .075, .002, .998);
                        float crtSplit = (.0012 + crtTear * .009) * crtPower;
                        vec4 crtCenter = texture2D(map, crtUv);
                        vec4 crtLeft = texture2D(map, clamp(crtUv - vec2(crtSplit, 0.0), .002, .998));
                        vec4 crtRight = texture2D(map, clamp(crtUv + vec2(crtSplit, 0.0), .002, .998));
                        vec4 sampledDiffuseColor = crtProfile > .5 && crtProfile < 1.5
                            ? vec4(crtRight.r, crtCenter.g, crtLeft.b, crtCenter.a)
                            : crtCenter;
                        // Halation follows bright ink and traces only. Dark glass
                        // cannot produce this light, and power-off suppresses it.
                        vec2 glowStep = vec2(.0022 / crtAspect, .0022);
                        vec3 crtHalo = (crtEmission(map, crtUv + vec2(glowStep.x, 0.0))
                            + crtEmission(map, crtUv - vec2(glowStep.x, 0.0))
                            + crtEmission(map, crtUv + vec2(0.0, glowStep.y))
                            + crtEmission(map, crtUv - vec2(0.0, glowStep.y))) * .18;
                        crtHalo += (crtEmission(map, crtUv + glowStep * 2.4)
                            + crtEmission(map, crtUv - glowStep * 2.4)
                            + crtEmission(map, crtUv + vec2(glowStep.x, -glowStep.y) * 2.4)
                            + crtEmission(map, crtUv + vec2(-glowStep.x, glowStep.y) * 2.4)) * .07;
                        sampledDiffuseColor.rgb += crtHalo * .36 * crtPower;
                        sampledDiffuseColor.rgb *= 1.0 + .12 * crtPower;
                        // A dark inner border separates the emitting coating
                        // from the front glass. Out-of-frame samples fade rather
                        // than stretching their last row onto the rounded rim.
                        vec2 crtAperture = abs(crtRasterUv - .5) * 2.0;
                        float crtPicture = (1.0 - smoothstep(.97, 1.01, crtAperture.x))
                            * (1.0 - smoothstep(.97, 1.01, crtAperture.y));
                        vec3 crtTube = crtProfile > .5 && crtProfile < 1.5 ? vec3(.004, .0007, .0004) : vec3(.002, .004, .004);
                        sampledDiffuseColor.rgb = mix(crtTube, sampledDiffuseColor.rgb, crtPicture);
                        sampledDiffuseColor.a = 1.0;
                        diffuseColor *= sampledDiffuseColor;
                        #endif
                    `);
                    shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
                        #include <dithering_fragment>
                        #ifdef USE_MAP
                        // One raster, curved with the picture. Pixel integration
                        // preserves visible scan rows without distant moire.
                        float crtRows = crtProfile < .5 ? 142.0 : crtProfile > 1.5 ? 54.0 : 46.0;
                        float crtFootprint = max(.001, fwidth(crtRasterUv.y) * crtRows * 3.14159265);
                        float crtVisibility = max(0.0, sin(crtFootprint) / crtFootprint);
                        float crtLines = .5 + .5 * cos(crtRasterUv.y * crtRows * 6.2831853) * crtVisibility;
                        float crtRoll = fract(crtRasterUv.y - crtTime * .095 + crtSeed * .17);
                        float crtBand = exp(-pow((crtRoll - .5) / .045, 2.0));
                        float crtFlicker = 1.0 + sin(crtTime * 37.0 + crtSeed * 2.0) * .006 * crtPower;
                        vec2 crtEdgeUv = abs(vMapUv - .5) * 2.0;
                        float crtEdge = pow(crtEdgeUv.x, 6.0) + pow(crtEdgeUv.y, 6.0);
                        float crtGrain = crtHash(floor(crtUv * vec2(960.0, 640.0)) + floor(crtTime * 18.0));
                        gl_FragColor.rgb *= mix(1.0, .79 + .27 * crtLines, crtPower * crtPicture);
                        gl_FragColor.rgb *= 1.0 + crtBand * .10 * crtPower * crtPicture;
                        gl_FragColor.rgb *= crtFlicker * (1.0 - min(.54, crtEdge * .30) * crtPower);
                        gl_FragColor.rgb *= 1.0 + (crtGrain - .5) * .035 * crtPower;
                        if (crtProfile > .5 && crtProfile < 1.5) {
                            float crtNoise = crtHash(floor(vMapUv * vec2(420.0, 180.0)) + floor(crtTime * 28.0));
                            gl_FragColor.rgb += vec3(.16, .035, .018) * crtTear * crtPower * crtPicture;
                            gl_FragColor.rgb += (crtNoise - .5) * .055 * crtBurst * crtPower * crtPicture;
                        }
                        #endif
                    `);
                };
                material.customProgramCacheKey = () => `console-crt-optics-v7-${profile}`;
                this.addScreenGlass(name, plane);
            }
        }
        // Blender owns the assemblies: the fixed drive housing must never eject.
        const disk = this.part('FloppyTransport');
        const knob = this.part('ScopeTuning');
        const rate = this.part('ScopeRate');
        const persistence = this.part('ScopePersistence');
        if (!disk || !knob || !rate || !persistence) throw new Error('终端机械组件不完整。');
        this.disk = disk;
        this.diskRest.copy(disk.position);
        this.tuningKnob = knob;
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
        this.testLamp.material = (this.testLamp.material as THREE.MeshStandardMaterial).clone();
        this.root.updateMatrixWorld(true);
        this.disk.attach(this.planes.get('disklabel')!);
        for (const [part, surface] of [['ManualKey', 'badge'], ['ChannelCopy', 'channelCopy'], ['TransmitLever', 'transmitLabel']]) {
            const assembly = this.part(part), plane = this.planes.get(surface);
            if (assembly && plane) assembly.attach(plane);
        }
        this.powerSwitch = this.part('PowerSwitch');
        if (!this.powerSwitch) throw new Error('电源开关组件不完整。');
        this.copyKey = this.part('ChannelCopy');
        this.copyKeyRestZ = this.copyKey?.position.z ?? 0;
        this.setupNixies();
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
            const frame = import.meta.env.DEV ? new URLSearchParams(location.search).get('paper-frame') : null;
            if (frame !== null && Number.isFinite(Number(frame))) {
                const phase = new URLSearchParams(location.search).get('paper-phase');
                this.receipt.still(phase === 'feed' ? 'feed' : phase === 'refill' ? 'refill' : 'tear', Number(frame), this.content?.paperRecords ?? 0);
            }
            this.syncPaperGeometry();
            this.receipt.warmUp();
        }
        this.model.traverse(object => {
            if (object instanceof THREE.Mesh && object.name.startsWith('ScoreLamp_') && object.material instanceof THREE.MeshStandardMaterial) {
                object.material = object.material.clone();
                this.lampMaterials.set(object.name.slice(10), object.material);
            }
            if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial &&
                ['Tactile warm meter dial', 'Scope indicator glass'].includes(object.material.name)) {
                this.poweredMaterials.set(object.material, object.material.emissiveIntensity);
            }
        });
        this.batchStaticGeometry();
        this.renderer.shadowMap.needsUpdate = true;
        const scope = new THREE.CanvasTexture(this.scopeCanvas);
        scope.colorSpace = THREE.SRGBColorSpace;
        this.textures.set('scope', scope);
        this.planes.get('scope')!.material.map = scope;
        if (this.content)
            this.update(this.content, { diskOut: this.diskOut, scopeMode: this.scopeMode,
                scopeRate: this.scopeRate, scopePersistence: this.scopePersistence,
                backView: this.backView, batteryOpen: this.batteryOpen, soundOn: this.soundOn,
                powerOn: this.powerOn,
                archiveOpen: this.archiveOpen, manual: this.manual,
                removedBatteries: this.removedBatteries, unpluggedCables: this.unpluggedCables,
                meterAmplitude: this.meterAmplitude, meterRate: this.meterRate });
        this.resize();
    }
    private addScreenGlass(name: string, display: THREE.Mesh) {
        const material = new THREE.MeshPhysicalMaterial({
            color: '#091412', metalness: 0, roughness: .22,
            ior: 1.52, specularIntensity: .35, envMapIntensity: .30,
            transparent: true, opacity: 1, depthWrite: false,
        });
        // Keep the physical specular response independent of the clear substrate.
        // Every reflection comes from the shared lights / environment and the
        // mesh's actual curved normals; there are no painted softboxes or streaks.
        material.onBeforeCompile = shader => {
            shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
                vec3 glassReflection = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
                float glassPeak = max(max(glassReflection.r, glassReflection.g), glassReflection.b);
                float glassAlpha = clamp(.006 + glassPeak, .006, .32);
                gl_FragColor = vec4((diffuseColor.rgb * .006 + glassReflection) / glassAlpha, glassAlpha);
            `);
        };
        material.customProgramCacheKey = () => 'crt-physical-glass-v1';
        const glass = new THREE.Mesh(display.geometry.clone(), material);
        glass.name = `Runtime CRT glass ${name}`;
        glass.position.z = .006;
        glass.renderOrder = 6;
        glass.castShadow = glass.receiveShadow = false;
        display.add(glass);
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
            }
            if (/^Nixie_.*glass$/.test(object.name)) {
                object.castShadow = false; object.receiveShadow = false;
                const glass = object.material as THREE.MeshPhysicalMaterial;
                glass.depthWrite = false; glass.side = THREE.FrontSide;
                glass.opacity = .105; glass.roughness = .075; glass.metalness = .05;
                object.renderOrder = 5;
            }
        });
        for (let slot = 0; slot < 4; slot++) {
            const canvas = document.createElement('canvas'); canvas.width = 180; canvas.height = 270;
            const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
            const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false,
                blending: THREE.AdditiveBlending, toneMapped: false, opacity: .85 });
            const channel = this.surfaces.channel;
            const glow = new THREE.Mesh(new THREE.PlaneGeometry(.40, .60 * (channel.digitScale ?? 1)), material);
            glow.position.set(channel.x + (slot - 1.5) * .52, channel.y, channel.z - .097); glow.renderOrder = 4;
            this.root.add(glow); this.textures.set('nixie' + slot, texture);
            const paths = Array.from({ length: 10 }, (_, digit) =>
                this.nixieDigits.find(d => d.slot === slot && d.digit === digit)?.mesh.userData.cathode_path || '');
            this.nixieCoronas.push({ canvas, texture, paths, code: '?' });
        }
    }
    private updateNixies(code: string) {
        for (const { mesh, slot, digit } of this.nixieDigits) mesh.visible = code[slot] === String(digit);
        this.nixieCoronas.forEach((tube, slot) => {
            const digit = code[slot] || '';
            if (tube.code === digit) return;
            tube.code = digit;
            const c = tube.canvas.getContext('2d')!;
            c.clearRect(0, 0, 180, 270);
            if (digit && tube.paths[Number(digit)]) {
                c.save(); c.translate(22.5, 18); c.scale(1.35, 1.4625);
                c.lineCap = c.lineJoin = 'round';
                const path = new Path2D(tube.paths[Number(digit)]);
                c.strokeStyle = '#ff4109'; c.shadowColor = '#ff490c';
                c.globalAlpha = .22; c.lineWidth = 5; c.shadowBlur = 14; c.stroke(path);
                c.globalAlpha = .40; c.lineWidth = 2.7; c.shadowBlur = 5; c.stroke(path);
                c.restore();
            }
            tube.texture.needsUpdate = true;
        });
    }
    private part(name: string) {
        return this.model?.getObjectByName(name) || this.model?.getObjectByName(name.replaceAll(' ', '_'));
    }
    update(content: Content, local: HardwareState) {
        if (this.powerOn !== local.powerOn || this.content?.waiting !== content.waiting) this.clearScopePersistence();
        this.content = content;
        this.updateNixies(content.roomCode);
        this.powerOn = local.powerOn;
        this.crtPower.value = this.powerOn ? 1 : 0;
        for (const [material, intensity] of this.poweredMaterials) material.emissiveIntensity = this.powerOn ? intensity : 0;
        this.backView = local.backView;
        this.batteryOpen = local.batteryOpen;
        this.soundOn = local.soundOn;
        this.manual = local.manual;
        this.removedBatteries = local.removedBatteries;
        this.unpluggedCables = local.unpluggedCables;
        this.meterAmplitude = local.meterAmplitude;
        this.meterRate = local.meterRate;
        // Identity matters: replacing an occupied seat also exchanges its card.
        for (const [id, seat] of this.rosterCards) {
            const player = content.seats[id];
            seat.motion.sync(player === null || player === undefined ? null : { id: player, frame: content.frames['roster' + id] });
        }
        this.archiveOpen = local.archiveOpen;
        if (!local.archiveOpen) this.paperReaderStarted = false;
        this.receipt.sync(local.archiveOpen, content.paperRecords);
        this.beginPaperReader();
        this.diskOut = local.diskOut;
        if (this.scopeMode !== local.scopeMode) {
            this.scopeDesiredAngle -= this.shortestStep(this.scopeMode, local.scopeMode, scopeModes.length) * Math.PI / 4;
            this.scopeMode = local.scopeMode;
            this.clearScopePersistence();
        }
        if (this.scopeRate !== local.scopeRate) {
            this.scopeRateDesiredAngle -= this.shortestStep(this.scopeRate, local.scopeRate, scopeRates.length) * Math.PI / 3;
            this.scopeRate = local.scopeRate;
            this.clearScopePersistence();
        }
        if (this.scopePersistence !== local.scopePersistence) {
            this.scopePersistenceDesiredAngle -= this.shortestStep(this.scopePersistence, local.scopePersistence, scopePersistenceModes.length) * Math.PI / 3;
            this.scopePersistence = local.scopePersistence;
            this.clearScopePersistence();
        }
        for (const [name, frame] of Object.entries(content.frames)) {
            if (/^roster[AB][0-3]$/.test(name)) continue;
            this.updateFrame(name, frame);
        }
        const lamp = this.model?.getObjectByName('Connection_lens') || this.model?.getObjectByName('Connection lens');
        if (lamp instanceof THREE.Mesh && lamp.material instanceof THREE.MeshStandardMaterial) {
            lamp.material.emissive.set(content.status.includes('连接中') ? '#a66318' : '#328248');
            lamp.material.emissiveIntensity = this.powerOn ? .5 : 0;
        }
        for (const [name, material] of this.lampMaterials) {
            const lit = content.lamps[name];
            const failure = name.includes('failure');
            material.color.set(lit ? failure ? '#bf4825' : '#c89d31' : failure ? '#47170f' : '#493512');
            material.emissive.set(failure ? '#ff3511' : '#ffad28');
            material.emissiveIntensity = this.powerOn ? lit ? .85 : .008 : 0;
            material.roughness = .26;
        }
        this.project();
    }
    private updateFrame(name: string, frame: Frame) {
        const plane = this.planes.get(name);
        if (!plane) return;
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
            texture.image = frame.canvas;
            texture.needsUpdate = true;
        }
    }
    private batchStaticGeometry(root: THREE.Object3D = this.model!, preserveAssemblies = true) {
        // Keep the .blend and GLB fully editable. Only the runtime coalesces
        // static, opaque parts by material; animated assemblies retain names.
        const moving = /^(Nixie_Digit_.*|FloppyTransport|ScopeTuning|ScopeRate|ScopePersistence|TransmitLever|PowerSwitch|Key_[0-4]|BatteryDoor|BatteryCell_[0-3]|CablePlug_.*|RosterCard_[AB][0-3]|MeterAmplitude|MeterRate|RearSoundSwitch|RearTestLamp|Connection[ _]lens|Archive[ _]scroll[ _]wheel|PaperFeed|Paper[ _]roller|ReceiverNeedle|ManualKey|ChannelCopy|ScoreLamp_.*)$/;
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
                // Preserve the exported manufacturing UVs for PBR texture maps.
                for (const name of Object.keys(geometry.attributes)) {
                    if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
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
            for (const name of ['FloppyTransport', 'ScopeTuning', 'ScopeRate', 'ScopePersistence', 'TransmitLever', 'PowerSwitch', 'BatteryDoor', 'ManualKey', 'ChannelCopy', 'ReceiverNeedle']) {
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
    async soundFeedback(test = false) {
        if (!this.soundOn) return;
        try {
            this.audio ??= new AudioContext();
            if (this.audio.state === 'suspended') await this.audio.resume();
            if (this.disposed || !this.soundOn) return;
            const now = this.audio.currentTime;
            const oscillator = this.audio.createOscillator();
            const gain = this.audio.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(test ? 660 : 180, now);
            oscillator.frequency.exponentialRampToValueAtTime(test ? 440 : 70, now + .045);
            gain.gain.setValueAtTime(.0001, now);
            gain.gain.exponentialRampToValueAtTime(test ? .045 : .025, now + .004);
            gain.gain.exponentialRampToValueAtTime(.0001, now + (test ? .25 : .055));
            oscillator.connect(gain); gain.connect(this.audio.destination);
            oscillator.start(now); oscillator.stop(now + .3);
            oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        } catch { /* Audio is optional; no browser permission is required to play. */ }
    }
    setSound(on: boolean) { this.soundOn = on; void this.soundFeedback(true); }
    testLamps() { this.testUntil = performance.now() + 1800; void this.soundFeedback(true); }
    private shortestStep(from: number, to: number, count: number) {
        const forward = (to - from + count) % count;
        return forward > count / 2 ? forward - count : forward;
    }
    private clearScopePersistence() {
        this.scopeTraceCanvas.getContext('2d')!.clearRect(0, 0, 420, 350);
    }
    pulse(id: string) {
        this.pulses.set(id, performance.now());
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
        this.renderer.shadowMap.needsUpdate = true;
        this.project();
    }
    private beginPaperReader() {
        if (!this.archiveOpen || this.paperReaderStarted || !['feeding', 'reading'].includes(this.receipt.phase)) return;
        this.paperReaderStarted = true;
        this.onPaperPull();
    }
    private resize() {
        this.width = this.host.clientWidth;
        this.height = this.host.clientHeight;
        this.renderer.setSize(this.width, this.height, false);
        const aspect = this.width / this.height;
        const detail = import.meta.env.DEV ? new URLSearchParams(location.search).get('detail') : null;
        const normalHeight = Math.max(13.15, 18.6 / aspect);
        this.camera.aspect = aspect;
        const target = new THREE.Vector3(0, .1, -.4);
        const direction = new THREE.Vector3(-.18, .28, 1).normalize();
        const distance = normalHeight / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
        this.camera.zoom = 1;
        this.camera.clearViewOffset();
        this.camera.position.copy(target).addScaledVector(direction, distance);
        this.camera.lookAt(target);
        this.camera.updateProjectionMatrix();
        this.camera.updateMatrixWorld();
        const display = detail === 'words' ? this.surfaces.word1 : detail ? this.surfaces[detail] : undefined;
        if (detail === 'nixie' || detail === 'recorder' || display && (detail === 'screen' || detail === 'scope' || detail === 'words')) {
            // Crop the original camera frustum without moving the camera:
            // close-up and full-console views keep exactly the same perspective.
            this.inspection.rotation.set(this.inspectionPitch, this.inspectionYaw, 0);
            this.root.updateWorldMatrix(true, false);
            const focus = (display
                ? this.root.localToWorld(new THREE.Vector3(detail === 'words' ? -.45 : display.x, display.y, display.z))
                : new THREE.Vector3(5.83, detail === 'nixie' ? 3.55 : -.2, 1.1)).project(this.camera);
            const detailHeight = display
                ? Math.max(display.h * (detail === 'scope' ? 1.8 : 1.35), (detail === 'words' ? 9.8 : display.w * 1.3) / aspect)
                : Math.max(detail === 'nixie' ? 3.6 : 3.3, 4.1 / aspect);
            const scale = normalHeight / detailHeight;
            const w = this.width / scale, h = this.height / scale;
            this.camera.setViewOffset(this.width, this.height,
                (focus.x + 1) * this.width / 2 - w / 2, (1 - focus.y) * this.height / 2 - h / 2, w, h);
        }
        this.project();
    }
    bounds(target: Target) {
        if (Math.abs(this.flipProgress - (this.backView ? 1 : 0)) > .02) return null;
        const frame = this.content?.frames[target.surface];
        const plane = this.planes.get(target.surface);
        const surface = this.surfaces[target.surface];
        if (!frame || !plane || !surface)
            return null;
        plane.updateWorldMatrix(true, false);
        const curvature = crtProfile(target.surface);
        const eye = plane.worldToLocal(this.camera.getWorldPosition(new THREE.Vector3()));
        // Include edge midpoints: a convex display's projected bounds can extend
        // beyond its four corners. Invert raster warp before sampling the face.
        const points: THREE.Vector3[] = [];
        for (const fy of [0, .5, 1]) for (const fx of [0, .5, 1]) {
            const u = (target.x + target.w * fx) / frame.width;
            const v = 1 - (target.y + target.h * fy) / frame.height;
            const uv = curvature ? crtDisplayUv(u, v, surface.w, surface.h, curvature, eye) : { u, v };
            points.push(new THREE.Vector3((uv.u - .5) * surface.w, (uv.v - .5) * surface.h,
                curvature ? crtHeight(uv.u, uv.v, curvature.rise) : 0)
                .applyMatrix4(plane.matrixWorld).project(this.camera));
        }
        const xs = points.map(p => (p.x + 1) * this.width / 2);
        const ys = points.map(p => (1 - p.y) * this.height / 2);
        return { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    }
    private tick = (now: number) => {
        if (this.disposed)
            return;
        this.raf = requestAnimationFrame(this.tick);
        if (document.hidden || now - this.last < 16)
            return;
        const dt = Math.min((now - this.last) / 1000, .1);
        this.last = now;
        const oldInspectionYaw = this.inspectionYaw, oldInspectionPitch = this.inspectionPitch;
        this.inspectionYaw = this.reduced.matches ? this.inspectionTargetYaw :
            THREE.MathUtils.damp(this.inspectionYaw, this.inspectionTargetYaw, 18, dt);
        this.inspectionPitch = this.reduced.matches ? this.inspectionTargetPitch :
            THREE.MathUtils.damp(this.inspectionPitch, this.inspectionTargetPitch, 18, dt);
        this.inspection.rotation.set(this.inspectionPitch, this.inspectionYaw, 0);
        let backdropMoved = false;
        if (this.inspectionEnabled && this.backdrop) {
            // Keep the shadow receiver close head-on, then move it behind the
            // rotated chassis' conservative bounding depth before an edge can
            // cross the visible background.
            const safeZ = -3.95 - Math.abs(Math.sin(this.inspectionYaw)) * 8.2
                - Math.abs(Math.sin(this.inspectionPitch)) * 5.2;
            const oldZ = this.backdrop.position.z;
            this.backdrop.position.z = safeZ;
            backdropMoved = Math.abs(oldZ - this.backdrop.position.z) > .00001;
        }
        if (Math.abs(oldInspectionYaw - this.inspectionYaw) > .00001 ||
            Math.abs(oldInspectionPitch - this.inspectionPitch) > .00001 || backdropMoved) {
            this.project();
            this.renderer.shadowMap.needsUpdate = true;
        }
        const previousPowerAngle = this.powerAngle;
        const powerTarget = this.powerOn ? 0 : -THREE.MathUtils.degToRad(this.powerSwitch?.userData.throw_degrees ?? 32);
        this.powerAngle = this.reduced.matches ? powerTarget : THREE.MathUtils.damp(this.powerAngle, powerTarget, 22, dt);
        if (Math.abs(this.powerAngle - powerTarget) < .001) this.powerAngle = powerTarget;
        if (this.powerSwitch) this.powerSwitch.rotation.z = this.powerAngle;
        if (previousPowerAngle !== this.powerAngle) this.renderer.shadowMap.needsUpdate = true;
        if (this.receipt.active) {
            this.receipt.advance(dt * 1000 * this.rosterMotionRate, this.reduced.matches);
            this.syncPaperGeometry();
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
        const manualDepth = this.manualDepth;
        this.manualDepth = this.reduced.matches ? (this.manual ? .035 : 0) : THREE.MathUtils.damp(this.manualDepth, this.manual ? .035 : 0, 20, dt);
        const manualKey = this.part('ManualKey');
        if (manualKey) manualKey.position.z = .85 - this.manualDepth;
        if (Math.abs(this.manualDepth - manualDepth) > .00001) { this.project(); this.renderer.shadowMap.needsUpdate = true; }
        const needle = this.part('ReceiverNeedle');
        const oldMeter = this.meterAngle;
        // A local analog toy. Its motion has no connection to game progress.
        const level = [.12, .27, .44, .64, .88][this.meterAmplitude];
        const speed = [.5, .8, 1.2, 1.8, 2.8][this.meterRate];
        const wave = Math.sin(now / 1000 * speed * 3.2) * .70 + Math.sin(now / 1000 * speed * 7.7) * .30;
        const meterTarget = this.powerOn ? this.reduced.matches ? 0 : wave * level : -.82;
        this.meterAngle = this.reduced.matches ? meterTarget : THREE.MathUtils.damp(this.meterAngle, meterTarget, 12, dt);
        if (needle) needle.rotation.z = -this.meterAngle;
        if (Math.abs(oldMeter - this.meterAngle) > .0001) this.renderer.shadowMap.needsUpdate = true;
        for (const [name, value] of [['MeterAmplitude', this.meterAmplitude], ['MeterRate', this.meterRate]] as const) {
            const knob = this.part(name);
            if (knob) knob.rotation.z = -.85 + value * .425;
        }
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
            if (previous !== item.amount) { this.project(); this.renderer.shadowMap.needsUpdate = true; }
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
            if (previous !== seat.motion.amount) { this.project(); this.renderer.shadowMap.needsUpdate = true; }
        }
        const previousFlip = this.flipProgress;
        const targetFlip = this.backView ? 1 : 0;
        this.flipProgress = this.reduced.matches ? targetFlip : THREE.MathUtils.damp(this.flipProgress, targetFlip, 7.5, dt);
        if (Math.abs(this.flipProgress - targetFlip) < .0005) this.flipProgress = targetFlip;
        this.turntable.rotation.y = this.flipProgress * Math.PI;
        const lift = Math.sin(this.flipProgress * Math.PI) * 7.4;
        this.turntable.position.set(0, lift * .20, .5 + lift);
        this.turntable.scale.setScalar(1 - Math.sin(this.flipProgress * Math.PI) * .08);
        const oldBatteryAngle = this.batteryAngle;
        this.batteryAngle = this.reduced.matches ? (this.batteryOpen ? 1.85 : 0) :
            THREE.MathUtils.damp(this.batteryAngle, this.batteryOpen ? 1.85 : 0, 11, dt);
        if (Math.abs(this.batteryAngle - (this.batteryOpen ? 1.85 : 0)) < .0005)
            this.batteryAngle = this.batteryOpen ? 1.85 : 0;
        this.batteryDoor.rotation.y = this.batteryAngle;
        const soundSwitch = this.part('RearSoundSwitch');
        if (soundSwitch && soundSwitch.position.x !== (this.soundOn ? 4.79 : 5.05)) {
            soundSwitch.position.x = this.soundOn ? 4.79 : 5.05;
            this.renderer.shadowMap.needsUpdate = true;
        }
        if (this.testLamp?.material instanceof THREE.MeshStandardMaterial) {
            const strength = !this.powerOn ? 0 : now < this.testUntil ? .8 + .7 * Math.sin(now * .018) : .03;
            this.testLamp.material.emissive.set('#80dc65');
            this.testLamp.material.emissiveIntensity = strength;
        }
        if (previousFlip !== this.flipProgress || oldBatteryAngle !== this.batteryAngle) this.project();
        if (previousFlip !== this.flipProgress || oldBatteryAngle !== this.batteryAngle ||
            Math.abs(this.diskProgress - (this.diskOut ? 1 : 0)) > .0001 ||
            Math.abs(this.scopeAngle - this.scopeDesiredAngle) > .0001 ||
            Math.abs(this.scopeRateAngle - this.scopeRateDesiredAngle) > .0001 ||
            Math.abs(this.scopePersistenceAngle - this.scopePersistenceDesiredAngle) > .0001 || this.pulses.size > 0)
            this.renderer.shadowMap.needsUpdate = true;
        const desired = this.diskOut ? 1 : 0;
        if (Math.abs(this.diskProgress - desired) > .0001) {
            this.diskProgress = this.reduced.matches ? desired : THREE.MathUtils.damp(this.diskProgress, desired, 13, dt);
            if (Math.abs(this.diskProgress - desired) < .001) this.diskProgress = desired;
            const distance = this.diskProgress * .68;
            this.disk.position.copy(this.diskRest);
            this.disk.position.y -= Math.cos(65 * Math.PI / 180) * distance;
            this.disk.position.z += Math.sin(65 * Math.PI / 180) * distance;
        }
        this.scopeAngle = this.reduced.matches ? this.scopeDesiredAngle : THREE.MathUtils.damp(this.scopeAngle, this.scopeDesiredAngle, 16, dt);
        this.tuningKnob.rotation.z = this.scopeAngle;
        this.scopeRateAngle = this.reduced.matches ? this.scopeRateDesiredAngle : THREE.MathUtils.damp(this.scopeRateAngle, this.scopeRateDesiredAngle, 16, dt);
        this.rateKnob.rotation.z = this.scopeRateAngle;
        this.scopePersistenceAngle = this.reduced.matches ? this.scopePersistenceDesiredAngle : THREE.MathUtils.damp(this.scopePersistenceAngle, this.scopePersistenceDesiredAngle, 16, dt);
        this.persistenceKnob.rotation.z = this.scopePersistenceAngle;
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
        if (this.flipProgress < .65) this.drawScope(this.reduced.matches ? 0 : now / 1000, dt);
        this.crtTime.value = this.reduced.matches ? 0 : now / 1000;
        this.renderer.render(this.scene, this.camera);
        if (import.meta.env.DEV) {
            this.scopeFrames++;
            if (now - this.scopeFpsStarted >= 750) {
                this.renderer.domElement.dataset.scopeFps = (this.scopeFrames * 1000 / (now - this.scopeFpsStarted)).toFixed(1);
                this.renderer.domElement.dataset.drawCalls = String(this.renderer.info.render.calls);
                this.renderer.domElement.dataset.triangles = String(this.renderer.info.render.triangles);
                this.renderer.domElement.dataset.face = this.backView ? 'rear' : 'front';
                this.scopeFrames = 0;
                this.scopeFpsStarted = now;
            }
        }
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
    private drawScope(t: number, dt: number) {
        if (!this.powerOn) {
            const c = this.scopeCanvas.getContext('2d')!;
            c.fillStyle = '#07100e';
            c.fillRect(0, 0, this.scopeCanvas.width, this.scopeCanvas.height);
            const texture = this.textures.get('scope');
            if (texture) texture.needsUpdate = true;
            return;
        }
        const w = 420, centerY = 146;
        const trace = this.scopeTraceCanvas.getContext('2d')!;
        const decay = [0.30, 0.16, 0.065, 0][this.scopePersistence];
        trace.save();
        trace.globalCompositeOperation = 'destination-out';
        trace.fillStyle = `rgba(0,0,0,${1 - Math.pow(1 - decay, dt * 60)})`;
        trace.fillRect(0, 0, w, 292);
        trace.restore();

        const rate = [.45, .72, 1, 1.75, 2.8][this.scopeRate];
        const channels = this.scopeMode === 2 ? [0, 1] : [0];
        const phosphor = this.content?.waiting ? '#9dbb78' : '#d4ed98';
        const path = (channel: number) => {
            const trace = new Path2D();
            if (this.scopeMode === 0) {
                const count = 360;
                for (let i = 0; i <= count; i++) {
                    const p = i / count * Math.PI * 2;
                    const flutter = Math.sin(p * 6 + t * rate * 1.6) * 2.4;
                    const x = 210 + Math.sign(Math.cos(p)) * Math.pow(Math.abs(Math.cos(p)), .36) * (124 + flutter);
                    const y = centerY + Math.sign(Math.sin(p)) * Math.pow(Math.abs(Math.sin(p)), .36) * (86 + flutter * .5);
                    i ? trace.lineTo(x, y) : trace.moveTo(x, y);
                }
                trace.closePath();
            } else {
                const amplitude = this.content?.waiting ? 24 : channel ? 54 : 70;
                const cycles = 2.4 + this.scopeRate * 1.18;
                for (let x = 0; x < w; x += 1.25) {
                    const motion = this.scopeMode >= 6 ? Math.sin(t * rate * .32) * .12 : Math.sin(t * .8) * .018;
                    const phase = x / w * Math.PI * 2 * cycles + motion;
                    const jitter = Math.sin(x * 1.71 + t * 23) * .42;
                    const y = centerY + waveSample(this.scopeMode, phase, channel) * amplitude +
                        (channel ? 38 : this.scopeMode === 2 ? -30 : 0) + jitter;
                    x ? trace.lineTo(x, y) : trace.moveTo(x, y);
                }
            }
            return trace;
        };
        // History has a strict brightness ceiling. The fresh sweep is drawn
        // separately, so even HOLD + NOISE cannot accumulate into a white slab.
        trace.save();
        trace.globalCompositeOperation = 'source-over';
        trace.strokeStyle = phosphor;
        trace.globalAlpha = .35;
        trace.lineWidth = 1.1;
        for (const channel of channels) trace.stroke(path(channel));
        trace.restore();

        const c = this.scopeCanvas.getContext('2d')!;
        c.clearRect(0, 0, 420, 350);
        c.drawImage(this.scopeGridCanvas, 0, 0);
        c.save(); c.globalAlpha = .25;
        c.drawImage(this.scopeTraceCanvas, 0, 0); c.restore();
        c.save(); c.beginPath(); c.rect(0, 0, w, 292); c.clip();
        c.strokeStyle = phosphor; c.shadowColor = phosphor;
        for (const channel of channels) {
            const sweep = path(channel);
            c.globalAlpha = .20; c.lineWidth = 3; c.shadowBlur = 6; c.stroke(sweep);
            c.globalAlpha = channel ? .68 : .94; c.lineWidth = 1.1; c.shadowBlur = 0; c.stroke(sweep);
        }
        c.restore();
        c.fillStyle = 'rgba(211, 239, 232, .86)';
        c.font = '17px "PingFang SC", sans-serif';
        c.fillText(`${scopeModes[this.scopeMode]} · ${scopeRates[this.scopeRate]}`, 20, 319);
        c.fillStyle = 'rgba(174, 211, 205, .65)';
        c.font = '13px "PingFang SC", sans-serif';
        c.fillText(`${scopePersistenceModes[this.scopePersistence]} / ${this.content?.waiting ? 'STANDBY' : 'TRIGGERED'}`, 20, 340);
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
        cancelAnimationFrame(this.raf);
        this.observer.disconnect();
        this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
        this.host.removeEventListener('pointerdown', this.onInspectionDown, true);
        this.host.removeEventListener('pointermove', this.onInspectionMove, true);
        this.host.removeEventListener('pointerup', this.finishInspection, true);
        this.host.removeEventListener('pointercancel', this.finishInspection, true);
        this.host.removeEventListener('auxclick', this.onInspectionAuxClick, true);
        delete this.host.dataset.inspection;
        delete this.host.dataset.inspecting;
        this.disposeObject(this.scene);
        for (const texture of this.textures.values())
            texture.dispose();
        this.environment.dispose();
        this.draco.dispose();
        void this.audio?.close();
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
