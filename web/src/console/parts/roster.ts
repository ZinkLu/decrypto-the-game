import * as THREE from 'three';
import { plateFinish } from '../finishes';
import type { Content, Frame } from '../paint';
import { RosterMotion, rosterPose } from '../rosterMotion';
import scoreRegisterSpec from '../scoreRegister.json';
import { Effect, type Chassis } from './chassis';

interface Card {
    object: THREE.Object3D;
    rest: THREE.Vector3;
    travel: number;
    motion: RosterMotion<{ id: string; frame: Frame }>;
    printed?: Frame;
    materials: THREE.Material[];
}
interface Panel {
    object: THREE.Group;
    rest: THREE.Vector3;
    motion: RosterMotion<{ id: string; frame: Frame; color: string }>;
    printed?: Frame;
    enamel: THREE.MeshStandardMaterial[];
    materials: { material: THREE.Material; opacity: number }[];
}

/** Enamel for the team plaques, brushed nickel for the score register, and the ink printed on both. */
function dressPlates(chassis: Chassis) {
    const enamel = plateFinish('enamel'), nickel = plateFinish('nickel');
    for (const [kind, finish] of [['enamel', enamel], ['nickel', nickel]] as const)
        for (const [name, texture] of Object.entries(finish)) {
            texture.anisotropy = chassis.anisotropy;
            chassis.textures.set(`${kind}-${name}`, texture);
        }
    const score = chassis.part('Front_score enamel bed');
    score?.traverse(part => {
        if (!(part instanceof THREE.Mesh)) return;
        part.material = new THREE.MeshPhysicalMaterial({
            ...nickel, color: scoreRegisterSpec.materials.faceplate, metalness: .35,
            roughnessMap: null, roughness: .82, normalScale: new THREE.Vector2(.18, .18),
            envMapIntensity: .3,
        });
    });
    for (const team of ['A', 'B']) {
        const plaque = chassis.part(`Front_roster team plaque ${team}`), plane = chassis.planes.get('roster' + team);
        if (!(plaque instanceof THREE.Mesh) || !plane) continue;
        // Map the enamel in faceplate coordinates, including the beveled
        // return. The transparent print no longer hides its real lighting.
        plaque.updateWorldMatrix(true, false); plane.updateWorldMatrix(true, false);
        const matrix = plane.matrixWorld.clone().invert().multiply(plaque.matrixWorld);
        const position = plaque.geometry.getAttribute('position');
        const uv = new Float32Array(position.count * 2), point = new THREE.Vector3();
        const surface = chassis.surfaces['roster' + team];
        for (let i = 0; i < position.count; i++) {
            point.fromBufferAttribute(position, i).applyMatrix4(matrix);
            uv[i * 2] = point.x / surface.w + .5;
            uv[i * 2 + 1] = point.y / surface.h + .5;
        }
        plaque.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        // Orange peel shows as a soft ripple in the clearcoat, not as grit.
        plaque.material = new THREE.MeshPhysicalMaterial({ ...enamel, color: '#efe5cf',
            normalScale: new THREE.Vector2(.5, .5),
            roughness: .72, metalness: .16, clearcoat: .28, clearcoatRoughness: .34 });
    }
    // Silk-screen ink fills the fine relief it is printed on: a trace of the
    // surface normal keeps it seated without striping the letters.
    for (const name of ['score', 'rosterA', 'rosterB']) {
        const material = chassis.planes.get(name)?.material;
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        const finish = name === 'score' ? nickel : enamel;
        material.normalMap = finish.normalMap;
        material.normalScale.set(.08, .08);
        material.roughnessMap = null;
        material.roughness = .9;
        material.metalness = .04;
    }
}

/** The duty roster: a name card for every seat, and a plaque in each team's colour. */
export class RosterRack {
    private cards = new Map<string, Card>();
    private panels = new Map<string, Panel>();

    constructor(private chassis: Chassis) {}

    /** Surfaces this rack prints by itself, once the outgoing card or plaque is out of sight. */
    owns(name: string) { return /^roster[AB][0-3]$/.test(name) || this.panels.has(name); }

    install() {
        this.installCards();
        dressPlates(this.chassis);
        this.installPanels();
    }

