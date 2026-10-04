import * as THREE from 'three';
import { mergeRects, partialFrame, rectFromNdc, stillAfterFullFrame, type PartialChoice, type Rect } from './partialFrame';

/** DEV `?partial=`: `off` draws only full frames, `verify` compares every partial frame with a full one. */
export type PartialMode = 'off' | 'verify';

/**
 * Ambient frames redraw only their moving regions, over a copy of the last
 * full frame. This class owns the copy, the rectangles that go with it and
 * the drawing of a partial frame; the engine decides when a frame is due and
 * asks `choose()` which kind to draw. The copy and the rectangles live and
 * die together: anything that can change the picture invalidates both.
 */
export class PartialRedraw {
    /** The runtime switch; the power probe turns it on and off on one page. */
    enabled: boolean;
    fullFrames = 0;
    partialFrames = 0;
    private texture?: THREE.FramebufferTexture;
    private rects?: Rect[];
    private size = new THREE.Vector2();
    private quad?: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    private stillScene = new THREE.Scene();
    private stillCamera = new THREE.OrthographicCamera();
    private failed = false;
    private checked = false;
    private verify: boolean;
    private mismatch = 0;

    constructor(private renderer: THREE.WebGLRenderer, mode?: PartialMode | null) {
        this.enabled = mode !== 'off';
        this.verify = mode === 'verify';
        if (this.verify) renderer.domElement.dataset.partialMismatch = '0';
    }

    /** The copy of the last full frame no longer matches what the machine would draw now. */
    invalidate() {
        this.rects = undefined;
    }

    /** Whether a due frame may be partial. */
    choose(frame: Pick<PartialChoice, 'changed' | 'dirty' | 'probing' | 'shadowPending'>) {
        return partialFrame({ ...frame, enabled: this.enabled && !this.failed, stillValid: !!this.rects });
    }

    /**
     * After a full frame: a picture that is about to stand still is copied, once
     * per stop, with the rectangles of `regions` seen from `camera`; frames that
     * carry motion or a measurement never pay for the copy.
     */
    afterFullFrame(changed: boolean, probing: boolean, regions: () => THREE.Object3D[], camera: THREE.Camera, width: number, height: number) {
        this.fullFrames++;
        if (this.enabled && !this.failed && stillAfterFullFrame(changed, probing) && this.capture()) this.rects = this.project(regions(), camera, width, height);
        else this.invalidate();
    }

    /**
     * Copies the frame just drawn. The copy must happen in the same task as the
     * draw: the drawing buffer is not preserved once the frame is presented. If
     * the copy fails (some browsers refuse RGB into RGBA), partial frames turn
     * off for the page rather than risk a wrong picture.
     */
    private capture() {
        const renderer = this.renderer, size = renderer.getDrawingBufferSize(new THREE.Vector2());
        if (!this.quad) {
            // The copy holds tone-mapped, sRGB-encoded bytes; a raw shader puts it back unchanged.
            const material = new THREE.ShaderMaterial({
                uniforms: { map: { value: null } }, depthTest: false, depthWrite: false,
                vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
                fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main() { gl_FragColor = texture2D(map, vUv); }',
            });
            this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
            this.quad.frustumCulled = false;
            this.stillScene.add(this.quad);
        }
        if (!this.texture || !this.size.equals(size)) {
            this.texture?.dispose();
            this.texture = new THREE.FramebufferTexture(size.x, size.y);
            this.size.copy(size);
            this.quad.material.uniforms.map.value = this.texture;
        }
        renderer.copyFramebufferToTexture(this.texture);
        if (renderer.getContext().getError() === 0) return true;
        this.texture.dispose();
        this.texture = undefined;
        this.size.set(0, 0);
        this.fail('copying a full frame to a texture failed.');
        return false;
    }

    /**
     * The canvas rectangles of the objects that move in ambient frames. Camera,
     * view and poses cannot drift while the copy is valid: any of those draws a
     * full frame and drops the copy, so they are worked out once per copy.
     */
    private project(objects: THREE.Object3D[], camera: THREE.Camera, width: number, height: number) {
        const corner = new THREE.Vector3(), rects: Rect[] = [];
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
     * An ambient frame: the copy goes back, then the scene renders once more,
     * but only the registered regions survive the depth mask, so nothing else
     * is shaded. Depth starts at 0 everywhere (nothing passes); inside each
     * rectangle it is cleared back to 1, where the full scene draws as usual.
     * Rendering the scene once per rectangle instead would repeat the geometry
     * of the whole machine for each.
     */
    draw(scene: THREE.Scene, camera: THREE.Camera) {
        const renderer = this.renderer, depth = renderer.state.buffers.depth;
        this.partialFrames++;
        renderer.autoClear = false;
        renderer.setScissorTest(false);
        depth.setClear(0); renderer.clear(true, true, true); depth.setClear(1);
        renderer.render(this.stillScene, this.stillCamera);
        renderer.setScissorTest(true);
        for (const [x0, y0, x1, y1] of this.rects!) {
            renderer.setScissor(x0, y0, x1 - x0, y1 - y0);
            renderer.clear(false, true, false);
        }
        renderer.setScissorTest(false);
        // A colour background makes three clear before every render, whatever
        // autoClear says; the flags keep the copy and the depth mask intact.
        renderer.autoClearColor = renderer.autoClearDepth = renderer.autoClearStencil = false;
        renderer.render(scene, camera);
        renderer.autoClearColor = renderer.autoClearDepth = renderer.autoClearStencil = true;
        renderer.autoClear = true;
        if (this.verify) this.verifyFrame(scene, camera);
        else if (!this.checked) this.selfCheck(scene, camera);
    }

    /**
     * Reads the partial frame back and compares it with a full frame of the
     * same state, which is left on the canvas. Returns the differing pixel
     * count and their bounding box.
     */
    private compare(scene: THREE.Scene, camera: THREE.Camera) {
        const renderer = this.renderer, gl = renderer.getContext(), { x: width, y: height } = renderer.getDrawingBufferSize(new THREE.Vector2());
        const read = () => { const pixels = new Uint8Array(width * height * 4); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels; };
        const partial = read();
        renderer.render(scene, camera);
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
        return { count, where: `inside (${x0}, ${y0})-(${x1}, ${y1})` };
    }

    /** DEV `?partial=verify`: every partial frame must equal a full frame of the same state, pixel for pixel. */
    private verifyFrame(scene: THREE.Scene, camera: THREE.Camera) {
        const { count, where } = this.compare(scene, camera);
        if (!count) return;
        this.mismatch += count;
        this.renderer.domElement.dataset.partialMismatch = String(this.mismatch);
        console.warn(`Partial frame mismatch: ${count} pixels differ from a full frame, ${where}.`);
    }

    /**
     * The first partial frame of a page proves the path on this browser: if it
     * can be told from a full frame there, partial frames turn off for the page
     * rather than risk a wrong picture. Some browsers (Firefox) are not
     * bit-stable between two renders of the same state, so they stay on full
     * frames.
     */
    private selfCheck(scene: THREE.Scene, camera: THREE.Camera) {
        this.checked = true;
        const { count, where } = this.compare(scene, camera);
        if (count) this.fail(`a partial frame differed from a full frame at ${count} pixels, ${where}.`);
    }

    private fail(reason: string) {
        this.failed = true;
        this.invalidate();
        if (import.meta.env.DEV) console.warn(`Partial redraw disabled for this page: ${reason}`);
    }

    dispose() {
        this.texture?.dispose();
        this.quad?.geometry.dispose();
        this.quad?.material.dispose();
    }
}
