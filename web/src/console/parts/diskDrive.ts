import * as THREE from 'three';
import { diskSeatTravel, diskEjectedTravel, keyDiskPose } from '../mechanics';
import { initialLocal, keyDiskDurations, type KeyDiskState } from '../model';
import { diskIntroPreview } from '../options';
import type { ConsoleSound } from '../sound';
import { Effect, type Chassis } from './chassis';

/** The floppy drive: the key disk on its guides, and the eject button. */
export class DiskDrive {
    private disk: THREE.Object3D = new THREE.Group();
    private eject?: THREE.Object3D;
    private ejectRest = new THREE.Vector3();
    private rest = new THREE.Vector3();
    private pivot = new THREE.Vector3();
    private pivotRotated = new THREE.Vector3();
    private restScale = new THREE.Vector3(1, 1, 1);
    private previousPosition = new THREE.Vector3();
    private previousQuaternion = new THREE.Quaternion();
    private previousScale = new THREE.Vector3();
    private arrivalCenter = new THREE.Vector3();
    private arrivalQuaternion = new THREE.Quaternion();
    private heroCenter = new THREE.Vector3();
    private heroEdge = new THREE.Vector3();
    private heroQuaternion = new THREE.Quaternion();
    private parentQuaternion = new THREE.Quaternion();
    private parentScale = new THREE.Vector3();
    private cameraQuaternion = new THREE.Quaternion();
    private cameraRoll = new THREE.Quaternion();
    private labelFacing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    private zAxis = new THREE.Vector3(0, 0, 1);
    private axis = new THREE.Vector3(0, 0, 1);
    private travel = diskSeatTravel;
    private state = initialLocal.keyDisk;
    private clunk = '';

    constructor(private host: HTMLElement, private play: (cue: ConsoleSound) => void) {}

    /** The disk can be gripped: it has left the drive, or is leaving it. */
    get out() { return ['pulling', 'settling', 'ejected', 'removed', 'returning'].includes(this.state.phase); }

    /** Returns whether the drive is fitted. Blender owns the assemblies: the fixed drive housing must never eject. */
    install(chassis: Chassis) {
        const disk = chassis.moving('FloppyTransport', { merge: true });
        if (!disk) return false;
        this.disk = disk;
        // Loading the other assemblies is asynchronous. Never expose an
        // unassigned disk in the interim before the first role-aware update.
        disk.visible = false;
        this.eject = chassis.moving('FloppyEject', { merge: true });
        if (this.eject) this.ejectRest.copy(this.eject.position);
        this.rest.copy(disk.position);
        this.restScale.copy(disk.scale);
        this.pivot.copy(chassis.part('Floppy disk')?.position ?? new THREE.Vector3());
        this.axis.fromArray(disk.userData.travel_axis ?? [0, 0, 1]).normalize();
        this.travel = diskSeatTravel;
        chassis.root.updateMatrixWorld(true);
        disk.attach(chassis.planes.get('disklabel')!);
        // The label must ride with the transport: attach at the modeled rest
        // pose, only then sink the assembly to the seated offset.
        this.slide();
        return true;
    }

    private slide() {
        // The exported guide axis is perpendicular to the fascia. Keep lateral
        // position and height constant throughout both manual pushes and eject.
        this.disk.position.copy(this.rest).addScaledVector(this.axis, this.travel);
    }

    set(disk: KeyDiskState) {
        this.state = disk;
    }

    /** Poses the disk for this moment. */
    tick(now: number, reduced: boolean, camera?: THREE.PerspectiveCamera, width = 0, height = 0) {
        const announcing = this.state.phase === 'announcing';
        // The close-up ends at the exact first pose of the original delivery,
        // preserving the familiar alignment and insertion after the role cue.
        const pose = announcing
            ? keyDiskPose({ ...this.state, phase: 'arriving', startedAt: now }, now)
            : keyDiskPose(this.state, now, reduced);
        const previousVisible = this.disk.visible;
        this.previousPosition.copy(this.disk.position);
        this.previousQuaternion.copy(this.disk.quaternion);
        this.previousScale.copy(this.disk.scale);
        this.disk.visible = !!this.state.id && pose.visible;
        this.disk.scale.copy(this.restScale);
        this.travel = pose.travel;
        this.slide();
        this.disk.position.x += pose.x;
        this.disk.position.y += pose.y;
        this.disk.position.z += pose.z;
        this.disk.rotation.set(pose.tilt, 0, 0);
        // The exported assembly origin is outside the shell: rotate delivery
        // about the disk itself, then align its entire surface with the guides.
        this.pivotRotated.copy(this.pivot).applyQuaternion(this.disk.quaternion);
        this.disk.position.add(this.pivot).sub(this.pivotRotated);
        if (this.disk.visible && announcing && camera && width > 0 && height > 0)
            this.announce(now, reduced, camera, width, height);
        if (this.eject) {
            this.eject.position.copy(this.ejectRest);
            this.eject.position.z -= pose.button * .058;
        }
        const elapsed = now - this.state.startedAt;
        const clunk = `${this.state.id}:${this.state.phase}:${this.state.startedAt}`;
        if (this.clunk !== clunk && (this.state.phase === 'inserting' && elapsed >= keyDiskDurations.inserting! * 1100 / 1195 ||
            this.state.phase === 'ejecting' && elapsed >= 250)) {
            this.clunk = clunk;
            this.play(this.state.phase === 'ejecting' ? 'disk-out' : 'disk-seat');
        }
        if (import.meta.env.DEV) this.host.dataset.keyDiskPhase = this.state.phase;
        const changed = previousVisible !== this.disk.visible || !this.previousQuaternion.equals(this.disk.quaternion) ||
            !this.previousPosition.equals(this.disk.position) || !this.previousScale.equals(this.disk.scale) ||
            this.state.phase === 'ejecting';
        return changed ? Effect.shadow | Effect.project : Effect.none;
    }