    // Roster cards are insertable assemblies; the printed face plane rides
    // with its card while the stamped well floor stays on the rack.
    private installCards() {
        for (const team of ['A', 'B']) for (let i = 0; i < 4; i++) {
            const card = this.chassis.moving(`RosterCard_${team}${i}`);
            if (!card) continue;
            const plane = this.chassis.planes.get(`roster${team}${i}`);
            if (plane) card.attach(plane);
            const travel = card.userData.travel;
            const materials: THREE.Material[] = [];
            card.traverse(object => {
                if (!(object instanceof THREE.Mesh)) return;
                if (object !== plane) object.material = object.material.clone();
                // Solid card/ink depth stays authoritative against the fixed
                // clips. Only the fully withdrawn end fades, using coverage
                // instead of transparent-object sorting through the rack.
                object.material.transparent = object === plane;
                object.material.alphaHash = object !== plane;
                materials.push(object.material);
            });
            this.cards.set(team + i, { object: card, rest: card.position.clone(),
                travel: typeof travel === 'number' ? travel : .58,
                motion: new RosterMotion(), materials });
        }
    }

    private installPanels() {
        const model = this.chassis.model!;
        for (const team of ['A', 'B']) {
            const name = 'roster' + team;
            const plaque = this.chassis.part(`Front_roster team plaque ${team}`);
            const surface = this.chassis.surfaces[name], plane = this.chassis.planes.get(name);
            if (!plaque || !plane) continue;
            const object = new THREE.Group();
            object.name = 'ThemePanel_' + name;
            object.position.set(surface.x, surface.y, surface.z);
            model.add(object);
            model.updateWorldMatrix(true, true);
            object.attach(plaque);
            object.attach(plane);
            // Clone per source material, so fading one module never affects the
            // chassis and its static meshes can still be batched by material.
            const clones = new Map<THREE.Material, THREE.Material>();
            const materials = new Set<THREE.Material>();
            const enamel = new Set<THREE.MeshStandardMaterial>();
            object.traverse(part => {
                if (!(part instanceof THREE.Mesh)) return;
                const remap = (source: THREE.Material) => {
                    let material = source;
                    if (part !== plane) {
                        material = clones.get(source) ?? source.clone();
                        clones.set(source, material);
                        if (material instanceof THREE.MeshStandardMaterial)
                            enamel.add(material);
                    }
                    if (!material.transparent) material.alphaHash = true;
                    materials.add(material);
                    return material;
                };
                part.material = Array.isArray(part.material) ? part.material.map(remap) : remap(part.material);
            });
            this.chassis.claim(object, { merge: true });
            this.panels.set(name, { object, rest: object.position.clone(), motion: new RosterMotion(), enamel: [...enamel],
                materials: [...materials].map(material => ({ material, opacity: material.opacity })) });
        }
    }

    update(content: Content) {
        // Identity matters: replacing an occupied seat also exchanges its card.
        for (const [id, seat] of this.cards) {
            const player = content.seats[id];
            seat.motion.sync(player === null || player === undefined ? null : { id: player, frame: content.frames['roster' + id] });
        }
        for (const [name, panel] of this.panels)
            panel.motion.sync({ id: content.paletteKey, frame: content.frames[name], color: content.teamPlates[name.slice(-1) as 'A' | 'B'] });
    }

    tick(dt: number, reduced: boolean) {
        let effect = Effect.none;
        for (const [id, seat] of this.cards) {
            const previous = seat.motion.amount;
            seat.motion.advance(dt, reduced);
            const pose = rosterPose(seat.motion.amount, seat.travel);
            seat.object.visible = !!seat.motion.current && pose.opacity > 0;
            seat.object.position.copy(seat.rest);
            seat.object.position.y += pose.y;
            seat.object.position.z += pose.z;
            for (const material of seat.materials) material.opacity = pose.opacity;
            const frame = seat.motion.current?.frame;
            if (frame && frame !== seat.printed) {
                this.chassis.print('roster' + id, frame);
                seat.printed = frame;
            }
            if (previous !== seat.motion.amount) effect |= Effect.project | Effect.shadow;
        }
        for (const [name, panel] of this.panels) {
            const previous = panel.motion.amount;
            panel.motion.advance(dt, reduced);
            const pose = rosterPose(panel.motion.amount, .5);
            panel.object.visible = !!panel.motion.current && pose.opacity > 0;
            panel.object.position.set(panel.rest.x, panel.rest.y + pose.y, panel.rest.z + pose.z);
            for (const { material, opacity } of panel.materials) material.opacity = opacity * pose.opacity;
            const frame = panel.motion.current?.frame;
            if (panel.motion.current) for (const material of panel.enamel) material.color.set(panel.motion.current.color);
            if (frame && frame !== panel.printed) {
                this.chassis.print(name, frame);
                panel.printed = frame;
            }
            if (previous !== panel.motion.amount) effect |= Effect.shadow;
        }
        return effect;
    }
}
