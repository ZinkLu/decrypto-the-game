import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { consoleHardware, receiverSignal, ReceiverActivity, type HardwareState, type InstrumentVariant } from './model';

/** The production receiver, with optional assemblies for the development bench. */
export class ConsoleInstruments {
    private variants = new Map<InstrumentVariant, THREE.Object3D>();
    private parts = new Map<string, THREE.Object3D>();
    private variant: InstrumentVariant = 'signal';
    private amplitude = 14;
    private rate = 2;
    private powered = true;
    private demo = true;
    private aux = true;
    private demoStart = 0;
    private drum = 0;
    private receiverActivity: ReceiverActivity;

    constructor(public object: THREE.Group, original?: THREE.Object3D, random: () => number = Math.random) {
        this.receiverActivity = new ReceiverActivity(random);
        if (original) this.variants.set('original', original);
        object.traverse(part => {
            this.parts.set(part.name, part);
            if (!(part instanceof THREE.Mesh)) return;
            part.castShadow = part.receiveShadow = true;
            const materials = Array.isArray(part.material) ? part.material : [part.material];
            for (const material of materials) {
                if (material.transparent) {
                    material.depthWrite = false;
                    part.castShadow = false;
                    part.renderOrder = 3;
                }
            }
        });
        const mechanisms = {
            signal: ['SignalNeedle', 'SignalTuning', 'SignalGain', 'SignalSweep'],
            tuning: ['TuningNeedle', 'TuningDial', 'TuningFine'],
            status: ['StatusDrum', 'StatusStep', 'StatusSpeed'],
        };
        for (const variant of ['signal', 'tuning', 'status'] as const) {
            const group = object.getObjectByName('Instrument_' + variant);
            if (!group) {
                if (variant === 'signal') throw new Error('Missing production receiver');
                continue;
            }
            this.variants.set(variant, group);
            this.batch(group);
            for (const name of mechanisms[variant]) {
                const part = this.parts.get(name);
                if (!part) throw new Error('Missing instrument mechanism: ' + name);
                this.batch(part);
            }
        }
    }

    private batch(root: THREE.Object3D) {
        const moving = /^(SignalNeedle|SignalTuning|SignalGain|SignalSweep|TuningNeedle|TuningDial|TuningFine|StatusDrum|StatusStep|StatusSpeed)$/;
        const batches = new Map<THREE.Material, THREE.Mesh[]>();
        root.updateWorldMatrix(true, true);
        const inverse = root.matrixWorld.clone().invert();
        root.traverse(part => {
            if (!(part instanceof THREE.Mesh) || Array.isArray(part.material) || part.material.transparent) return;
            for (let p: THREE.Object3D | null = part; p && p !== root; p = p.parent) if (moving.test(p.name)) return;
            const list = batches.get(part.material) ?? [];
            list.push(part); batches.set(part.material, list);
        });
        for (const [material, meshes] of batches) {
            if (meshes.length < 2) continue;
            const geometries = meshes.map(mesh => {
                let geometry = mesh.geometry.clone().applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));
                if (geometry.index) { const flat = geometry.toNonIndexed(); geometry.dispose(); geometry = flat; }
                for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal'].includes(name)) geometry.deleteAttribute(name);
                return geometry;
            });
            const geometry = mergeGeometries(geometries);
            geometries.forEach(g => g.dispose());
            if (!geometry) continue;
            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = mesh.receiveShadow = true;
            root.add(mesh);
            meshes.forEach(m => { m.removeFromParent(); m.geometry.dispose(); });
        }
    }

    update(local: HardwareState) {
        if (this.variant !== local.instrumentVariant || this.demo !== local.instrumentDemo) this.demoStart = performance.now();
        this.variant = local.instrumentVariant;
        this.amplitude = local.meterAmplitude;
        this.rate = local.meterRate;
        this.powered = consoleHardware(local).powered;
        this.aux = consoleHardware(local).auxAvailable;
        this.demo = local.instrumentDemo;
        for (const [id, root] of this.variants) root.visible = id === this.variant;
    }

    /**
     * What moved this frame. A `control` the player set is drawn at once; a
     * `needle` that swings by itself is ambient motion, paced by the quality level.
     */
    tick(now: number, dt: number, reduced: boolean): 'control' | 'needle' | false {
        if (this.variant === 'original') return false;
        const t = (now - this.demoStart) / 1000;
        const animate = this.powered && !reduced;
        let control = false, needle = false;
        const rotate = (name: string, axis: 'x' | 'z', target: number, response = 18) => {
            const part = this.parts.get(name);
            if (!part) return;
            const next = reduced ? target : THREE.MathUtils.damp(part.rotation[axis], target, response, dt);
            if (Math.abs(part.rotation[axis] - next) > .00001) {
                if (/Needle$|Drum$/.test(name)) needle = true; else control = true;
            }
            part.rotation[axis] = next;
        };
        if (this.variant === 'signal') {
            const activity = this.receiverActivity.advance(dt, this.demo && animate && this.aux);
            const gain = .35 + this.rate * .2525;
            const level = !this.powered ? 0 : !this.aux ? .006 : this.demo ? Math.min(1, activity * gain) :
                receiverSignal(this.amplitude, this.rate, now / 1000, !reduced);
            rotate('SignalNeedle', 'z', 1.08 - level * 2.16, this.aux ? 15 : 9);
            rotate('SignalTuning', 'z', 2.2 - this.amplitude / 40 * 4.4);
            rotate('SignalGain', 'z', .85 - this.rate * .425);
            rotate('SignalSweep', 'x', this.demo ? -.5 : .5, 26);
        } else if (this.variant === 'tuning') {
            const sweep = this.demo && animate ? Math.sin(t * 1.2) * .83 : 0;
            const target = this.powered ? THREE.MathUtils.clamp((this.amplitude - 4) * .22 + (this.rate - 2) * .035 + sweep, -1, 1) : -1;
            rotate('TuningNeedle', 'z', -target);
            rotate('TuningDial', 'z', 1.6 - this.amplitude * .4);
            rotate('TuningFine', 'z', .85 - this.rate * .425);
        } else {
            const index = (this.amplitude + (this.demo && animate ? Math.floor(t / (1.4 + this.rate * .5)) : 0)) % 3;
            if (this.powered) {
                const angle = -index * Math.PI * 2 / 3;
                // Nearest detent avoids reversing a full revolution at WAIT → READY.
                this.drum += THREE.MathUtils.euclideanModulo(angle - this.drum + Math.PI, Math.PI * 2) - Math.PI;
            }
            rotate('StatusDrum', 'x', this.drum);
            rotate('StatusStep', 'z', .8 - this.amplitude * .8);
            rotate('StatusSpeed', 'z', .85 - this.rate * .425);
        }
        return control ? 'control' : needle && 'needle';
    }
}
