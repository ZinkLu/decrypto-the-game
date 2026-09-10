import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import dracoWasmUrl from 'three/examples/jsm/libs/draco/gltf/draco_decoder.wasm?url';
import dracoWrapperUrl from 'three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js?url';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Content, Target } from './paint';
import { scopeModes, scopeRates, scopePersistenceModes, type HardwareState } from './model';
import { waveSample, paperPose, paperFeedDuration, type PaperOrigin } from './mechanics';
interface Surface {
    x: number;
    y: number;
    z: number;
    w: number;
    h: number;
    rotationX?: number;
    rotationY?: number;
    lit?: boolean;
}
export class ConsoleEngine {
    private renderer: THREE.WebGLRenderer;
    private scene = new THREE.Scene();
    private camera = new THREE.OrthographicCamera(-9, 9, 6, -6, .1, 100);
    private root = new THREE.Group();
    private turntable = new THREE.Group();
    private backView = false;
    private flipProgress = 0;
    private batteryOpen = false;
    private batteryAngle = 0;
    private batteryDoor = new THREE.Group() as THREE.Object3D;
    private soundOn = false;
    private audio?: AudioContext;
    private testUntil = 0;
    private testLamp?: THREE.Mesh;
    private surfaces: Record<string, Surface> = {};
    private planes = new Map<string, THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial | THREE.MeshStandardMaterial>>();
    private textures = new Map<string, THREE.CanvasTexture>();
    private content?: Content;
    private model?: THREE.Group;
    private observer: ResizeObserver;
    private raf = 0;
    private disposed = false;
    private last = 0;
    private width = 1;
    private height = 1;
    private disk: THREE.Object3D = new THREE.Group();
    private tuningKnob: THREE.Object3D = new THREE.Group();
    private rateKnob: THREE.Object3D = new THREE.Group();
    private persistenceKnob: THREE.Object3D = new THREE.Group();
    private diskOut = false;
    private diskProgress = 0;
    private paper?: THREE.Mesh;
    private paperBase?: Float32Array;
    private paperRoller?: THREE.Object3D;
    private rollerRest = new THREE.Quaternion();
    private paperProgress = 0;
    private paperMotion?: { from: number; to: number; start: number };
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
    private rosterCards = new Map<string, { object: THREE.Object3D; rest: THREE.Vector3; travel: number; amount: number; target: number; initialized: boolean }>();
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
    private pulses = new Map<string, number>();
    private environment: THREE.WebGLRenderTarget;
    private draco = new DRACOLoader().setDecoderPath({ js: dracoWrapperUrl, wasm: dracoWasmUrl }).setWorkerLimit(2);
    private scopeCanvas = document.createElement('canvas');
    private scopeGridCanvas = document.createElement('canvas');
    private scopeTraceCanvas = document.createElement('canvas');
    private onContextLost = (e: Event) => { e.preventDefault(); this.fail('图形连接已中断，请刷新终端。'); };
    constructor(private host: HTMLElement, private project: () => void, private fail: (message: string) => void,
        private onPaperReady: (origin?: PaperOrigin) => void = () => {}) {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = .98;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.autoUpdate = false;
        this.renderer.shadowMap.needsUpdate = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        this.renderer.domElement.setAttribute('aria-hidden', 'true');
        this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
        host.prepend(this.renderer.domElement);
        this.scene.background = new THREE.Color('#dedad0');
        this.scene.add(this.turntable);
        this.turntable.add(this.root);
        this.turntable.position.z = -1;
        this.root.position.z = 1;
        // A shallow inspection angle reveals the folded sleeve and recessed
        // castings without turning the playable face into a perspective puzzle.
        this.camera.position.set(-1.8, 5.8, 28);
        this.camera.lookAt(0, .1, -.35);
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        const room = new RoomEnvironment();
        this.environment = pmrem.fromScene(room, .035);
        this.scene.environment = this.environment.texture;
        room.dispose();
        pmrem.dispose();
        this.scene.environmentIntensity = .85;
        this.scene.add(new THREE.HemisphereLight('#fff2da', '#747f83', .8));
        const key = new THREE.DirectionalLight('#fff0d6', 3.1);
        key.position.set(-9, 8, 10);
        key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048);
        key.shadow.camera.left = -11;
        key.shadow.camera.right = 11;
        key.shadow.camera.top = 9;
        key.shadow.camera.bottom = -9;
        key.shadow.normalBias = .025;
        key.shadow.bias = -.0004;
        this.scene.add(key);
        const fill = new THREE.DirectionalLight('#cbd8dd', .5);
        fill.position.set(8, 3, 8);
        this.scene.add(fill);
        const back = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#ddd7c9', roughness: 1 }));
        back.position.z = -3.95;
        back.receiveShadow = true;
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
        const revision = 'tactile-hardware-20260911-v4';
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
            disk: { x: -6.25, y: -1.72, z: 1.28, w: 2.12, h: 1.12 },
            scopeKnob: { x: -5.45, y: -3.05, z: 1, w: .58, h: .58 },
            scopeRateKnob: { x: -5.42, y: -2.43, z: 1, w: .34, h: .34 },
            scopePersistenceKnob: { x: -5.18, y: -3.56, z: 1, w: .32, h: .32 },
            batteryControl: { x: -3.4, y: .62, z: -3.66, w: 5.6, h: 4.2, rotationY: Math.PI },
            soundControl: { x: 4.92, y: -1.4, z: -3.25, w: 1.35, h: .60, rotationY: Math.PI },
            testControl: { x: -.05, y: -2.76, z: -3.27, w: .70, h: .70, rotationY: Math.PI },
        };
        this.model = gltf.scene;
        gltf.scene.traverse(o => { if (o instanceof THREE.Mesh) {
            o.castShadow = true;
            o.receiveShadow = true;
        } });
        this.root.add(gltf.scene);
        for (const [name, s] of Object.entries(this.surfaces)) {
            const material = s.lit
                ? new THREE.MeshStandardMaterial({ transparent: true, roughness: .83, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
                : new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false });
            const plane = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), material);
            plane.receiveShadow = !!s.lit;
            plane.position.set(s.x, s.y, s.z);
            plane.rotation.x = s.rotationX ?? 0;
            plane.rotation.y = s.rotationY ?? 0;
            plane.renderOrder = name === 'paper' ? 3 : 2;
            this.root.add(plane);
            this.planes.set(name, plane);
        }
        // Blender owns the assemblies: the fixed drive housing must never eject.
        const disk = this.part('FloppyTransport');
        const knob = this.part('ScopeTuning');
        const rate = this.part('ScopeRate');
        const persistence = this.part('ScopePersistence');
        if (!disk || !knob || !rate || !persistence) throw new Error('终端机械组件不完整。');
        this.disk = disk;
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
            this.rosterCards.set(team + i, { object: card, rest: card.position.clone(),
                travel: typeof travel === 'number' ? travel : .55, amount: 0, target: 0, initialized: false });
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
        this.paperRoller = this.part('Paper roller');
        if (this.paperRoller) this.rollerRest.copy(this.paperRoller.quaternion);
        const paper = this.part('Paper back');
        if (paper instanceof THREE.Mesh && paper.parent?.name === 'PaperFeed') {
            this.paper = paper;
            this.paperBase = new Float32Array(paper.geometry.getAttribute('position').array);
            this.setPaperExtension(0);
        }
        this.model.traverse(object => {
            if (object instanceof THREE.Mesh && object.name.startsWith('ScoreLamp_') && object.material instanceof THREE.MeshStandardMaterial) {
                object.material = object.material.clone();
                this.lampMaterials.set(object.name.slice(10), object.material);
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
                archiveOpen: this.archiveOpen, manual: this.manual,
                removedBatteries: this.removedBatteries, unpluggedCables: this.unpluggedCables,
                meterAmplitude: this.meterAmplitude, meterRate: this.meterRate });
        this.project();
    }
    private part(name: string) {
        return this.model?.getObjectByName(name) || this.model?.getObjectByName(name.replaceAll(' ', '_'));
    }
    update(content: Content, local: HardwareState) {
        this.content = content;
        this.backView = local.backView;
        this.batteryOpen = local.batteryOpen;
        this.soundOn = local.soundOn;
        this.manual = local.manual;
        this.removedBatteries = local.removedBatteries;
        this.unpluggedCables = local.unpluggedCables;
        this.meterAmplitude = local.meterAmplitude;
        this.meterRate = local.meterRate;
        // Seat occupancy slides physical cards in and out of the rack; the first
        // sync seats them instantly so loading never plays an insertion.
        for (const [id, seat] of this.rosterCards) {
            seat.target = content.seats[id] ? 0 : 1;
            if (!seat.initialized) {
                seat.amount = seat.target;
                seat.initialized = true;
            }
        }
        if (this.archiveOpen !== local.archiveOpen) {
            this.archiveOpen = local.archiveOpen;
            this.paperMotion = { from: this.paperProgress, to: local.archiveOpen ? 1 : 0, start: performance.now() };
        }
        this.diskOut = local.diskOut;
        if (this.scopeMode !== local.scopeMode) {
            this.scopeDesiredAngle -= this.shortestStep(this.scopeMode, local.scopeMode, scopeModes.length) * Math.PI / 4;
            this.scopeMode = local.scopeMode;
            this.clearScopePersistence();
        }
        if (this.scopeRate !== local.scopeRate) {
            this.scopeRateDesiredAngle -= this.shortestStep(this.scopeRate, local.scopeRate, scopeRates.length) * Math.PI / 3;
            this.scopeRate = local.scopeRate;
        }
        if (this.scopePersistence !== local.scopePersistence) {
            this.scopePersistenceDesiredAngle -= this.shortestStep(this.scopePersistence, local.scopePersistence, scopePersistenceModes.length) * Math.PI / 3;
            this.scopePersistence = local.scopePersistence;
            this.clearScopePersistence();
        }
        for (const [name, frame] of Object.entries(content.frames)) {
            const plane = this.planes.get(name);
            if (!plane)
                continue;
            let texture = this.textures.get(name);
            if (!texture) {
                texture = new THREE.CanvasTexture(frame.canvas);
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
                this.textures.set(name, texture);
                plane.material.map = texture;
                plane.material.needsUpdate = true;
            }
            else {
                texture.image = frame.canvas;
                texture.needsUpdate = true;
            }
        }
        const lamp = this.model?.getObjectByName('Connection_lens') || this.model?.getObjectByName('Connection lens');
        if (lamp instanceof THREE.Mesh && lamp.material instanceof THREE.MeshStandardMaterial) {
            lamp.material.emissive.set(content.status.includes('连接中') ? '#a66318' : '#328248');
            lamp.material.emissiveIntensity = .5;
        }
        for (const [name, material] of this.lampMaterials) {
            const lit = content.lamps[name];
            const failure = name.includes('failure');
            material.color.set(lit ? failure ? '#bf4825' : '#c89d31' : failure ? '#47170f' : '#493512');
            material.emissive.set(failure ? '#ff3511' : '#ffad28');
            material.emissiveIntensity = lit ? .85 : .008;
            material.roughness = .26;
        }
        this.project();
    }
    private batchStaticGeometry(root: THREE.Object3D = this.model!, preserveAssemblies = true) {
        // Keep the .blend and GLB fully editable. Only the runtime coalesces
        // static, opaque parts by material; animated assemblies retain names.
        const moving = /^(FloppyTransport|ScopeTuning|ScopeRate|ScopePersistence|TransmitLever|Key_[0-4]|BatteryDoor|BatteryCell_[0-3]|CablePlug_.*|RosterCard_[AB][0-3]|MeterAmplitude|MeterRate|RearSoundSwitch|RearTestLamp|Connection[ _]lens|Archive[ _]scroll[ _]wheel|PaperFeed|Paper[ _]roller|ReceiverNeedle|ManualKey|ChannelCopy|ScoreLamp_.*)$/;
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
            for (const name of ['FloppyTransport', 'ScopeTuning', 'ScopeRate', 'ScopePersistence', 'TransmitLever', 'BatteryDoor', 'ManualKey', 'ChannelCopy', 'ReceiverNeedle']) {
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
        if (id === 'archive') {
            const wheel = this.model?.getObjectByName('Archive_scroll_wheel') || this.model?.getObjectByName('Archive scroll wheel');
            wheel?.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), .42);
        }
    }
    private setPaperExtension(value: number) {
        if (!this.paper || !this.paperBase) return;
        const position = this.paper.geometry.getAttribute('position');
        for (let i = 0; i < position.count; i++) {
            const fraction = -this.paperBase[i * 3 + 1] / 1.30;
            const original = paperPose(fraction, 1), next = paperPose(fraction, value);
            position.setY(i, next.y);
            position.setZ(i, this.paperBase[i * 3 + 2] - original.z + next.z);
        }
        position.needsUpdate = true;
        this.paper.geometry.computeVertexNormals();
        this.paper.geometry.computeBoundingSphere();
        const length = paperPose(1, value).length;
        const plane = this.planes.get('paper');
        // The small printed leader moves with the free end; text never stretches
        // over the full paper length or stays behind on the metal panel.
        if (plane) { plane.position.y = .875 - length + .215; }
        if (this.paperRoller) {
            this.paperRoller.quaternion.copy(this.rollerRest);
            this.paperRoller.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (length - .43) / .095));
        }
        this.renderer.shadowMap.needsUpdate = true;
        this.project();
    }
    private paperOrigin(): PaperOrigin | undefined {
        const frame = this.content?.frames.paper;
        if (!frame) return;
        const bounds = this.bounds({ surface: 'paper', id: '', label: '', x: 0, y: 0, w: frame.width, h: frame.height });
        if (!bounds) return;
        const host = this.host.getBoundingClientRect();
        return { ...bounds, left: host.left + bounds.left, top: host.top + bounds.top };
    }
    private resize() {
        this.width = this.host.clientWidth;
        this.height = this.host.clientHeight;
        this.renderer.setSize(this.width, this.height, false);
        const aspect = this.width / this.height;
        const height = Math.max(13.15, 18.6 / aspect);
        this.camera.left = -height * aspect / 2;
        this.camera.right = height * aspect / 2;
        this.camera.top = height / 2;
        this.camera.bottom = -height / 2;
        this.camera.updateProjectionMatrix();
        this.camera.updateMatrixWorld();
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
        const points = [[target.x, target.y], [target.x + target.w, target.y],
            [target.x, target.y + target.h], [target.x + target.w, target.y + target.h]].map(([x, y]) =>
                new THREE.Vector3((x / frame.width - .5) * surface.w, (.5 - y / frame.height) * surface.h, 0)
                    .applyMatrix4(plane.matrixWorld).project(this.camera));
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
        if (this.paperMotion) {
            const motion = this.paperMotion;
            const t = this.reduced.matches ? 1 : Math.min(1, (now - motion.start) / paperFeedDuration);
            this.paperProgress = motion.from + (motion.to - motion.from) * (1 - Math.pow(1 - t, 3));
            this.setPaperExtension(this.paperProgress);
            if (t === 1) {
                this.paperMotion = undefined;
                if (this.archiveOpen) this.onPaperReady(this.paperOrigin());
            }
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
        this.meterAngle = this.reduced.matches ? 0 : THREE.MathUtils.damp(this.meterAngle, wave * level, 12, dt);
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
        for (const [, seat] of this.rosterCards) {
            const previous = seat.amount;
            seat.amount = this.reduced.matches ? seat.target : THREE.MathUtils.damp(seat.amount, seat.target, 8, dt);
            if (Math.abs(seat.amount - seat.target) < .001) seat.amount = seat.target;
            // An empty seat has no card; while sliding, the card stays visible.
            seat.object.visible = seat.target === 0 || seat.amount < .999;
            seat.object.position.copy(seat.rest);
            seat.object.position.z += seat.amount * seat.travel;
            if (previous !== seat.amount) { this.project(); this.renderer.shadowMap.needsUpdate = true; }
        }
        const previousFlip = this.flipProgress;
        const targetFlip = this.backView ? 1 : 0;
        this.flipProgress = this.reduced.matches ? targetFlip : THREE.MathUtils.damp(this.flipProgress, targetFlip, 7.5, dt);
        if (Math.abs(this.flipProgress - targetFlip) < .0005) this.flipProgress = targetFlip;
        this.turntable.rotation.y = this.flipProgress * Math.PI;
        const lift = Math.sin(this.flipProgress * Math.PI) * 7.4;
        this.turntable.position.set(0, lift * .20, -1 + lift);
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
            const strength = now < this.testUntil ? .8 + .7 * Math.sin(now * .018) : .03;
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
            this.disk.position.set(0, -Math.cos(65 * Math.PI / 180) * distance, Math.sin(65 * Math.PI / 180) * distance);
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
                const key = this.part('ChannelCopy');
                if (key) key.position.z = .88 - amount * .04;
            }
            if (age > .36)
                this.pulses.delete(id);
        }
        if (this.flipProgress < .65) this.drawScope(this.reduced.matches ? 0 : now / 1000, dt);
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
        const w = 420, centerY = 146;
        const trace = this.scopeTraceCanvas.getContext('2d')!;
        const decay = [0.24, 0.105, 0.038, 0.004][this.scopePersistence];
        trace.save();
        trace.globalCompositeOperation = 'destination-out';
        trace.fillStyle = `rgba(0,0,0,${1 - Math.pow(1 - decay, dt * 60)})`;
        trace.fillRect(0, 0, w, 292);
        trace.restore();

        const rate = [.45, .72, 1, 1.75, 2.8][this.scopeRate];
        const channels = this.scopeMode === 2 ? [0, 1] : [0];
        const phosphor = this.content?.waiting ? '#9dbb78' : '#d4ed98';
        const path = (channel: number) => {
            trace.beginPath();
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
                    const motion = this.scopeMode >= 6 ? t * rate * 3.2 : Math.sin(t * .8) * .035;
                    const phase = x / w * Math.PI * 2 * cycles + motion;
                    const jitter = Math.sin(x * 1.71 + t * 23) * .42;
                    const y = centerY + waveSample(this.scopeMode, phase, channel) * amplitude +
                        (channel ? 38 : this.scopeMode === 2 ? -30 : 0) + jitter;
                    x ? trace.lineTo(x, y) : trace.moveTo(x, y);
                }
            }
        };
        trace.save();
        trace.globalCompositeOperation = 'lighter';
        trace.strokeStyle = phosphor;
        trace.shadowColor = phosphor;
        for (const channel of channels) {
            path(channel);
            trace.globalAlpha = channel ? .045 : .065;
            trace.lineWidth = 6;
            trace.shadowBlur = 12;
            trace.stroke();
            path(channel);
            trace.globalAlpha = channel ? .13 : .19;
            trace.lineWidth = 1.45;
            trace.shadowBlur = 4;
            trace.stroke();
            path(channel);
            trace.globalAlpha = channel ? .32 : .46;
            trace.lineWidth = .55;
            trace.shadowBlur = 0;
            trace.stroke();
        }
        trace.restore();

        const c = this.scopeCanvas.getContext('2d')!;
        c.clearRect(0, 0, 420, 350);
        c.drawImage(this.scopeGridCanvas, 0, 0);
        c.drawImage(this.scopeTraceCanvas, 0, 0);
        c.fillStyle = 'rgba(211, 239, 232, .86)';
        c.font = '17px "PingFang SC", sans-serif';
        c.fillText(`${scopeModes[this.scopeMode]} · ${scopeRates[this.scopeRate]}`, 20, 319);
        c.fillStyle = 'rgba(174, 211, 205, .65)';
        c.font = '13px "PingFang SC", sans-serif';
        c.fillText(`${scopePersistenceModes[this.scopePersistence]} / ${this.content?.waiting ? 'STANDBY' : 'TRIGGERED'}`, 20, 340);
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