    /** Presents the same physical disk at reading distance before handing it to the drive. */
    private announce(now: number, reduced: boolean, camera: THREE.PerspectiveCamera, width: number, height: number) {
        const elapsed = diskIntroPreview || reduced ? 900 : Math.max(0, (this.state.pausedAt ?? now) - this.state.startedAt);
        const rise = Math.min(1, elapsed / 450);
        const back = 1 + 2.35 * (rise - 1) ** 3 + 1.35 * (rise - 1) ** 2;
        const returnToDrive = THREE.MathUtils.smoothstep(elapsed, 2100, 2400);
        this.arrivalQuaternion.copy(this.disk.quaternion);
        this.arrivalCenter.copy(this.pivot).multiply(this.disk.scale).applyQuaternion(this.disk.quaternion).add(this.disk.position);

        // A fixed camera-space depth keeps the hero ahead of the machine. NDC
        // unprojection respects inspection zoom and the close-up view offsets.
        camera.updateWorldMatrix(true, false);
        const depth = Math.max(camera.near * 4, 10);
        const z = this.heroCenter.set(0, 0, -depth).applyMatrix4(camera.projectionMatrix).z;
        const y = -1.65 + (height <= 560 ? 1.37 : 1.57) * back;
        this.heroCenter.set(0, y, z).unproject(camera);
        this.heroEdge.set(2 / width, y, z).unproject(camera);
        const pixels = Math.min(280, width * .3, height * .38);
        const scale = this.heroCenter.distanceTo(this.heroEdge) * pixels / 1.28 * (.88 + .12 * back);
        camera.getWorldQuaternion(this.cameraQuaternion);
        this.cameraRoll.setFromAxisAngle(this.zAxis, -.12 + .085 * back);
        this.heroQuaternion.copy(this.cameraQuaternion).multiply(this.cameraRoll).multiply(this.labelFacing);
        const parent = this.disk.parent;
        if (parent) {
            parent.updateWorldMatrix(true, false);
            parent.worldToLocal(this.heroCenter);
            parent.getWorldQuaternion(this.parentQuaternion).invert();
            this.heroQuaternion.premultiply(this.parentQuaternion);
            parent.getWorldScale(this.parentScale);
        } else this.parentScale.set(1, 1, 1);
        this.disk.scale.setScalar(scale).divide(this.parentScale).lerp(this.restScale, returnToDrive);
        this.disk.quaternion.copy(this.heroQuaternion).slerp(this.arrivalQuaternion, returnToDrive);
        this.heroCenter.lerp(this.arrivalCenter, returnToDrive);
        this.pivotRotated.copy(this.pivot).multiply(this.disk.scale).applyQuaternion(this.disk.quaternion);
        this.disk.position.copy(this.heroCenter).sub(this.pivotRotated);
    }

    /** The direction on screen in which the disk leaves the drive, and how far a full pull is. */
    pullAxis(camera: THREE.Camera, width: number, height: number) {
        const from = this.rest.clone().add(this.pivot).addScaledVector(this.axis, diskSeatTravel);
        const to = this.rest.clone().add(this.pivot).addScaledVector(this.axis, diskEjectedTravel);
        this.disk.parent?.localToWorld(from);
        this.disk.parent?.localToWorld(to);
        from.project(camera); to.project(camera);
        const x = (to.x - from.x) * width / 2, y = -(to.y - from.y) * height / 2;
        const length = Math.hypot(x, y);
        return length > 2 ? { x: x / length, y: y / length, pixels: Math.max(48, Math.min(90, length)) } :
            { x: 0, y: 1, pixels: 90 };
    }

    /** Puts each corner of the physical disk into `point`, in world space, for a grip that follows it out of the fascia. */
    grip(point: THREE.Vector3, each: () => void) {
        this.disk.updateWorldMatrix(true, false);
        for (const x of [-.7, .7]) for (const z of [-.66, .66]) {
            point.set(this.pivot.x + x, this.pivot.y + .04, this.pivot.z + z).applyMatrix4(this.disk.matrixWorld);
            each();
        }
    }
}
