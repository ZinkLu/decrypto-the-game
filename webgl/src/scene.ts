// three.js stage — the render driver for the whole frontend.
//
// Cold-war signals-intelligence war room: a scrolling wireframe grid, a radar
// sweep on the floor, a rotating wire globe with orbital rings, drifting
// signal particles, and a 3-trace oscilloscope that reacts to player
// activity. Every phase of the game retunes the palette and camera; results
// fire full-scene pulses.

import * as THREE from 'three';

export type Mood = 'idle' | 'lobby' | 'encrypt' | 'intercept' | 'decrypt' | 'result';

/** Public stage API — also implemented by NullStage (no-WebGL fallback). */
export interface StageAPI {
  setMood(mood: Mood): void;
  pulse(kind: 'ok' | 'fail' | 'info'): void;
  activity(level: number, slot?: number): void;
  start(): void;
  dispose(): void;
}

/** No-op fallback when WebGL is unavailable: UI keeps working, canvas stays dark. */
export class NullStage implements StageAPI {
  setMood(): void {}
  pulse(): void {}
  activity(): void {}
  start(): void {}
  dispose(): void {}
}

interface MoodSpec {
  color: THREE.Color;
  bg: THREE.Color;
  cam: THREE.Vector3;
  look: THREE.Vector3;
  alert: boolean; // pulsing radar / heightened sweep
}

const MOODS: Record<Mood, MoodSpec> = {
  idle: {
    color: new THREE.Color('#2fd8c0'),
    bg: new THREE.Color('#02070a'),
    cam: new THREE.Vector3(0, 7.5, 17),
    look: new THREE.Vector3(0, 4.5, -6),
    alert: false,
  },
  lobby: {
    color: new THREE.Color('#2fd8c0'),
    bg: new THREE.Color('#02080c'),
    cam: new THREE.Vector3(0, 7, 15.5),
    look: new THREE.Vector3(0, 4.2, -6),
    alert: false,
  },
  encrypt: {
    color: new THREE.Color('#3ef0a8'),
    bg: new THREE.Color('#020906'),
    cam: new THREE.Vector3(0, 6.2, 13),
    look: new THREE.Vector3(0, 4.6, -6),
    alert: false,
  },
  intercept: {
    color: new THREE.Color('#ff4d5e'),
    bg: new THREE.Color('#0b0305'),
    cam: new THREE.Vector3(0, 5.6, 11.5),
    look: new THREE.Vector3(0, 4.4, -6),
    alert: true,
  },
  decrypt: {
    color: new THREE.Color('#ffb84d'),
    bg: new THREE.Color('#0a0602'),
    cam: new THREE.Vector3(0, 6.0, 12.5),
    look: new THREE.Vector3(0, 4.4, -6),
    alert: false,
  },
  result: {
    color: new THREE.Color('#7dd8ff'),
    bg: new THREE.Color('#030609'),
    cam: new THREE.Vector3(0, 7.2, 16),
    look: new THREE.Vector3(0, 4.6, -6),
    alert: false,
  },
};

const GRID_SIZE = 80;
const GRID_DIVISIONS = 80;
const SCOPE_POINTS = 160;
const SCOPE_LINES = 3;

export class Stage implements StageAPI {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();

  // Shared palette — one Color instance feeds every material, so a single
  // lerp retints the whole scene.
  private color = new THREE.Color('#2fd8c0');
  private targetColor = new THREE.Color('#2fd8c0');
  private bgColor = new THREE.Color('#02070a');
  private targetBg = new THREE.Color('#02070a');
  private camTarget = new THREE.Vector3(0, 7.5, 17);
  private lookTarget = new THREE.Vector3(0, 4.5, -6);
  private lookCurrent = new THREE.Vector3(0, 4.5, -6);

  private mood: MoodSpec = MOODS.idle;
  private camBase = new THREE.Vector3(0, 7.5, 17);
  private flash = 0;
  private flashColor = new THREE.Color('#ffffff');
  private shake = 0;
  private energy = 0.12;
  private energyTarget = 0.12;
  private slotBoost = [0, 0, 0];

  private grid!: THREE.LineSegments;
  private radar!: THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial>;
  private globe!: THREE.Group;
  private particles!: THREE.Points;
  private scopes: THREE.Line[] = [];
  private pointer = new THREE.Vector2(0, 0);

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.camera = new THREE.PerspectiveCamera(
      58,
      window.innerWidth / window.innerHeight,
      0.1,
      200,
    );
    this.camera.position.copy(this.camTarget);

    this.scene.background = this.bgColor;
    this.scene.fog = new THREE.Fog(this.bgColor.getHex(), 22, 78);

