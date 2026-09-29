import * as THREE from 'three';
import { ScoreFlagMotion } from '../scoreFlagMotion';
import type { ConsoleSound } from '../sound';
import { Effect, type Chassis } from './chassis';

/** Eight bistable flags: two interceptions and two errors for each team. */
export class ScoreRegister {
    private flags = new Map<string, { object: THREE.Object3D; motion: ScoreFlagMotion }>();

    constructor(private play: (cue: ConsoleSound) => void) {}

    install(chassis: Chassis) {
        for (const team of ['A', 'B']) for (const category of ['intercept', 'failure']) for (let k = 0; k < 2; k++) {
            const name = `${team}_${category}_${k}`;
            const object = chassis.moving('ScoreFlag_' + name);
            if (!object) throw new Error(`Missing score flag: ${name}`);
            object.traverse(part => {
                if (part instanceof THREE.Mesh) {
                    part.castShadow = part.receiveShadow = false;
                    if (part.material instanceof THREE.MeshStandardMaterial) part.material.envMapIntensity = .35;
                }
            });
            this.flags.set(name, { object, motion: new ScoreFlagMotion() });
        }
        chassis.model!.traverse(object => {
            if (!(object instanceof THREE.Mesh) || !object.name.startsWith('ScoreRegister_glass ')) return;
            object.castShadow = object.receiveShadow = false;
            if (object.material instanceof THREE.MeshStandardMaterial) {
                object.material.depthWrite = false;
                object.material.envMapIntensity = .2;
            }
        });
    }

    /** `resuming` sets the flags without a stroke: the score was kept while the link was down. */
    update(scores: Record<string, boolean>, powered: boolean, resuming: boolean) {
        let pulses = 0;
        for (const [name, flag] of this.flags) {
            if (flag.motion.sync(!!scores[name], powered, pulses * .022)) pulses++;
            if (resuming) flag.motion.advance(0, true);
            flag.object.rotation.x = flag.motion.angle;
        }
    }

    tick(dt: number, reduced: boolean) {
        let effect = Effect.none;
        for (const flag of this.flags.values()) {
            if (flag.motion.advance(dt, reduced)) {
                flag.object.rotation.x = flag.motion.angle;
                effect |= Effect.redraw;
            }
            if (flag.motion.consumeImpact()) this.play('score');
        }
        return effect;
    }
}
