import * as THREE from 'three';
import { paperTooth, paperTextureLength, receiptHeadPath } from '../mechanics';
import type { ConsoleSound } from '../sound';
import { ReceiptTransport, paperStillFrame } from '../tearing';
import { Effect, type Chassis, type Plane } from './chassis';

interface Hooks {
    /** The stock is out far enough for the reader to open. */
    onPull: () => void;
    play: (cue: ConsoleSound) => void;
    /** Asked every frame while the rollers turn (a start can still be refused), once when they stop. */
    setFeed: (moving: boolean) => void;
}

/** The receipt printer: stock fed over the platen, read, torn off and fed again. */
export class Printer {
    private receipt = new ReceiptTransport();
    private paper?: THREE.Mesh;
    private head?: THREE.Mesh;
    private headArc: number[] = [];
    private roller?: THREE.Object3D;
    private rollerRest = new THREE.Quaternion();
    private nipY = 0;
    private plane?: Plane;
    private leaderHeight = 1;
    private open = false;
    private readerStarted = false;
    private feeding = false;
    private shadowSkip = 0;

    constructor(private host: HTMLElement, private hooks: Hooks) {}

    /** `records` is what a development still prints; the machine itself starts with a bare leader. */
    install(chassis: Chassis, records: number) {
        this.roller = chassis.moving('Paper roller');
        if (this.roller) this.rollerRest.copy(this.roller.quaternion);
        chassis.moving('PaperFeed');
        const paper = chassis.part('Paper back'), surface = chassis.surfaces.paper;
        if (!(paper instanceof THREE.Mesh) || paper.parent?.name !== 'PaperFeed') return;
        this.plane = chassis.planes.get('paper');
        this.leaderHeight = surface.h;
        this.nipY = paper.parent.position.y;
        // The mesh is the tearing simulation's particle grid: two columns
        // per tooth, rows crowding toward the tooth line where it bends.
        paper.geometry.dispose();
        this.receipt.width = surface.w;
        paper.geometry = new THREE.PlaneGeometry(surface.w, 1, this.receipt.columns, this.receipt.rows);
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
        const roller = this.roller ? inFeed(this.roller) : new THREE.Vector3(0, .165, -.167);
        const rollerBox = this.roller ? new THREE.Box3().setFromObject(this.roller) : null;
        const rollerRadius = rollerBox ? (rollerBox.max.y - rollerBox.min.y) / 2 : .095;
        const opening = chassis.part('Printer opening');
        const openingBackZ = opening ? new THREE.Box3().setFromObject(opening).min.z - feed.getWorldPosition(new THREE.Vector3()).z : roller.z - .14;
        const path = receiptHeadPath({ y: roller.y, z: roller.z, radius: rollerRadius + .006 }, openingBackZ);
        const columns = this.receipt.columns, width = surface.w;
        const headPositions = new Float32Array(path.length * (columns + 1) * 3);
        const headUv = new Float32Array(path.length * (columns + 1) * 2);
        const headIndex: number[] = [];
        // Print continues up the stub: arc length back from the tear line.
        this.headArc = path.map(() => 0);
        for (let i = path.length - 2; i >= 0; i--) {
            this.headArc[i] = this.headArc[i + 1] + Math.hypot(path[i].y - path[i + 1].y, path[i].z - path[i + 1].z);
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
        this.head = head;
        this.paper = paper;
        // Deterministic development stills run the same mechanics to a frame.
        const frame = import.meta.env.DEV ? paperStillFrame(new URLSearchParams(location.search).get('paper-frame')) : null;
        if (frame !== null) {
            const phase = new URLSearchParams(location.search).get('paper-phase');
            this.receipt.still(phase === 'feed' ? 'feed' : phase === 'refill' ? 'refill' : 'tear', frame, records);
        }
        this.lay();
        this.receipt.warmUp();
    }

    /** The printed texture belongs on the stock as much as on its flat leader. */
    thread(texture: THREE.Texture | undefined) {
        if (!texture || !this.paper) return;
        for (const mesh of [this.paper, this.head]) {
            const stock = mesh?.material as THREE.MeshStandardMaterial | undefined;
            if (!stock || stock.map === texture) continue;
            stock.map = texture; stock.needsUpdate = true;
        }
    }

    sync(open: boolean, records: number, powered: boolean) {
        this.open = open;
        if (!open || !powered) this.readerStarted = false;
        this.receipt.sync(open, records);
        this.beginReader(powered);
    }

    private beginReader(powered: boolean) {
        if (!powered || !this.open || this.readerStarted || !['feeding', 'reading'].includes(this.receipt.phase)) return;
        this.readerStarted = true;
        this.hooks.onPull();
    }

    /** Moves the mesh to where the transport has the stock. */
    private lay() {
        if (!this.paper) return Effect.none;
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
        if (this.head) {
            // The stub shows the roll beyond the sheet's top, so its print
            // scrolls onto the leader as stock feeds out.
            const headUv = this.head.geometry.getAttribute('uv');
            for (let i = 0; i < this.headArc.length; i++) for (let j = 0; j < columns; j++) {
                headUv.setY(i * columns + j, (length + this.headArc[i]) / paperTextureLength);
            }
            headUv.needsUpdate = true;
        }
        // The small printed leader moves with the free end; text never stretches
        // over the full paper length or stays behind on the metal panel.
        if (this.plane) { this.plane.position.y = this.nipY - length / 2; this.plane.scale.y = length / this.leaderHeight; }
        if (this.roller) {
            this.roller.quaternion.copy(this.rollerRest);
            this.roller.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.receipt.feedTravel / .095));
        }
        if (this.shadowSkip-- <= 0) {
            this.shadowSkip = 3;
            return Effect.project | Effect.casts;
        }
        return Effect.project;
    }

    /** `dt` in seconds. An unpowered printer still lets go of a sheet that is being torn off. */
    tick(dt: number, reduced: boolean, powered: boolean) {
        let effect = Effect.none, feeding = false;
        if (this.receipt.active && (powered || this.receipt.phase === 'tearing')) {
            const phase = this.receipt.phase, travel = this.receipt.feedTravel, tear = this.receipt.pose.tear;
            this.receipt.advance(dt * 1000, reduced, powered);
            // Rollers sound only while moving; the rip starts when fibers break.
            if (this.receipt.feedTravel > travel) {
                if (reduced) this.hooks.play('paper-feed');
                else feeding = true;
            }
            if (phase === 'tearing' && (reduced || (tear === 0 && this.receipt.pose.tear > 0)))
                this.hooks.play('paper-tear');
            effect |= this.lay() | Effect.redraw;
            if (!this.receipt.active) effect |= Effect.casts;
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
            this.beginReader(powered);
        }
        if (feeding || this.feeding) this.hooks.setFeed(feeding);
        this.feeding = feeding;
        return effect;
    }
}