    this.buildGrid();
    this.buildRadar();
    this.buildGlobe();
    this.buildParticles();
    this.buildScopes();

    window.addEventListener('resize', this.onResize);
    window.addEventListener('pointermove', this.onPointerMove);
  }

  // ---- public controls -----------------------------------------------------

  setMood(mood: Mood): void {
    this.mood = MOODS[mood];
    this.targetColor.copy(this.mood.color);
    this.targetBg.copy(this.mood.bg);
    this.camTarget.copy(this.mood.cam);
    this.lookTarget.copy(this.mood.look);
  }

  /** Full-scene pulse for round results. */
  pulse(kind: 'ok' | 'fail' | 'info'): void {
    this.flash = 1;
    this.flashColor.set(kind === 'ok' ? '#3ef0a8' : kind === 'fail' ? '#ff4d5e' : '#7dd8ff');
    if (kind === 'fail') this.shake = 1;
    this.energyTarget = 1;
  }

  /** Feed live player activity (0..1) — drives the oscilloscope. */
  activity(level: number, slot?: number): void {
    this.energyTarget = Math.max(this.energyTarget, 0.15 + level * 0.75);
    if (slot !== undefined && slot >= 1 && slot <= 3) this.slotBoost[slot - 1] = 1;
  }

  start(): void {
    this.renderer.setAnimationLoop(this.tick);
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointermove', this.onPointerMove);
    this.renderer.dispose();
  }

  // ---- scene construction --------------------------------------------------

  private buildGrid(): void {
    const half = GRID_SIZE / 2;
    const cell = GRID_SIZE / GRID_DIVISIONS;
    const verts: number[] = [];
    for (let i = 0; i <= GRID_DIVISIONS; i++) {
      const p = -half + i * cell;
      verts.push(-half, 0, p, half, 0, p);
      verts.push(p, 0, -half, p, 0, half);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const mat = new THREE.LineBasicMaterial({
      color: this.color,
      transparent: true,
      opacity: 0.28,
    });
    this.grid = new THREE.LineSegments(geo, mat);
    this.grid.position.y = -2;
    this.scene.add(this.grid);
  }

  private buildRadar(): void {
    const geo = new THREE.CircleGeometry(24, 96);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: this.color },
        uSweep: { value: 0 },
        uPulse: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv * 2.0 - 1.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uSweep;
        uniform float uPulse;
        varying vec2 vUv;
        void main() {
          float r = length(vUv);
          if (r > 1.0) discard;
          float ang = atan(vUv.y, vUv.x);
          // sweep wedge trailing behind uSweep
          float d = mod(uSweep - ang, 6.2831853);
          float wedge = smoothstep(1.4, 0.0, d) * 0.85;
          // range rings
          float rings = smoothstep(0.02, 0.0, abs(fract(r * 5.0) - 0.5) - 0.46) * 0.35;
          // blips near the sweep edge
          float blip = smoothstep(0.08, 0.0, d) * smoothstep(0.15, 0.0, abs(r - 0.62)) * 2.0;
          float edge = smoothstep(0.02, 0.0, abs(r - 1.0)) * 0.9;
          float a = wedge * 0.5 + rings + blip + edge;
          a *= 0.55 + uPulse * 0.75;
          gl_FragColor = vec4(uColor, a * (1.0 - r * 0.35));
        }
      `,
    });
    this.radar = new THREE.Mesh(geo, mat);
    this.radar.rotation.x = -Math.PI / 2;
    this.radar.position.y = -1.95;
    this.scene.add(this.radar);
  }

  private buildGlobe(): void {
    this.globe = new THREE.Group();

    const wire = new THREE.Mesh(
      new THREE.IcosahedronGeometry(5.2, 2),
      new THREE.MeshBasicMaterial({
        color: this.color,
        wireframe: true,
        transparent: true,
        opacity: 0.32,
      }),
    );
    this.globe.add(wire);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(5.0, 32, 32),
      new THREE.MeshBasicMaterial({
        color: this.color,
        transparent: true,
        opacity: 0.05,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.globe.add(core);

    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(6.4 + i * 1.1, 0.03, 8, 128),
        new THREE.MeshBasicMaterial({
          color: this.color,
          transparent: true,
          opacity: 0.35 - i * 0.08,
        }),
      );
      ring.rotation.x = Math.PI / 2.15 + i * 0.22;
      ring.rotation.y = i * 0.7;
      ring.userData.spin = (i % 2 === 0 ? 1 : -1) * (0.12 + i * 0.05);
      this.globe.add(ring);
    }

    this.globe.position.set(0, 5.4, -13);
    this.scene.add(this.globe);
  }

  private buildParticles(): void {
    const count = 700;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 90;
      pos[i * 3 + 1] = Math.random() * 26 - 2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 90;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: this.color,
      size: 0.14,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.particles = new THREE.Points(geo, mat);
    this.scene.add(this.particles);
  }

  private buildScopes(): void {
    // Three horizontal traces floating in the lower foreground — the
    // "oscilloscope" that lights up with player progress.
    for (let line = 0; line < SCOPE_LINES; line++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(SCOPE_POINTS * 3), 3),
      );
      const mat = new THREE.LineBasicMaterial({
        color: this.color,
        transparent: true,
        opacity: 0.75 - line * 0.16,
        blending: THREE.AdditiveBlending,
      });
      const l = new THREE.Line(geo, mat);
      l.position.set(0, 0.9 + line * 0.85, 3.2);
      l.userData.index = line;
      this.scopes.push(l);
      this.scene.add(l);
    }
  }

  // ---- frame loop ----------------------------------------------------------

  private tick = (): void => {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    // palette + camera easing
    const ease = 1 - Math.pow(0.001, dt); // ~frame-rate independent lerp
    this.color.lerp(this.targetColor, ease * 0.6);
    this.bgColor.lerp(this.targetBg, ease * 0.6);
    this.camBase.lerp(this.camTarget, ease * 0.35);
    this.lookCurrent.lerp(this.lookTarget, ease * 0.35);

    // flash + shake decay
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.shake = Math.max(0, this.shake - dt * 1.1);
    const flashCol = this.flashColor;
    if (this.flash > 0) {
      this.scene.background = this.bgColor.clone().lerp(flashCol, this.flash * 0.45);
    } else {
      this.scene.background = this.bgColor;
    }
    if (this.scene.fog) this.scene.fog.color.copy(this.scene.background as THREE.Color);

    // pointer parallax + alert bob + shake (applied on top of the eased base)
    const px = this.pointer.x * 1.1;
    const py = this.pointer.y * 0.6;
    const alertBob = this.mood.alert ? Math.sin(t * 2.6) * 0.22 : 0;
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.5 : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.5 : 0;
    this.camera.position.set(this.camBase.x + px + sx, this.camBase.y + py + alertBob + sy, this.camBase.z);
    this.camera.lookAt(this.lookCurrent);

    // grid scroll toward the viewer
    const cell = GRID_SIZE / GRID_DIVISIONS;
    this.grid.position.z = (t * 1.6) % cell;

    // radar sweep (faster when alert)
    const radar = this.radar.material;
    radar.uniforms.uSweep.value = t * (this.mood.alert ? 2.6 : 0.9);
    radar.uniforms.uPulse.value = this.mood.alert
      ? 0.5 + Math.sin(t * 5) * 0.5
      : this.flash * 0.8;

    // globe + rings
    this.globe.rotation.y = t * 0.08;
    for (const child of this.globe.children) {
      if (child.userData.spin) child.rotation.z += child.userData.spin * dt;
    }
    const coreMat = (this.globe.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    coreMat.opacity = 0.05 + this.flash * 0.3 + (this.mood.alert ? 0.04 + Math.sin(t * 5) * 0.03 : 0);

    // particles drift
    this.particles.rotation.y = t * 0.016;
    this.particles.position.y = Math.sin(t * 0.4) * 0.6;

    // oscilloscope energy
    this.energyTarget = Math.max(0.12, this.energyTarget - dt * 0.5);
    this.energy += (this.energyTarget - this.energy) * ease;
    for (let i = 0; i < SCOPE_LINES; i++) {
      this.slotBoost[i] = Math.max(0, this.slotBoost[i] - dt * 1.4);
      const amp = 0.06 + this.energy * 0.5 + this.slotBoost[i] * 0.55;
      const freq = 0.55 + i * 0.23;
      const speed = 2.2 + i * 0.9;
      const line = this.scopes[i];
      const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let p = 0; p < SCOPE_POINTS; p++) {
        const x = (p / (SCOPE_POINTS - 1)) * 22 - 11;
        const carrier = Math.sin(x * freq + t * speed);
        const harmonic = Math.sin(x * freq * 2.7 - t * speed * 1.6) * 0.35;
        const noise = (Math.random() - 0.5) * 0.12 * this.energy;
        attr.setXYZ(p, x, (carrier + harmonic) * amp + noise, 0);
      }
      attr.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
  };

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private onPointerMove = (ev: PointerEvent): void => {
    this.pointer.set(
      (ev.clientX / window.innerWidth) * 2 - 1,
      -((ev.clientY / window.innerHeight) * 2 - 1),
    );
  };
}
