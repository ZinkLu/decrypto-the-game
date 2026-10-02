import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import type { QualityProfile } from '../quality';

/** The room the machine stands in: its light, its reflections and the wall behind it. */
export class Studio {
    private environment: THREE.WebGLRenderTarget;
    private lights: { light: THREE.Light; intensity: number }[];
    private areaLights: THREE.RectAreaLight[];
    private key: THREE.DirectionalLight;
    private backdrop: THREE.Mesh;
    private backdropColor = new THREE.Color('#bcb5a5');
    private pulseColor = new THREE.Color();

    constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
        scene.background = new THREE.Color('#d3cfc4');
        const pmrem = new THREE.PMREMGenerator(renderer);
        const room = new RoomEnvironment();
        this.environment = pmrem.fromScene(room, .035);
        scene.environment = this.environment.texture;
        room.dispose();
        pmrem.dispose();
        scene.environmentIntensity = .30;
        const sky = new THREE.HemisphereLight('#f5e4cb', '#53636d', .26);
        scene.add(sky);
        const key = new THREE.DirectionalLight('#ffe9c7', 3.4);
        key.position.set(-8, 10, 12);
        key.castShadow = true;
        key.shadow.mapSize.set(1024, 1024);
        key.shadow.camera.left = -11;
        key.shadow.camera.right = 11;
        key.shadow.camera.top = 9;
        key.shadow.camera.bottom = -9;
        key.shadow.normalBias = .012;
        key.shadow.bias = -.00015;
        key.shadow.camera.near = 1;
        key.shadow.camera.far = 40;
        key.shadow.radius = 5;
        key.shadow.blurSamples = 8;
        scene.add(key);
        const fill = new THREE.DirectionalLight('#b9d0df', .38);
        fill.position.set(9, 1, 5);
        scene.add(fill);
        // Broad studio sources light every material, including the enamel,
        // aluminum edges and acrylic. No light is attached to the tube readout.
        RectAreaLightUniformsLib.init();
        const softbox = new THREE.RectAreaLight('#fff2dd', 4.5, 8, 2.2);
        softbox.position.set(-3.5, 7, 7);
        softbox.lookAt(0, 0, 0);
        softbox.rotateZ(-.2);
        scene.add(softbox);
        const rim = new THREE.RectAreaLight('#d6e5ec', 3, 9, .55);
        rim.position.set(6.5, 3, 8);
        rim.lookAt(6.5, 3, 0);
        rim.rotateZ(-.12);
        scene.add(rim);
        this.key = key;
        this.areaLights = [softbox, rim];
        this.lights = [sky, key, fill].map(light => ({ light, intensity: light.intensity }));
        this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#bcb5a5', roughness: .94 }));
        this.backdrop.position.z = -3.95;
        this.backdrop.receiveShadow = true;
        scene.add(this.backdrop);
    }

    applyQuality(quality: QualityProfile) {
        // Without the softbox and rim, the remaining sources rise to the same
        // mean exposure (matched on the lit front of the late-game console).
        for (const light of this.areaLights) light.visible = quality.areaLights;
        for (const { light, intensity } of this.lights) light.intensity = intensity * (quality.areaLights ? 1 : 1.26);
        this.key.castShadow = quality.shadows;
    }

    /** The wall catches a little result colour; the machine's materials keep their identity. */
    scorePulse(level: number, color: string) {
        const material = this.backdrop.material as THREE.MeshStandardMaterial;
        material.color.copy(this.backdropColor).lerp(this.pulseColor.set(color), level * .15);
    }

    /**
     * Keeps the shadow receiver close head-on, then moves it behind the rotated
     * chassis' conservative bounding depth before an edge can cross the visible
     * background. Returns whether the wall moved.
     */
    clear(yaw: number, pitch: number) {
        const z = -3.95 - Math.abs(Math.sin(yaw)) * 8.2 - Math.abs(Math.sin(pitch)) * 5.2;
        const moved = Math.abs(this.backdrop.position.z - z) > .00001;
        this.backdrop.position.z = z;
        return moved;
    }

    dispose() {
        this.environment.dispose();
    }
}
