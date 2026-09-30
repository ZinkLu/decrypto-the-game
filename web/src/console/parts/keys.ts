import * as THREE from 'three';
import { Effect, settle, type Chassis, type Plane } from './chassis';

/** How long a pressed key takes to go down and come back, in seconds. */
const stroke = .36;

/** The front keys and the mains switch: everything a finger presses or throws. */
export class Keys {
    private powerSwitch?: THREE.Object3D;
    private powerAngle = 0;
    private switchOn = true;
    private manualKey?: THREE.Object3D;
    private manualDepth = 0;
    private manual = false;
    private copyKey?: THREE.Object3D;
    private copyRestZ = 0;
    private lever?: THREE.Object3D;
    private digits: { key?: THREE.Object3D; face?: Plane }[] = [];
    private pulses = new Map<string, number>();

    /** Returns whether the mains switch is fitted. */
    install(chassis: Chassis) {
        this.manualKey = chassis.moving('ManualKey', { merge: true, shadowless: true });
        this.copyKey = chassis.moving('ChannelCopy', { merge: true });
        this.lever = chassis.moving('TransmitLever', { merge: true });
        // Each label rides with its key.
        for (const [key, surface] of [[this.manualKey, 'badge'], [this.copyKey, 'channelCopy'], [this.lever, 'transmitLabel']] as const) {
            const plane = chassis.planes.get(surface);
            if (key && plane) key.attach(plane);
        }
        this.copyRestZ = this.copyKey?.position.z ?? 0;
        for (let i = 0; i < 5; i++) this.digits.push({ key: chassis.moving('Key_' + i), face: chassis.planes.get('key' + i) });
        this.powerSwitch = chassis.moving('PowerSwitch', { merge: true });
        return !!this.powerSwitch;
    }

    update(switchOn: boolean, manual: boolean) {
        this.switchOn = switchOn;
        this.manual = manual;
    }

    pulse(id: string) {
        this.pulses.set(id, performance.now());
    }

    tick(now: number, dt: number, reduced: boolean) {
        let effect = Effect.none;
        const angle = this.powerAngle;
        const thrown = this.switchOn ? 0 : -THREE.MathUtils.degToRad(this.powerSwitch?.userData.throw_degrees ?? 32);
        this.powerAngle = settle(this.powerAngle, thrown, 22, dt, reduced, .001);
        if (this.powerSwitch) this.powerSwitch.rotation.z = this.powerAngle;
        if (angle !== this.powerAngle) effect |= Effect.shadow;
        const depth = this.manualDepth;
        this.manualDepth = settle(this.manualDepth, this.manual ? .035 : 0, 20, dt, reduced, .00001);
        if (this.manualKey) this.manualKey.position.z = .85 - this.manualDepth;
        if (Math.abs(this.manualDepth - depth) > .00001) effect |= Effect.project | Effect.shadow;
        if (this.pulses.size > 0) effect |= Effect.shadow;
        for (const [id, time] of this.pulses) {
            const age = (now - time) / 1000;
            const amount = reduced ? 0 : Math.sin(Math.min(age / stroke, 1) * Math.PI);
            if (id.startsWith('key-')) {
                const { key, face } = this.digits[Number(id.slice(4))] ?? {};
                if (key) key.position.z = .76 - amount * .07;
                if (face) face.position.z = .888 - amount * .07;
            } else if (id === 'transmit') {
                if (this.lever) this.lever.position.z = .91 - amount * .12;
            } else if (id === 'copy-code') {
                if (this.copyKey) this.copyKey.position.z = this.copyRestZ - amount * .035;
            }
            if (age > stroke) this.pulses.delete(id);
        }
        return effect;
    }
}
