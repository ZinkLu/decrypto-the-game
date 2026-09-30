import * as THREE from 'three';
import type { Chassis } from './chassis';

/** Indicator lamps and lit dials: everything that glows because the machine has power. */
export class Lamps {
    private network: THREE.MeshStandardMaterial[] = [];
    private connection?: THREE.MeshStandardMaterial;
    private test?: THREE.Mesh;
    private colors = new Map<THREE.MeshStandardMaterial, THREE.Color>();
    private lit = new Map<THREE.MeshStandardMaterial, number>();
    private scope?: { material: THREE.MeshStandardMaterial; intensity: number };
    private scopeMeshes: THREE.Mesh[] = [];
    private scopeGlow = 1;
    private testUntil = 0;
    private trafficUntil = 0;
    private state = -1;
    private powered = true;
    private linked = true;
    private connected = false;

    install(chassis: Chassis) {
        this.test = chassis.moving('RearTestLamp') as THREE.Mesh;
        // Keep the lamp independent from other lenses for the local self-test.
        const testMaterial = (this.test.material as THREE.MeshStandardMaterial).clone();
        this.test.material = testMaterial;
        this.colors.set(testMaterial, testMaterial.color.clone());
        for (const name of ['Connection lens', 'Instrument_RJ45 lamp 0', 'Instrument_RJ45 lamp 1']) {
            const lamp = chassis.moving(name);
            if (!(lamp instanceof THREE.Mesh) || !(lamp.material instanceof THREE.MeshStandardMaterial)) continue;
            lamp.material = lamp.material.clone();
            this.colors.set(lamp.material, lamp.material.color.clone());
            if (name === 'Connection lens') this.connection = lamp.material;
            else this.network.push(lamp.material);
        }
        chassis.model!.traverse(object => {
            if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial &&
                ['Tactile warm meter dial', 'Scope indicator glass'].includes(object.material.name)) {
                this.lit.set(object.material, object.material.emissiveIntensity);
                if (object.material.name === 'Scope indicator glass') {
                    this.scope = { material: object.material, intensity: object.material.emissiveIntensity };
                    this.colors.set(object.material, object.material.color.clone());
                    // `lock()` re-tunes the shared material on every drawn frame:
                    // keep its meshes out of the static batch and list them as a region.
                    chassis.claim(object);
                    this.scopeMeshes.push(object);
                }
            }
        });
    }

    /** `traffic` flashes the activity lamp for a message that just arrived. */
    update(powered: boolean, unpluggedCables: number, connected: boolean, traffic: boolean) {
        this.powered = powered;
        this.linked = powered && !(unpluggedCables & 1);
        this.connected = connected;
        if (traffic) this.trafficUntil = performance.now() + 140;
        if (!powered) this.testUntil = 0;
        for (const [material, intensity] of this.lit) material.emissiveIntensity = powered ? intensity : 0;
    }

    /** The local lamp test. Returns whether it started: a dead machine lights nothing. */
    selfTest() {
        if (!this.powered) return false;
        this.testUntil = performance.now() + 1800;
        return true;
    }

    /** When a lamp that is now lit goes out by itself, for a loop that sleeps in between. */
    deadlines(now: number) {
        return [this.testUntil, this.trafficUntil].filter(until => until > now);
    }

    /** Returns whether a lamp went on or off, which the frame has to show even when nothing moves. */
    sync(now: number) {
        const { powered, linked, connected } = this;
        const testing = powered && now < this.testUntil;
        const traffic = connected && now < this.trafficUntil;
        const state = +testing | +linked << 1 | +traffic << 2 | +connected << 3 | +powered << 4;
        const switched = state !== this.state;
        this.state = state;
        if (this.connection) {
            this.connection.emissive.set(connected || testing ? '#328248' : '#a66318');
            this.connection.emissiveIntensity = testing ? .7 : !linked ? 0 : connected ? .5 : .16;
        }
        this.network.forEach((material, index) => {
            material.emissive.set(index ? '#c89336' : '#328248');
            material.emissiveIntensity = testing ? .8 : !linked ? 0 : index === 0 ? .5 : traffic ? .8 : 0;
        });
        if (this.test?.material instanceof THREE.MeshStandardMaterial) {
            this.test.material.emissive.set('#80dc65');
            this.test.material.emissiveIntensity = !powered ? 0 : testing ? .8 : .25;
        }
        if (testing && this.scope) this.scope.material.emissiveIntensity = this.scope.intensity;
        for (const [material, color] of this.colors)
            material.color.copy(color).multiplyScalar(material.emissiveIntensity > 0 ? 1 : .14);
        return switched;
    }

    /**
     * LOCK lamp: a phase detector seen through a slow, warm filament. Fast
     * slipping blurs to a half glow; near a tongue it beats ever more slowly,
     * then steadies as the oscillators lock, brightest dead in tune.
     */
    lock(coherence: number, dt: number, reduced: boolean) {
        if (!this.scope) return;
        const drive = (1 + coherence) / 2;
        this.scopeGlow = reduced ? drive : THREE.MathUtils.damp(this.scopeGlow, drive, 5.5, dt);
        // A filament's light rises much faster than its drive, so beats read clearly.
        this.scope.material.emissiveIntensity = this.scope.intensity * (performance.now() < this.testUntil ? 1 : .03 + .97 * this.scopeGlow ** 3);
    }

    /** Every mesh the LOCK lamp's material lights: `lock()` re-tunes it on every drawn frame. */
    ambientRegions(): THREE.Object3D[] {
        return this.scopeMeshes;
    }
}
