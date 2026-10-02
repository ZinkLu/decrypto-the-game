import * as THREE from 'three';
import { gameFraming, inspectionZoom, type HandleSide } from '../view';
import { Effect, settle, type Surface } from './chassis';

/**
 * Where the machine is seen from: one fixed camera, a machine that turns over on
 * its handles, and on the preview page a machine that can be orbited and zoomed.
 */
export class Viewpoint {
    readonly camera = new THREE.PerspectiveCamera(28, 1, .1, 150);
    /** Machine coordinates: the model and its surfaces live here. */
    readonly root = new THREE.Group();
    /** Nothing may be read or pressed on the machine while its reader is open. */
    blocked = false;
    width = 1;
    height = 1;
    private turntable = new THREE.Group();
    private inspection = new THREE.Group();
    private yaw = 0;
    private pitch = 0;
    private targetYaw = 0;
    private targetPitch = 0;
    private drag?: { pointerId: number; x: number; y: number };
    private zoom = 1;
    private zoomTarget = 1;
    private handleDrag?: number;
    private flipDirection = 1;
    private back = false;
    private flip = 0;
    private detail: string | null | undefined;
    private wordScale?: number;

    private onDown = (e: PointerEvent) => {
        if (this.handleDrag !== undefined || this.blocked) return;
        const control = e.target instanceof Element && e.target.closest('button, input, a, textarea');
        if (e.button !== 1 && (e.button !== 0 || control)) return;
        e.preventDefault();
        e.stopPropagation();
        this.drag = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
        this.host.dataset.inspecting = 'true';
        this.host.setPointerCapture(e.pointerId);
    };
    private onMove = (e: PointerEvent) => {
        const drag = this.drag;
        if (!drag || drag.pointerId !== e.pointerId) return;
        e.preventDefault();
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        this.targetYaw += dx * .0055;
        this.targetPitch = THREE.MathUtils.clamp(this.targetPitch + dy * .0045, -1.25, 1.25);
        drag.x = e.clientX; drag.y = e.clientY;
    };
    private onUp = (e: PointerEvent) => {
        if (this.drag?.pointerId !== e.pointerId) return;
        if (this.host.hasPointerCapture(e.pointerId)) this.host.releasePointerCapture(e.pointerId);
        this.drag = undefined;
        delete this.host.dataset.inspecting;
    };
    private onAuxClick = (e: MouseEvent) => {
        if (e.button === 1) e.preventDefault();
    };
    private onWheel = (e: WheelEvent) => {
        if (this.blocked || this.handleDrag !== undefined) return;
        // Knobs own their wheel input; inspecting must never retune hardware.
        if (e.target instanceof Element && e.target.closest('[role="slider"], input, textarea')) return;
        e.preventDefault();
        this.zoomTarget = inspectionZoom(this.zoomTarget, e.deltaY, e.deltaMode);
    };

    /** `orbit` is the preview page, where the machine can be turned freely and zoomed. */
    constructor(private host: HTMLElement, scene: THREE.Scene, private orbit: boolean) {
        if (orbit) {
            host.dataset.inspection = 'enabled';
            host.addEventListener('pointerdown', this.onDown, true);
            host.addEventListener('pointermove', this.onMove, true);
            host.addEventListener('pointerup', this.onUp, true);
            host.addEventListener('pointercancel', this.onUp, true);
            host.addEventListener('lostpointercapture', this.onUp, true);
            host.addEventListener('auxclick', this.onAuxClick, true);
            host.addEventListener('wheel', this.onWheel, { passive: false });
            const view = import.meta.env.DEV ? new URLSearchParams(location.search).get('view') : null;
            if (view === 'oblique' || view === 'opposite') {
                this.yaw = this.targetYaw = view === 'opposite' ? -.48 : .48;
                this.pitch = this.targetPitch = -.12;
            }
        }
        scene.add(this.inspection);
        this.inspection.add(this.turntable);
        this.turntable.add(this.root);
        // The inspection pivot passes through the chassis instead of its face.
        // These offsets cancel at rest, but rotation now happens around the
        // physical center of the machine's depth.
        this.inspection.position.z = -1.5;
        this.turntable.position.z = .5;
        this.root.position.z = 1;
    }

    /** The machine shows the face it was asked for, and nobody holds a handle. */
    get settled() { return this.handleDrag === undefined && Math.abs(this.flip - (this.back ? 1 : 0)) <= .02; }
    /** Past this the front is turned too far away for its displays to matter. */
    get frontInView() { return this.flip < .65; }
    get rear() { return this.back; }
    /** The angle the wall behind has to clear. */
    get swing() { return this.yaw + this.flipDirection * this.flip * Math.PI; }
    get tilt() { return this.pitch; }

    facingRear() {
        this.root.updateWorldMatrix(true, false);
        return this.root.worldToLocal(this.camera.getWorldPosition(new THREE.Vector3())).z < -1;
    }
    beginHandle(side: HandleSide) {
        if (Math.abs(this.flip - (this.back ? 1 : 0)) > .02) return false;
        this.flipDirection = side === 'left' ? 1 : -1;
        this.handleDrag = 0;
        this.targetYaw = this.targetPitch = 0;
        return true;
    }
    pullHandle(progress: number) { this.handleDrag = progress; }
    releaseHandle() { this.handleDrag = undefined; }
    turnTo(back: boolean, side: HandleSide = 'left') {
        if (back) this.flipDirection = side === 'left' ? 1 : -1;
        this.targetYaw = this.targetPitch = 0;
        this.handleDrag = undefined;
        this.back = back;
    }
    /** The face the console's state asks for, which a turn in progress already shows. */
    face(back: boolean) { this.back = back; }
    reset() {
        this.targetYaw = this.targetPitch = 0;
        this.zoomTarget = 1;
    }
    inspect(detail: string | null, wordScale?: number) {
        this.detail = detail;
        if (wordScale !== undefined) this.wordScale = Math.max(1, Math.min(4, wordScale));
    }

