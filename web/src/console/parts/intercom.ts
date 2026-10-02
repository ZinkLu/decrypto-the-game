import * as THREE from 'three';
import { Effect, settle, type Chassis } from './chassis';
import { initialLocal } from '../model';
import { transmitting, type IntercomDeck } from '../voice';

const off = new THREE.Color('#000000');

/**
 * The intercom beside the speaker vents: the selector, the TALK key, and three
 * lamps. RX follows what this seat hears like a filament, quick to light and
 * slow to fade; the lamp at ALL or at TEAM shows where its voice goes, and
 * blinks while the line is being put through; TALK's jewel lights while the
 * voice goes out.
 */
export class Intercom {
    private selector?: THREE.Object3D;
    private key?: THREE.Object3D;
    private keyRest = 0;
    private detent = THREE.MathUtils.degToRad(55);
    private travel = .055;
    private angle = this.detent;
    private depth = 0;
    private lamps = new Map<string, { material: THREE.MeshStandardMaterial; color: THREE.Color; mesh: THREE.Mesh }>();
    private deck: IntercomDeck = initialLocal.intercom;
    private powered = true;
    private glow = 0;
    private shown = '';

    constructor(private hearing: () => number) {}

    install(chassis: Chassis) {
        this.selector = chassis.moving('IntercomSelector', { merge: true, shadowless: true });
        this.key = chassis.moving('IntercomTalk', { merge: true, shadowless: true });
        this.detent = THREE.MathUtils.degToRad(this.selector?.userData.detent_degrees ?? 55);
        this.angle = this.detent;
        this.travel = this.key?.userData.travel ?? .055;
        this.keyRest = this.key?.position.z ?? 0;
        // The jewel rides in the key; the other lamps stay apart from the static batch.
        for (const name of ['IntercomRX', 'IntercomAll', 'IntercomTeam', 'IntercomTX']) {
            const lamp = name === 'IntercomTX' ? this.key?.getObjectByName(name) : chassis.moving(name);
            if (!(lamp instanceof THREE.Mesh) || !(lamp.material instanceof THREE.MeshStandardMaterial)) continue;
            lamp.material = lamp.material.clone();
            this.lamps.set(name, { material: lamp.material, color: lamp.material.color.clone(), mesh: lamp });
        }
    }

    update(deck: IntercomDeck, powered: boolean) {
        this.deck = deck;
        this.powered = powered;
    }

    tick(now: number, dt: number, reduced: boolean) {
        let effect = Effect.none;
        const deck = this.deck;
        // Detents: OFF to the left, ALL straight up, TEAM to the right.
        const turn = deck.selector === 'off' ? 1 : deck.selector === 'team' ? -1 : 0;
        const angle = this.angle;
        this.angle = settle(this.angle, turn * this.detent, 24, dt, reduced, .0005);
        if (this.selector) this.selector.rotation.z = this.angle;
        if (angle !== this.angle) effect |= Effect.shadow;
        // A latched key rests a little down; a held one goes all the way.
        const depth = this.depth;
        this.depth = settle(this.depth, deck.open && deck.line !== 'off' ? deck.mode === 'hold' ? this.travel : this.travel * .65 : 0, 30, dt, reduced, .0002);
        if (this.key) this.key.position.z = this.keyRest - this.depth;
        if (depth !== this.depth) effect |= Effect.shadow;
        // The RX filament lights within a syllable and dims over a breath.
        const live = this.powered && deck.line === 'on';
        const heard = live ? this.hearing() : 0;
        const glow = this.glow;
        this.glow = reduced ? heard : settle(this.glow, heard, heard > this.glow ? 28 : 7, dt, false, .01);
        if (this.glow !== glow) effect |= Effect.ambient;
        // While the line is put through, the chosen lamp blinks; once through, the route shows.
        const blink = deck.line === 'connecting' && Math.floor(now / 450) % 2 === 0;
        const route = deck.line === 'on' ? deck.route === 'table' ? 'all' : deck.route === 'team' ? 'team' : '' :
            blink ? deck.selector : '';
        const shown = [route, transmitting(deck), this.powered].join();
        if (shown !== this.shown) {
            // A blink is the lamp's own doing; a new route answers the player at once.
            effect |= this.shown.split(',')[0] !== route && deck.line === 'connecting' ? Effect.ambient : Effect.redraw;
            this.shown = shown;
        }
        // As bright as the NETWORK lamp, so the colours stay deep under tone mapping.
        this.light('IntercomRX', '#3fbf55', this.glow * .7);
        this.light('IntercomAll', '#c8700f', this.powered && route === 'all' ? .42 : 0);
        this.light('IntercomTeam', '#c8700f', this.powered && route === 'team' ? .42 : 0);
        this.light('IntercomTX', '#e2321c', this.powered && transmitting(deck) ? .6 : 0);
        return effect;
    }

    private light(name: string, color: string, intensity: number) {
        const lamp = this.lamps.get(name);
        if (!lamp) return;
        lamp.material.emissive.set(intensity > 0 ? color : off);
        lamp.material.emissiveIntensity = intensity;
        // An unlit jewel is dark glass; a lit one shows its own colour.
        lamp.material.color.copy(lamp.color).multiplyScalar(.14 + .86 * Math.min(1, intensity / .55));
    }

    /** The lamps that light by themselves: RX with the sound, and the route lamps while they blink. */
    ambientRegions(): THREE.Object3D[] {
        return ['IntercomRX', 'IntercomAll', 'IntercomTeam'].flatMap(name => this.lamps.get(name)?.mesh ?? []);
    }
}
