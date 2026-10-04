import * as THREE from 'three';
import type { HardwareState } from '../model';
import { Effect, settle, type Chassis } from './chassis';

const plugs = ['RJ45', 'Serial', 'DC'];
const doorOpen = 1.85;

interface Removable { object: THREE.Object3D; rest: THREE.Vector3; amount: number; battery: boolean; bit: number }

/** The service side: the battery bay and its cells, three plugs on their leads, two slide switches. */
export class RearPanel {
    private door?: THREE.Object3D;
    private doorAngle = 0;
    private open = false;
    private removedBatteries = 0;
    private unpluggedCables = 0;
    private removable = new Map<string, Removable>();
    private leads = new Map<string, { mesh: THREE.Mesh; index: number }>();
    private switches: { slider?: THREE.Object3D; on: boolean }[] = [{ on: true }, { on: true }];

    /** Returns whether the battery bay is fitted. */
    install(chassis: Chassis) {
        this.door = chassis.moving('BatteryDoor', { merge: true });
        if (!this.door) return false;
        for (const [name, control, battery, bit] of [
            ...[0, 1, 2, 3].map(i => [`BatteryCell_${i}`, `batteryCell${i}Control`, true, 1 << i] as const),
            ...plugs.map((name, i) => [`CablePlug_${name}`, `${name}PlugControl`, false, 1 << i] as const),
        ]) {
            const object = chassis.moving(name, { merge: true }), plane = chassis.planes.get(control);
            if (!object) continue;
            this.removable.set(name, { object, rest: object.position.clone(), amount: 0, battery, bit });
            if (plane) object.attach(plane);
        }
        // Leads are separate anchored meshes, never parented to their plug: an
        // `unplugged` morph bends the cable while the far end stays put.
        for (const name of plugs) {
            const lead = chassis.part(`Tactile_${name} flexible lead`);
            if (lead instanceof THREE.Mesh && lead.morphTargetDictionary?.unplugged !== undefined)
                this.leads.set('CablePlug_' + name, { mesh: lead, index: lead.morphTargetDictionary.unplugged });
        }
        this.switches[0].slider = chassis.moving('RearSoundSwitch');
        this.switches[1].slider = chassis.moving('RearMusicSwitch');
        return true;
    }

    update(local: HardwareState) {
        this.open = local.batteryOpen;
        this.removedBatteries = local.removedBatteries;
        this.unpluggedCables = local.unpluggedCables;
        this.switches[0].on = local.soundOn;
        this.switches[1].on = local.musicOn;
    }

    tick(dt: number, reduced: boolean) {
        let effect = Effect.none;
        for (const [name, item] of this.removable) {
            const target = ((item.battery ? this.removedBatteries : this.unpluggedCables) & item.bit) ? 1 : 0;
            const previous = item.amount;
            item.amount = settle(item.amount, target, 10, dt, reduced, .001);
            item.object.position.copy(item.rest);
            if (item.battery) {
                // Clear the retaining clips before lowering the removed cell
                // below its bay; the empty seat remains visibly inspectable.
                item.object.position.z -= Math.min(1, item.amount / .38) * 1.1;
                item.object.position.y -= Math.max(0, (item.amount - .38) / .62) * 3.55;
            } else {
                item.object.position.z -= item.amount * .85;
                item.object.position.y -= item.amount * .22;
                const lead = this.leads.get(name);
                if (lead?.mesh.morphTargetInfluences)
                    lead.mesh.morphTargetInfluences[lead.index] = item.amount;
            }
            if (previous !== item.amount) effect |= Effect.project | Effect.shadow;
        }
        const angle = this.doorAngle;
        this.doorAngle = settle(this.doorAngle, this.open ? doorOpen : 0, 11, dt, reduced, .0005);
        if (this.door) this.door.rotation.y = this.doorAngle;
        if (angle !== this.doorAngle) effect |= Effect.project | Effect.shadow;
        for (const { slider, on } of this.switches) {
            if (!slider) continue;
            const target = slider.userData.centerX + (on ? -.22 : .22);
            if (slider.position.x === target) continue;
            slider.position.x = settle(slider.position.x, target, 24, dt, reduced, .0005);
            effect |= Effect.shadow;
        }
        return effect;
    }
}
