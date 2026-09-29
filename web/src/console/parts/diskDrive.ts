import * as THREE from 'three';
import { diskSeatTravel, diskEjectedTravel, keyDiskPose } from '../mechanics';
import { initialLocal, type KeyDiskState } from '../model';
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
        this.eject = chassis.moving('FloppyEject', { merge: true });
        if (this.eject) this.ejectRest.copy(this.eject.position);
        this.rest.copy(disk.position);
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
    tick(now: number, reduced: boolean) {
        const pose = keyDiskPose(this.state, now, reduced);
        const previousVisible = this.disk.visible, previousTilt = this.disk.rotation.x;
        const previousX = this.disk.position.x, previousY = this.disk.position.y, previousZ = this.disk.position.z;
        this.disk.visible = pose.visible;
        this.travel = pose.travel;
        this.slide();
        this.disk.position.x += pose.x;
        this.disk.position.y += pose.y;
        this.disk.position.z += pose.z;
        this.disk.rotation.x = pose.tilt;
        // The exported assembly origin is outside the shell: rotate delivery
        // about the disk itself, then align its entire surface with the guides.
        this.pivotRotated.copy(this.pivot).applyQuaternion(this.disk.quaternion);
        this.disk.position.add(this.pivot).sub(this.pivotRotated);
        if (this.eject) {
            this.eject.position.copy(this.ejectRest);
            this.eject.position.z -= pose.button * .058;
        }
        const elapsed = now - this.state.startedAt;
        const clunk = `${this.state.id}:${this.state.phase}:${this.state.startedAt}`;
        if (this.clunk !== clunk && (this.state.phase === 'inserting' && elapsed >= 1100 ||
            this.state.phase === 'ejecting' && elapsed >= 250)) {
            this.clunk = clunk;
            this.play(this.state.phase === 'ejecting' ? 'disk-out' : 'disk-seat');
        }
        if (import.meta.env.DEV) this.host.dataset.keyDiskPhase = this.state.phase;
        const changed = previousVisible !== this.disk.visible || previousTilt !== this.disk.rotation.x ||
            previousX !== this.disk.position.x || previousY !== this.disk.position.y || previousZ !== this.disk.position.z ||
            this.state.phase === 'ejecting';
        return changed ? Effect.shadow | Effect.project : Effect.none;
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
