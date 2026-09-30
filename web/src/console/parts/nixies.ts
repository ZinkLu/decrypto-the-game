import * as THREE from 'three';
import type { Chassis } from './chassis';
import { clearAcrylic } from './glass';

/** Canvas margin, in corona pixels, for the glow a Nixie throws beyond its cathode. */
const halo = 84;

interface Corona {
    canvas: HTMLCanvasElement;
    texture: THREE.CanvasTexture;
    material: THREE.MeshBasicMaterial;
    spill: THREE.MeshBasicMaterial;
    glow: THREE.Mesh;
    pool: THREE.Mesh;
    paths: string[];
    code: string;
}

/** The room code in four Nixie tubes: modeled wire cathodes, and the glow around the lit one. */
export class NixieBay {
    private digits: { mesh: THREE.Mesh; slot: number; digit: number }[] = [];
    private coronas: Corona[] = [];
    private covers: THREE.Mesh[] = [];

    install(chassis: Chassis) {
        chassis.model!.traverse(object => {
            if (!(object instanceof THREE.Mesh)) return;
            const match = /^Nixie_Digit_(\d)_(\d)$/.exec(object.name);
            if (match) {
                object.visible = false; object.castShadow = false;
                const material = object.material as THREE.MeshStandardMaterial;
                material.toneMapped = false;
                this.digits.push({ mesh: chassis.claim(object), slot: Number(match[1]), digit: Number(match[2]) });
            }
            if (object.name.startsWith('NixieCover_') && object.material instanceof THREE.MeshStandardMaterial && object.material.transparent) {
                object.castShadow = false; object.receiveShadow = false;
                clearAcrylic(object.material as THREE.MeshPhysicalMaterial);
                object.renderOrder = 7;
                this.covers.push(object);
            }
            if (/^Nixie_.*glass$/.test(object.name)) {
                object.castShadow = false; object.receiveShadow = false;
                const glass = object.material as THREE.MeshPhysicalMaterial;
                glass.depthWrite = false; glass.side = THREE.FrontSide;
                glass.opacity = .105; glass.roughness = .075; glass.metalness = .05;
                object.renderOrder = 5;
                this.covers.push(object);
            }
        });
        const pool = this.spill();
        chassis.textures.set('nixieSpill', pool);
        for (let slot = 0; slot < 4; slot++) {
            // The glow reaches well past the cathode: the canvas keeps the digit's
            // scale and adds a margin for the neon sheath and the lit envelope.
            const canvas = document.createElement('canvas'); canvas.width = 180 + halo * 2; canvas.height = 270 + halo * 2;
            const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
            const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false,
                blending: THREE.AdditiveBlending, toneMapped: false, opacity: .85 });
            const channel = chassis.surfaces.channel, scale = channel.digitScale ?? 1;
            const glow = new THREE.Mesh(new THREE.PlaneGeometry(.40 * canvas.width / 180, .60 * scale * canvas.height / 270), material);
            glow.position.set(channel.x + (slot - 1.5) * .52, channel.y, channel.z - .097); glow.renderOrder = 4;
            chassis.root.add(glow); chassis.textures.set('nixie' + slot, texture);
            const paths = Array.from({ length: 10 }, (_, digit) =>
                this.digits.find(d => d.slot === slot && d.digit === digit)?.mesh.userData.cathode_path || '');
            // What the glow throws onto the recess: a wide, dim pool behind each lit tube.
            const spill = new THREE.Mesh(new THREE.PlaneGeometry(.78, .95 * scale), new THREE.MeshBasicMaterial({ map: pool,
                transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 }));
            spill.position.set(glow.position.x, channel.y - .04, channel.z - .19); spill.renderOrder = 3;
            chassis.root.add(spill);
            this.coronas.push({ canvas, texture, material, spill: spill.material, glow, pool: spill, paths, code: '?' });
        }
    }

    private spill() {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
        const c = canvas.getContext('2d')!, pool = c.createRadialGradient(64, 64, 4, 64, 64, 64);
        pool.addColorStop(0, 'rgba(255, 88, 22, .55)'); pool.addColorStop(.45, 'rgba(255, 66, 12, .20)'); pool.addColorStop(1, 'rgba(255, 60, 10, 0)');
        c.fillStyle = pool; c.fillRect(0, 0, 128, 128);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }

    applyQuality(covers: boolean) {
        for (const cover of this.covers) cover.visible = covers;
    }

    show(code: string) {
        for (const { mesh, slot, digit } of this.digits) mesh.visible = code[slot] === String(digit);
        this.coronas.forEach((tube, slot) => {
            const digit = code[slot] || '';
            if (tube.code === digit) return;
            tube.code = digit;
            const c = tube.canvas.getContext('2d')!;
            c.clearRect(0, 0, tube.canvas.width, tube.canvas.height);
            if (digit && tube.paths[Number(digit)]) {
                // Neon fills the envelope with a soft orange haze, densest around the lit cathode.
                const haze = c.createRadialGradient(tube.canvas.width / 2, tube.canvas.height / 2, 10, tube.canvas.width / 2, tube.canvas.height / 2, tube.canvas.height * .34);
                haze.addColorStop(0, 'rgba(255, 96, 26, .22)'); haze.addColorStop(.5, 'rgba(255, 72, 14, .08)'); haze.addColorStop(1, 'rgba(255, 60, 10, 0)');
                c.fillStyle = haze; c.fillRect(0, 0, tube.canvas.width, tube.canvas.height);
                c.save(); c.translate(22.5 + halo, 18 + halo); c.scale(1.35, 1.4625);
                c.lineCap = c.lineJoin = 'round';
                const path = new Path2D(tube.paths[Number(digit)]);
                c.strokeStyle = '#ff4109'; c.shadowColor = '#ff490c';
                c.globalAlpha = .20; c.lineWidth = 7; c.shadowBlur = 24; c.stroke(path);
                c.globalAlpha = .28; c.lineWidth = 5; c.shadowBlur = 13; c.stroke(path);
                c.globalAlpha = .46; c.lineWidth = 2.7; c.shadowBlur = 6; c.stroke(path);
                c.restore();
            }
            tube.texture.needsUpdate = true;
            tube.spill.opacity = digit ? .24 : 0;
        });
    }

    /** A glow discharge is never quite still: each tube breathes a little on its own. */
    breathe(now: number, reduced: boolean) {
        this.coronas.forEach((tube, slot) => {
            const breath = reduced ? 1 : 1 + .04 * Math.sin(now * .0131 + slot * 2.1) + .025 * Math.sin(now * .0473 + slot * 1.3);
            tube.material.opacity = .85 * breath;
            if (tube.spill.opacity > 0) tube.spill.opacity = .24 * breath;
        });
    }

    /** The glows and their pools of spill: `breathe()` changes their opacity every frame. */
    ambientRegions(): THREE.Object3D[] {
        return this.coronas.flatMap(tube => [tube.glow, tube.pool]);
    }
}
