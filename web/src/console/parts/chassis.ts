import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { crtGeometry, crtProfile } from '../crt';
import type { Frame } from '../paint';

export interface Surface {
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
export type Plane = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial | THREE.MeshStandardMaterial>;

/**
 * What a part's frame did to the picture, combined with `|`. Ambient motion is
 * drawn at the quality level's pace; everything else is drawn at once.
 */
export const Effect = {
    none: 0,
    /** Only what moves by itself: a needle, a beam. */
    ambient: 1,
    redraw: 2,
    /** Redrawn, and the shadows are cast again. */
    shadow: 2 | 4,
    /** Redrawn, and the DOM controls follow their parts. */
    project: 2 | 8,
    casts: 4,
    projects: 8,
};

/** Approaches `target` and lands on it once within `within`; reduced motion lands at once. */
export function settle(value: number, target: number, rate: number, dt: number, reduced: boolean, within: number) {
    const next = reduced ? target : THREE.MathUtils.damp(value, target, rate, dt);
    return Math.abs(next - target) < within ? target : next;
}

/**
 * Coalesces static, opaque meshes by material. The .blend and the GLB stay fully
 * editable; only the runtime merges them. `kept` names what must stay separate.
 */
function mergeStatic(root: THREE.Object3D, kept?: (object: THREE.Object3D) => boolean) {
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    root.updateWorldMatrix(true, true);
    const inverse = root.matrixWorld.clone().invert();
    root.traverse(o => {
        if (!(o instanceof THREE.Mesh) || Array.isArray(o.material) || o.material.transparent) return;
        // Morph-animated meshes (cable leads) must never merge into a batch.
        if (o.morphTargetInfluences?.length) return;
        for (let p: THREE.Object3D | null = o; kept && p && p !== root; p = p.parent) {
            if (kept(p)) return;
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
}

interface Assembly { object: THREE.Object3D; merge: boolean; shadowless: boolean }

/** The loaded machine: its named parts, and the surfaces that carry print. */
export class Chassis {
    model?: THREE.Group;
    surfaces: Record<string, Surface> = {};
    readonly planes = new Map<string, Plane>();
    /** Every texture made at runtime; the engine disposes of them. */
    readonly textures = new Map<string, THREE.Texture>();
    private assemblies: Assembly[] = [];
    private frameHashes = new Map<string, number>();
    // A downsampled hash avoids redundant uploads of print, especially the long
    // paper. The interactive main screen bypasses this approximate comparison:
    // a small edit (such as one digit) may disappear during downsampling.
    private canvasHashes = new WeakMap<HTMLCanvasElement, number>();

    /** `invalidate` asks for a frame: a texture changed while nothing moves. */
    constructor(readonly root: THREE.Group, readonly anisotropy: number, readonly invalidate: () => void) {}

    install(model: THREE.Group, surfaces: Record<string, Surface>) {
        this.model = model;
        this.surfaces = surfaces;
        model.traverse(o => { if (o instanceof THREE.Mesh) {
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
        this.root.add(model);
        for (const [name, s] of Object.entries(surfaces)) {
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
        }
    }

    part(name: string) {
        return this.model?.getObjectByName(name) || this.model?.getObjectByName(name.replaceAll(' ', '_'));
    }

    /**
     * A part that moves, so it keeps its own meshes when the chassis is merged.
     * `merge` coalesces the meshes inside it, which move as one. `shadowless`
     * parts are too small to read in the shadow map; leaving them out keeps
     * static shadows static.
     */
    moving(name: string, options: { merge?: boolean; shadowless?: boolean } = {}) {
        const object = this.part(name);
        if (object) this.claim(object, options);
        return object;
    }
    claim<T extends THREE.Object3D>(object: T, { merge = false, shadowless = false }: { merge?: boolean; shadowless?: boolean } = {}) {
        this.assemblies.push({ object, merge, shadowless });
        return object;
    }

    /** Merges everything no part has claimed, then the inside of each claimed assembly. */
    batch() {
        const claimed = new Set(this.assemblies.map(assembly => assembly.object));
        mergeStatic(this.model!, object => claimed.has(object));
        for (const { object, merge } of this.assemblies) if (merge) mergeStatic(object);
        for (const { object, shadowless } of this.assemblies)
            if (shadowless) object.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = false; });
    }

    /**
     * Every readback waits for the GPU, so a repaint's canvases are reduced into
     * one atlas and read once (26 ms for 61 surfaces one by one, 6 ms together).
     * This comparison is approximate; never use it to suppress main-screen edits.
     */
    hash(canvases: HTMLCanvasElement[]) {
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

    /** Puts a painted frame on its surface. Returns whether a new texture image was uploaded. */
    print(name: string, frame: Frame) {
        const plane = this.planes.get(name);
        if (!plane) return false;
        let texture = this.textures.get(name);
        if (texture?.image === frame.canvas) return false;
        let hash: number | undefined;
        if (name !== 'screen') {
            this.hash([frame.canvas]);
            hash = this.canvasHashes.get(frame.canvas)!;
            if (texture && this.frameHashes.get(name) === hash) return false;
        }
        if (!texture) {
            texture = new THREE.CanvasTexture(frame.canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = this.anisotropy;
            this.textures.set(name, texture);
            plane.material.map = texture;
            plane.material.needsUpdate = true;
        } else {
            // GPU storage is allocated once per texture: a canvas of another size
            // (a marquee strip, a differently fitted keyword module) needs a fresh one.
            const before = texture.image as HTMLCanvasElement;
            if (before.width !== frame.canvas.width || before.height !== frame.canvas.height) texture.dispose();
            texture.image = frame.canvas;
            texture.needsUpdate = true;
        }
        if (hash !== undefined) this.frameHashes.set(name, hash);
        this.invalidate();
        return true;
    }
}
