import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Content, Target } from './paint';
interface Surface {
    x: number;
    y: number;
    z: number;
    w: number;
    h: number;
    rotationX?: number;
}
export class ConsoleEngine {
    private renderer: THREE.WebGLRenderer;
    private scene = new THREE.Scene();
    private camera = new THREE.OrthographicCamera(-9, 9, 6, -6, .1, 100);
    private root = new THREE.Group();
    private surfaces: Record<string, Surface> = {};
    private planes = new Map<string, THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>();
    private textures = new Map<string, THREE.CanvasTexture>();
    private content?: Content;
    private model?: THREE.Group;
    private observer: ResizeObserver;
    private raf = 0;
    private disposed = false;
    private last = 0;
    private lastScope = 0;
    private width = 1;
    private height = 1;
    private paperOpen = false;
    private paperProgress = 0;
    private reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    private pulses = new Map<string, number>();
    private environment: THREE.WebGLRenderTarget;
    private scopeCanvas = document.createElement('canvas');
    private onContextLost = (e: Event) => { e.preventDefault(); this.fail('图形连接已中断，请刷新终端。'); };
    constructor(private host: HTMLElement, private project: () => void, private fail: (message: string) => void) {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        this.renderer.domElement.setAttribute('aria-hidden', 'true');
        this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
        host.prepend(this.renderer.domElement);
        this.scene.background = new THREE.Color('#dedad0');
        this.scene.add(this.root);
        this.camera.position.set(0, 3.8, 28);
        this.camera.lookAt(0, 0, 0);
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        const room = new RoomEnvironment();
        this.environment = pmrem.fromScene(room, .035);
        this.scene.environment = this.environment.texture;
        room.dispose();
        pmrem.dispose();
        this.scene.environmentIntensity = .35;
        this.scene.add(new THREE.HemisphereLight('#fff3dc', '#728296', 1.2));
        const key = new THREE.DirectionalLight('#fff1d9', 2.8);
        key.position.set(-7, 9, 12);
        key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048);
        key.shadow.camera.left = -11;
        key.shadow.camera.right = 11;
        key.shadow.camera.top = 9;
        key.shadow.camera.bottom = -9;
        key.shadow.normalBias = .025;
        key.shadow.bias = -.0004;
        this.scene.add(key);
        const fill = new THREE.DirectionalLight('#bdcce5', .8);
        fill.position.set(8, 3, 8);
        this.scene.add(fill);
        const back = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#ddd7c9', roughness: 1 }));
        back.position.z = -.89;
        back.receiveShadow = true;
        this.scene.add(back);
        this.scopeCanvas.width = 420;
        this.scopeCanvas.height = 350;
        this.observer = new ResizeObserver(() => this.resize());
        this.observer.observe(host);
        this.resize();
        this.raf = requestAnimationFrame(this.tick);
    }
    async load() {
        const [gltf, response] = await Promise.all([new GLTFLoader().loadAsync('/models/decrypto-console.glb'), fetch('/models/console-surfaces.json')]);
        if (!response.ok)
            throw new Error('终端面板配置载入失败。');
        const surfaces = await response.json() as Record<string, Surface>;
        if (this.disposed) {
            this.disposeObject(gltf.scene);
            return;
        }
        this.surfaces = surfaces;
        this.model = gltf.scene;
        gltf.scene.traverse(o => { if (o instanceof THREE.Mesh) {
            o.castShadow = true;
            o.receiveShadow = true;
        } });
        this.root.add(gltf.scene);
        for (const [name, s] of Object.entries(surfaces)) {
            const plane = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false }));
            plane.position.set(s.x, s.y, s.z);
            plane.rotation.x = s.rotationX ?? 0;
            plane.renderOrder = name === 'paper' ? 3 : 2;
            this.root.add(plane);
            this.planes.set(name, plane);
        }
        const scope = new THREE.CanvasTexture(this.scopeCanvas);
        scope.colorSpace = THREE.SRGBColorSpace;
        this.textures.set('scope', scope);
        this.planes.get('scope')!.material.map = scope;
        if (this.content)
            this.update(this.content, this.paperOpen);
        this.project();
    }
    update(content: Content, paperOpen: boolean) {
        this.content = content;
        this.paperOpen = paperOpen;
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
        this.project();
    }
    pulse(id: string) {
        this.pulses.set(id, performance.now());
        if (id === 'archive') {
            const wheel = this.model?.getObjectByName('Archive_scroll_wheel') || this.model?.getObjectByName('Archive scroll wheel');
            wheel?.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), .42);
        }
    }
    private resize() {
        this.width = this.host.clientWidth;
        this.height = this.host.clientHeight;
        this.renderer.setSize(this.width, this.height, false);
        const aspect = this.width / this.height;
        const height = Math.max(11.65, 17.1 / aspect);
        this.camera.left = -height * aspect / 2;
        this.camera.right = height * aspect / 2;
        this.camera.top = height / 2;
        this.camera.bottom = -height / 2;
        this.camera.updateProjectionMatrix();
        this.camera.updateMatrixWorld();
        this.project();
    }
    bounds(target: Target) {
        const frame = this.content?.frames[target.surface];
        const plane = this.planes.get(target.surface);
        const surface = this.surfaces[target.surface];
        if (!frame || !plane || !surface)
            return null;
        plane.updateWorldMatrix(true, false);
        const p1 = new THREE.Vector3((target.x / frame.width - .5) * surface.w, (.5 - target.y / frame.height) * surface.h, 0).applyMatrix4(plane.matrixWorld).project(this.camera);
        const p2 = new THREE.Vector3(((target.x + target.w) / frame.width - .5) * surface.w, (.5 - (target.y + target.h) / frame.height) * surface.h, 0).applyMatrix4(plane.matrixWorld).project(this.camera);
        return { left: (p1.x + 1) * this.width / 2, top: (1 - p1.y) * this.height / 2, width: (p2.x - p1.x) * this.width / 2, height: (p1.y - p2.y) * this.height / 2 };
    }
    private tick = (now: number) => {
        if (this.disposed)
            return;
        this.raf = requestAnimationFrame(this.tick);
        if (document.hidden || now - this.last < 32)
            return;
        const dt = Math.min((now - this.last) / 1000, .1);
        this.last = now;
        const desired = this.paperOpen ? 1 : 0;
        if (Math.abs(this.paperProgress - desired) > .001) {
            this.paperProgress = this.reduced.matches ? desired : THREE.MathUtils.damp(this.paperProgress, desired, 12, dt);
            const p = this.paperProgress;
            const plane = this.planes.get('paper');
            const s = this.surfaces.paper;
            if (plane && s) {
                plane.position.set(THREE.MathUtils.lerp(s.x, 4.55, p), THREE.MathUtils.lerp(s.y, .30, p), THREE.MathUtils.lerp(s.z, 1.3, p));
                plane.scale.set(THREE.MathUtils.lerp(1, 2.2, p), THREE.MathUtils.lerp(1, 1.90, p), 1);
            }
            this.project();
        }
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
                    lever.rotation.x = -amount * .60;
            }
            if (age > .36)
                this.pulses.delete(id);
        }
        if (now - this.lastScope > 90) {
            this.drawScope(this.reduced.matches ? 0 : now / 1000);
            this.lastScope = now;
        }
        this.renderer.render(this.scene, this.camera);
    };
    private drawScope(t: number) {
        const c = this.scopeCanvas.getContext('2d')!;
        const w = 420, h = 350;
        c.fillStyle = '#0d201f';
        c.fillRect(0, 0, w, h);
        c.strokeStyle = '#254139';
        c.lineWidth = 1;
        for (let x = 0; x < w; x += 35) {
            c.beginPath();
            c.moveTo(x, 0);
            c.lineTo(x, h);
            c.stroke();
        }
        for (let y = 0; y < h; y += 35) {
            c.beginPath();
            c.moveTo(0, y);
            c.lineTo(w, y);
            c.stroke();
        }
        const color = this.content?.tint || '#7eccac';
        c.strokeStyle = color;
        c.shadowColor = color;
        c.shadowBlur = 9;
        c.lineWidth = 2.5;
        c.beginPath();
        const amp = this.content?.waiting ? 17 : 49;
        for (let x = 0; x < w; x++) {
            const y = 158 + Math.sin(x * .044 + t * 3) * amp * Math.sin(x * .014 + t) + Math.sin(x * .113 - t * 2) * 13;
            if (x === 0)
                c.moveTo(x, y);
            else
                c.lineTo(x, y);
        }
        c.stroke();
        c.shadowBlur = 0;
        c.fillStyle = '#9ab8a8';
        c.font = '22px sans-serif';
        c.fillText(this.content?.waiting ? '监听中 · 等待信号' : '通信链路', 24, 320);
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
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