    /**
     * The full machine, inset hardware, and printed surfaces share one
     * perspective camera, fitted to the stage along a fixed viewing direction.
     */
    fit(width: number, height: number, surfaces: Record<string, Surface>) {
        this.width = width;
        this.height = height;
        const aspect = Math.max(1, width) / Math.max(1, height);
        const detail = this.detail !== undefined ? this.detail : import.meta.env.DEV ? new URLSearchParams(location.search).get('detail') : null;
        const framing = gameFraming(width, height);
        const normalHeight = this.orbit ? Math.max(13.15, 19.8 / aspect) : framing.height;
        this.camera.aspect = aspect;
        const target = this.orbit ? new THREE.Vector3(0, .1, -.4) : new THREE.Vector3(0, framing.centerY, 1.25);
        const direction = this.orbit ? new THREE.Vector3(-.18, .28, 1).normalize() : new THREE.Vector3(0, 0, 1);
        const distance = normalHeight / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
        this.camera.zoom = this.orbit ? this.zoom : 1;
        this.camera.clearViewOffset();
        this.camera.position.copy(target).addScaledVector(direction, distance);
        this.camera.lookAt(target);
        this.camera.updateProjectionMatrix();
        this.camera.updateMatrixWorld();
        const display = detail === 'words' ? surfaces.word1 : detail ? surfaces[detail] : undefined;
        if (detail === 'disk' || detail === 'meter' || detail === 'nixie' || detail === 'recorder' || detail === 'intercom' || display && (detail === 'screen' || detail === 'scope' || detail === 'words' || detail === 'score' || detail === 'roster')) {
            // Crop the original camera frustum without moving the camera:
            // close-up and full-console views keep exactly the same perspective.
            this.inspection.rotation.set(this.pitch, this.yaw, 0);
            this.root.updateWorldMatrix(true, false);
            const focus = (display
                ? this.root.localToWorld(new THREE.Vector3(detail === 'words' ? -.45 : display.x, display.y, display.z))
                : detail === 'meter' ? this.root.localToWorld(new THREE.Vector3(5.83, -1.78, 1.1))
                : detail === 'intercom' ? this.root.localToWorld(new THREE.Vector3(3.2, -4.64, .7))
                : new THREE.Vector3(5.83, detail === 'nixie' ? 3.55 : -.2, 1.1)).project(this.camera);
            const detailHeight = display
                ? Math.max(display.h * (detail === 'scope' ? 2.7 : detail === 'disk' ? 3.5 : 1.35), (detail === 'words' ? 9.8 : display.w * (detail === 'scope' ? 1.9 : 1.3)) / aspect)
                : detail === 'intercom' ? Math.max(1.3, 2.3 / aspect)
                : Math.max(detail === 'nixie' ? 3.6 : 3.3, 4.1 / aspect);
            const scale = detail === 'words' && this.wordScale !== undefined ? this.wordScale : normalHeight / detailHeight;
            // The review slider starts at the normal full-console framing and
            // eases its focus up to the word windows as the view approaches 2x.
            if (detail === 'words' && this.wordScale !== undefined) focus.multiplyScalar(Math.min(1, scale - 1));
            const w = width / scale, h = height / scale;
            this.camera.setViewOffset(width, height,
                (focus.x + 1) * width / 2 - w / 2, (1 - focus.y) * height / 2 - h / 2, w, h);
        }
    }

    /** Orbit and zoom of the preview page. */
    tickOrbit(dt: number, reduced: boolean) {
        let effect = Effect.none;
        const yaw = this.yaw, pitch = this.pitch;
        this.yaw = settle(this.yaw, this.targetYaw, 18, dt, reduced, 0);
        this.pitch = settle(this.pitch, this.targetPitch, 18, dt, reduced, 0);
        this.inspection.rotation.set(this.pitch, this.yaw, 0);
        const zoom = this.zoom;
        this.zoom = settle(this.zoom, this.zoomTarget, 18, dt, reduced, .0001);
        if (zoom !== this.zoom) {
            this.camera.zoom = this.zoom;
            this.camera.updateProjectionMatrix();
            effect |= Effect.project;
        }
        if (Math.abs(yaw - this.yaw) > .00001 || Math.abs(pitch - this.pitch) > .00001) effect |= Effect.project | Effect.shadow;
        return effect;
    }

    /** The turn over the handles: the machine lifts off the table as it comes round. */
    tickFlip(dt: number, reduced: boolean) {
        const flip = this.flip;
        this.flip = settle(this.flip, this.handleDrag ?? (this.back ? 1 : 0), 7.5, dt, reduced, .0005);
        const lift = Math.sin(this.flip * Math.PI);
        this.turntable.rotation.set(-lift * .09, this.flipDirection * this.flip * Math.PI, -this.flipDirection * lift * .035);
        this.turntable.position.set(0, lift * .32, .5 + lift * 1.3);
        return flip !== this.flip ? Effect.project | Effect.shadow : Effect.none;
    }

    dispose() {
        this.host.removeEventListener('pointerdown', this.onDown, true);
        this.host.removeEventListener('pointermove', this.onMove, true);
        this.host.removeEventListener('pointerup', this.onUp, true);
        this.host.removeEventListener('pointercancel', this.onUp, true);
        this.host.removeEventListener('lostpointercapture', this.onUp, true);
        this.host.removeEventListener('auxclick', this.onAuxClick, true);
        this.host.removeEventListener('wheel', this.onWheel);
        delete this.host.dataset.inspection;
        delete this.host.dataset.inspecting;
    }
}
