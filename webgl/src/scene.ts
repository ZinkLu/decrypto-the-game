// three.js stage — the render driver for the whole frontend.
//
// The Decrypto box art deconstructed into a floating instrument cluster:
// the radio console's parts — round oscilloscope, VU meter, knobs, keypad,
// fader, indicator lamps — drift as separate modules at different depths in
// a dark navy room, each slowly bobbing. Game phases relight the set;
// results kick the needle and flash the room.

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
  light: THREE.Color; // glow over the console
  bg: THREE.Color; // room color
  screen: THREE.Color; // oscilloscope phosphor
  cam: THREE.Vector3;
  look: THREE.Vector3;
  alert: boolean; // blinking red lamp / heightened motion
}

const MOODS: Record<Mood, MoodSpec> = {
  idle: {
    light: new THREE.Color('#d9cfae'),
    bg: new THREE.Color('#0d1424'),
    screen: new THREE.Color('#ff5a3c'),
    cam: new THREE.Vector3(0, 7.5, 16.5),
    look: new THREE.Vector3(0, 2.2, -8),
    alert: false,
  },
  lobby: {
    light: new THREE.Color('#d9cfae'),
    bg: new THREE.Color('#0d1526'),
    screen: new THREE.Color('#ff5a3c'),
    cam: new THREE.Vector3(0, 7, 15.5),
    look: new THREE.Vector3(0, 2, -8),
    alert: false,
  },
  encrypt: {
    light: new THREE.Color('#e8a33d'),
    bg: new THREE.Color('#151021'),
    screen: new THREE.Color('#ffb45e'),
    cam: new THREE.Vector3(0, 6.2, 13.5),
    look: new THREE.Vector3(0, 1.8, -8),
    alert: false,
  },
  intercept: {
    light: new THREE.Color('#e0492f'),
    bg: new THREE.Color('#190c10'),
    screen: new THREE.Color('#ff4a3c'),
    cam: new THREE.Vector3(0, 5.6, 12),
    look: new THREE.Vector3(0, 1.6, -8),
    alert: true,
  },
  decrypt: {
    light: new THREE.Color('#efe3c0'),
    bg: new THREE.Color('#101527'),
    screen: new THREE.Color('#ffd9a0'),
    cam: new THREE.Vector3(0, 6, 13),
    look: new THREE.Vector3(0, 1.8, -8),
    alert: false,
  },
  result: {
    light: new THREE.Color('#93a7d8'),
    bg: new THREE.Color('#0e1526'),
    screen: new THREE.Color('#ff5a3c'),
    cam: new THREE.Vector3(0, 7.2, 16),
    look: new THREE.Vector3(0, 2.2, -8),
    alert: false,
  },
};

const SCOPE_POINTS = 140;

const stdMat = (color: string, roughness = 0.6, metalness = 0.2): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

export class Stage implements StageAPI {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();

  // Retint targets: lerped every frame in tick(), then copied into the
  // light/materials that own them (three.js materials copy constructor
  // colors, so sharing Color instances at build time would NOT retint).
  private lightColor = new THREE.Color('#d9cfae');
  private targetLight = new THREE.Color('#d9cfae');
  private bgColor = new THREE.Color('#0d1424');
  private targetBg = new THREE.Color('#0d1424');
  private screenColor = new THREE.Color('#ff5a3c');
  private targetScreen = new THREE.Color('#ff5a3c');
  private camTarget = new THREE.Vector3(0, 7.5, 16.5);
  private camBase = new THREE.Vector3(0, 7.5, 16.5);
  private lookTarget = new THREE.Vector3(0, 2.2, -8);
  private lookCurrent = new THREE.Vector3(0, 2.2, -8);

  private mood: MoodSpec = MOODS.idle;
  private flash = 0;
  private flashColor = new THREE.Color('#ffffff');
  private shake = 0;
  private energy = 0.18;
  private energyTarget = 0.18;
  private slotBoost = [0, 0, 0];

  private moodLight!: THREE.PointLight;
  private traceA!: THREE.Line;
  private traceB!: THREE.Line;
  private traceMatA!: THREE.LineBasicMaterial;
  private traceMatB!: THREE.LineBasicMaterial;
  private glowMat!: THREE.MeshBasicMaterial;
  private needle!: THREE.Group;
  private sliderHandle!: THREE.Group;
  private lampPower!: THREE.MeshStandardMaterial;
  private lampRed!: THREE.MeshStandardMaterial;
  private lampBlue!: THREE.MeshStandardMaterial;
  private knobSpinners: THREE.Group[] = [];
  private dust!: THREE.Points;
  // Floating modules: base transform + per-module drift parameters.
  private modules: {
    g: THREE.Group;
    y0: number;
    ry0: number;
    ph: number;
    sp: number;
    bob: number;
    sway: number;
  }[] = [];
  private pointer = new THREE.Vector2(0, 0);

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      // 'low-power': the scene is light — no reason to wake the discrete GPU.
      powerPreference: 'low-power',
    });
    // Cap at 1.5x: full Retina (2x) quadruples the fragment load for a barely
    // visible difference on a decorative background.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      200,
    );
    this.camera.position.copy(this.camTarget);

    this.scene.background = this.bgColor;
    this.scene.fog = new THREE.Fog(this.bgColor.getHex(), 20, 70);

    // room lighting: cool ambient, warm key, mood-tinted point over the panel
    this.scene.add(new THREE.HemisphereLight(0x33415f, 0x3a2f22, 0.75));
    const key = new THREE.DirectionalLight(0xffe9c4, 1.5);
    key.position.set(6, 14, 10);
    this.scene.add(key);
    this.moodLight = new THREE.PointLight(this.lightColor.getHex(), 90, 60, 1.8);
    this.moodLight.position.set(0, 7, 2);
    this.scene.add(this.moodLight);

    this.buildDust();
    this.buildModules();

    window.addEventListener('resize', this.onResize);
    window.addEventListener('pointermove', this.onPointerMove);
  }

  // ---- public controls -----------------------------------------------------

  setMood(mood: Mood): void {
    this.mood = MOODS[mood];
    this.targetLight.copy(this.mood.light);
    this.targetBg.copy(this.mood.bg);
    this.targetScreen.copy(this.mood.screen);
    this.camTarget.copy(this.mood.cam);
    this.lookTarget.copy(this.mood.look);
  }

  /** Full-scene pulse for round results: needle kick + room flash. */
  pulse(kind: 'ok' | 'fail' | 'info'): void {
    this.flash = 1;
    this.flashColor.set(kind === 'ok' ? '#e8c15a' : kind === 'fail' ? '#e0492f' : '#93a7d8');
    if (kind === 'fail') this.shake = 1;
    this.energyTarget = 1;
  }

  /** Feed live player activity (0..1) — drives the scope and the VU needle. */
  activity(level: number, slot?: number): void {
    this.energyTarget = Math.max(this.energyTarget, 0.2 + level * 0.75);
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

  private buildDust(): void {
    const count = 260;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 50;
      pos[i * 3 + 1] = Math.random() * 16 - 2;
      pos[i * 3 + 2] = Math.random() * 28 - 20;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x8fa0c8,
      size: 0.08,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.dust = new THREE.Points(geo, mat);
    this.scene.add(this.dust);
  }

  /** Register a module for the slow floating drift applied in tick(). */
  private float(g: THREE.Group, bob: number, sway: number, sp = 0.5): void {
    this.modules.push({
      g,
      y0: g.position.y,
      ry0: g.rotation.y,
      ph: Math.random() * Math.PI * 2,
      sp,
      bob,
      sway,
    });
  }

  /** Small dark-bronze back plate so a module reads as hardware, not a ghost. */
  private static backplate(geo: THREE.BufferGeometry): THREE.Mesh {
    return new THREE.Mesh(geo, stdMat('#3f382c', 0.7, 0.3));
  }

  /** The console, deconstructed: each instrument is its own floating module
   *  placed around the periphery (the DOM panels own the screen center). */
  private buildModules(): void {
    this.buildScope();
    this.buildVU();
    this.buildKnobs();
    this.buildKeypad();
    this.buildSlider();
    this.buildLamps();
    this.buildGrille();
    this.buildCables();
  }

  /** Round red-tinted oscilloscope — the box's signature element, floating left. */
  private buildScope(): void {
    const scope = new THREE.Group();
    scope.position.set(-11.5, 3.2, -8);
    scope.rotation.y = 0.38;
    scope.rotation.x = -0.06;

    const back = Stage.backplate(new THREE.CylinderGeometry(4.75, 4.95, 0.6, 48));
    back.rotation.x = Math.PI / 2;
    back.position.z = -0.45;
    scope.add(back);

    const bezel = new THREE.Mesh(new THREE.TorusGeometry(4.35, 0.3, 14, 72), stdMat('#8f8672', 0.35, 0.75));
    scope.add(bezel);

    const screen = new THREE.Mesh(
      new THREE.CircleGeometry(4.05, 64),
      new THREE.MeshBasicMaterial({ color: '#150a05' }),
    );
    screen.position.z = 0.06;
    scope.add(screen);

    // phosphor glow layer (retinted per mood, pulsing on alert)
    this.glowMat = new THREE.MeshBasicMaterial({
      color: '#ff5a3c',
      transparent: true,
      opacity: 0.06,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(new THREE.CircleGeometry(4.05, 64), this.glowMat);
    glow.position.z = 0.07;
    scope.add(glow);

    // etched graticule
    const gridMat = new THREE.LineBasicMaterial({ color: '#3d1a10', transparent: true, opacity: 0.9 });
    for (const r of [1.35, 2.7]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
      }
      const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat);
      ring.position.z = 0.1;
      scope.add(ring);
    }
    const cross = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-3.9, 0, 0), new THREE.Vector3(3.9, 0, 0),
        new THREE.Vector3(0, -3.9, 0), new THREE.Vector3(0, 3.9, 0),
      ]),
      gridMat,
    );
    cross.position.z = 0.1;
    scope.add(cross);

    // two live traces, rewritten every frame in tick()
    this.traceMatA = new THREE.LineBasicMaterial({
      color: '#ff5a3c',
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });
    this.traceMatB = new THREE.LineBasicMaterial({
      color: '#ff5a3c',
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
    });
    const mkTrace = (mat: THREE.LineBasicMaterial): THREE.Line => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SCOPE_POINTS * 3), 3));
      const line = new THREE.Line(geo, mat);
      line.position.z = 0.14;
      return line;
    };
    this.traceA = mkTrace(this.traceMatA);
    this.traceB = mkTrace(this.traceMatB);
    scope.add(this.traceA, this.traceB);

    this.scene.add(scope);
    this.float(scope, 0.3, 0.04, 0.42);
  }

  /** VU meter: canvas-drawn dial, needle swings with player activity. */
  private buildVU(): void {
    const vu = new THREE.Group();
    vu.position.set(10.5, 6.5, -12);
    vu.rotation.y = -0.42;

    const back = Stage.backplate(new THREE.BoxGeometry(7.2, 7.2, 0.7));
    back.position.z = -0.4;
    vu.add(back);

    const housing = new THREE.Mesh(new THREE.BoxGeometry(6.4, 6.4, 0.5), stdMat('#8f8672', 0.35, 0.75));
    vu.add(housing);
    const inset = new THREE.Mesh(new THREE.BoxGeometry(5.9, 5.9, 0.3), stdMat('#1c130c', 0.7, 0.1));
    inset.position.z = 0.2;
    vu.add(inset);

    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(5.7, 5.7),
      new THREE.MeshBasicMaterial({ map: this.vuTexture(), transparent: true }),
    );
    face.position.z = 0.4;
    vu.add(face);

    // needle pivots where the dial's arc center sits (see vuTexture)
    this.needle = new THREE.Group();
    this.needle.position.set(0, -2.38, 0.5);
    const pin = new THREE.Mesh(new THREE.BoxGeometry(0.09, 3.2, 0.05), stdMat('#c9402e', 0.4, 0.1));
    pin.position.y = 1.6;
    this.needle.add(pin);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 20), stdMat('#2b3040', 0.45, 0.5));
    cap.rotation.x = Math.PI / 2;
    cap.position.z = 0.02;
    this.needle.add(cap);
    vu.add(this.needle);

    this.scene.add(vu);
    this.float(vu, 0.35, 0.03, 0.36);
  }

  private vuTexture(): THREE.CanvasTexture {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 512;
    const g = cv.getContext('2d');
    if (g) {
      // cream dial
      g.beginPath();
      g.arc(256, 256, 248, 0, Math.PI * 2);
      g.fillStyle = '#f2e9d0';
      g.fill();
      g.lineWidth = 6;
      g.strokeStyle = '#8f8672';
      g.stroke();

      const px = 256;
      const py = 470;
      const R = 300;
      const a0 = (-140 * Math.PI) / 180;
      const a1 = (-40 * Math.PI) / 180;
      const redFrom = (-58 * Math.PI) / 180;

      // red zone
      g.beginPath();
      g.arc(px, py, R - 27, redFrom, a1);
      g.strokeStyle = '#c9402e';
      g.lineWidth = 11;
      g.stroke();

      // ticks
      for (let i = 0; i <= 20; i++) {
        const a = a0 + (a1 - a0) * (i / 20);
        const major = i % 5 === 0;
        const r1 = R - (major ? 48 : 36);
        const r2 = R - 22;
        g.beginPath();
        g.moveTo(px + Math.cos(a) * r1, py + Math.sin(a) * r1);
        g.lineTo(px + Math.cos(a) * r2, py + Math.sin(a) * r2);
        g.strokeStyle = a >= redFrom ? '#c9402e' : '#25365e';
        g.lineWidth = major ? 5 : 2.5;
        g.stroke();
      }

      g.fillStyle = '#25365e';
      g.textAlign = 'center';
      g.font = '700 34px sans-serif';
      g.fillText('VU', 256, 330);
      g.font = '700 16px sans-serif';
      g.fillText('SIGNAL', 256, 354);

      // pivot cap
      g.beginPath();
      g.arc(px, py, 16, 0, Math.PI * 2);
      g.fillStyle = '#2b3040';
      g.fill();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private buildKnobs(): void {
    // two big tuning knobs on one mini panel, floating bottom-left
    const big = new THREE.Group();
    big.position.set(-7.8, -1.8, -5);
    big.rotation.y = 0.3;
    const bigBack = Stage.backplate(new THREE.BoxGeometry(5.6, 3.6, 0.5));
    bigBack.position.z = -0.35;
    big.add(bigBack);
    for (const [i, x] of [-1.7, 1.7].entries()) {
      const base = new THREE.Group();
      base.position.set(x, 0, 0);
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(1.3, 1.42, 0.55, 28),
        stdMat('#2b3040', 0.45, 0.5),
      );
      body.rotation.x = Math.PI / 2;
      base.add(body);
      const spinner = new THREE.Group();
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.0, 0.12), stdMat('#f3ecd9', 0.5, 0.05));
      mark.position.set(0, 0.62, 0.34);
      spinner.add(mark);
      spinner.rotation.z = i === 0 ? 0.7 : -1.1;
      base.add(spinner);
      this.knobSpinners.push(spinner);
      big.add(base);
    }
    this.scene.add(big);
    this.float(big, 0.25, 0.05, 0.55);

    // four small static knobs on a strip, top-left
    const small = new THREE.Group();
    small.position.set(-10, 6.6, -7.5);
    small.rotation.y = 0.4;
    const smallBack = Stage.backplate(new THREE.BoxGeometry(7.4, 2.2, 0.4));
    smallBack.position.z = -0.28;
    small.add(smallBack);
    for (let i = 0; i < 4; i++) {
      const k = new THREE.Group();
      k.position.set(-2.85 + i * 1.9, 0, 0);
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.66, 0.74, 0.42, 20),
        stdMat('#2b3040', 0.45, 0.5),
      );
      body.rotation.x = Math.PI / 2;
      k.add(body);
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.1), stdMat('#f3ecd9', 0.5, 0.05));
      mark.position.set(Math.sin(i * 2.1) * 0.3, Math.cos(i * 2.1) * 0.3, 0.26);
      k.add(mark);
      small.add(k);
    }
    this.scene.add(small);
    this.float(small, 0.3, 0.05, 0.48);
  }

  private buildKeypad(): void {
    const pad = new THREE.Group();
    pad.position.set(11, 0.3, -7);
    pad.rotation.y = -0.5;
    pad.rotation.x = -0.12;
    const back = Stage.backplate(new THREE.BoxGeometry(6.6, 6.6, 0.5));
    back.position.z = -0.3;
    pad.add(back);
    pad.add(new THREE.Mesh(new THREE.BoxGeometry(6.0, 6.0, 0.4), stdMat('#2b3040', 0.5, 0.4)));
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const key = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 0.5), stdMat('#f3ecd9', 0.5, 0.05));
        key.position.set(-1.8 + c * 1.8, 1.8 - r * 1.8, 0.42);
        pad.add(key);
      }
    }
    this.scene.add(pad);
    this.float(pad, 0.28, 0.04, 0.4);
  }

  private buildSlider(): void {
    const fader = new THREE.Group();
    fader.position.set(2.2, -3.6, -5.5);
    fader.rotation.x = -0.3;
    fader.rotation.y = 0.12;
    const back = Stage.backplate(new THREE.BoxGeometry(8.4, 2.7, 0.4));
    back.position.z = -0.25;
    fader.add(back);
    fader.add(new THREE.Mesh(new THREE.BoxGeometry(7.6, 1.9, 0.3), stdMat('#2b3040', 0.5, 0.4)));
    const slot = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.18, 0.1), stdMat('#10141f', 0.8, 0.2));
    slot.position.z = 0.2;
    fader.add(slot);
    this.sliderHandle = new THREE.Group();
    const grip = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.5, 0.6), stdMat('#f3ecd9', 0.5, 0.05));
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.18, 0.62), stdMat('#c9402e', 0.4, 0.1));
    this.sliderHandle.add(grip, stripe);
    this.sliderHandle.position.z = 0.35;
    fader.add(this.sliderHandle);
    this.scene.add(fader);
    this.float(fader, 0.22, 0.03, 0.6);
  }

  private buildLamps(): void {
    // three indicator lamps on one strip, glowing in the bottom-right dark
    const strip = new THREE.Group();
    strip.position.set(11.5, -4.2, -8.5);
    strip.rotation.y = -0.4;
    const back = Stage.backplate(new THREE.BoxGeometry(5.6, 1.8, 0.35));
    back.position.z = -0.22;
    strip.add(back);
    const mk = (x: number, color: string): THREE.MeshStandardMaterial => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.1, 10, 24), stdMat('#8f8672', 0.35, 0.75));
      ring.position.x = x;
      strip.add(ring);
      const mat = new THREE.MeshStandardMaterial({
        color: '#2b3040',
        roughness: 0.3,
        metalness: 0.1,
        emissive: color,
        emissiveIntensity: 0.5,
      });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), mat);
      bulb.position.set(x, 0, 0.1);
      strip.add(bulb);
      return mat;
    };
    this.lampPower = mk(-1.7, '#e8a33d');
    this.lampRed = mk(0, '#e0492f');
    this.lampBlue = mk(1.7, '#3d6fb4');
    this.scene.add(strip);
    this.float(strip, 0.32, 0.04, 0.45);
  }

  private buildGrille(): void {
    const vent = new THREE.Group();
    vent.position.set(-12.8, -4, -8.5);
    vent.rotation.y = 0.5;
    const back = Stage.backplate(new THREE.BoxGeometry(6.6, 3.4, 0.35));
    back.position.z = -0.2;
    vent.add(back);
    vent.add(new THREE.Mesh(new THREE.BoxGeometry(6.0, 2.8, 0.25), stdMat('#17100b', 0.8, 0.1)));
    for (let i = 0; i < 10; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.3, 0.3), stdMat('#4a3b2a', 0.6, 0.3));
      slat.position.set(-2.48 + i * 0.55, 0, 0.15);
      vent.add(slat);
    }
    this.scene.add(vent);
    this.float(vent, 0.26, 0.05, 0.5);
  }

  /** Drooping cables linking the floating modules — the deconstructed
   *  console still reads as one device. Endpoints stay buried inside the
   *  modules' backplates, so the slow bob never visibly detaches them. */
  private buildCables(): void {
    const mat = stdMat('#4f4438', 0.7, 0.3);
    const link = (a: [number, number, number], b: [number, number, number], sag: number): void => {
      const pa = new THREE.Vector3(...a);
      const pb = new THREE.Vector3(...b);
      const mid = pa.clone().add(pb).multiplyScalar(0.5);
      mid.y -= sag;
      mid.z -= 0.5;
      const curve = new THREE.CatmullRomCurve3([pa, mid, pb]);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.07, 6), mat);
      this.scene.add(tube);
    };
    link([-11.5, 3.2, -8], [-10, 6.6, -7.5], 1.0); // scope → small knobs
    link([-11.5, 3.2, -8], [-7.8, -1.8, -5], 1.5); // scope → big knobs
    link([-7.8, -1.8, -5], [2.2, -3.6, -5.5], 1.2); // big knobs → fader
    link([11, 0.3, -7], [10.5, 6.5, -12], 1.5); // keypad → VU
    link([11, 0.3, -7], [11.5, -4.2, -8.5], 1.0); // keypad → lamps
    link([-10, 6.6, -7.5], [10.5, 6.5, -12], 2.5); // long drape across the top
    link([-12.8, -4, -8.5], [-11.5, 3.2, -8], 1.0); // grille → scope
  }

  // ---- frame loop ----------------------------------------------------------

  private tick = (): void => {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    // palette + camera easing
    const ease = 1 - Math.pow(0.001, dt); // ~frame-rate independent lerp
    this.lightColor.lerp(this.targetLight, ease * 0.6);
    this.bgColor.lerp(this.targetBg, ease * 0.6);
    this.screenColor.lerp(this.targetScreen, ease * 0.6);
    this.camBase.lerp(this.camTarget, ease * 0.35);
    this.lookCurrent.lerp(this.lookTarget, ease * 0.35);

    this.moodLight.color.copy(this.lightColor);
    this.traceMatA.color.copy(this.screenColor);
    this.traceMatB.color.copy(this.screenColor);
    this.glowMat.color.copy(this.screenColor);

    // flash + shake decay
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.shake = Math.max(0, this.shake - dt * 1.1);
    if (this.flash > 0) {
      this.scene.background = this.bgColor.clone().lerp(this.flashColor, this.flash * 0.45);
    } else {
      this.scene.background = this.bgColor;
    }
    if (this.scene.fog) this.scene.fog.color.copy(this.scene.background as THREE.Color);
    this.moodLight.intensity = 90 + this.flash * 160;

    // pointer parallax + alert bob + shake
    const px = this.pointer.x * 0.9;
    const py = this.pointer.y * 0.5;
    const alertBob = this.mood.alert ? Math.sin(t * 2.6) * 0.18 : 0;
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.5 : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.5 : 0;
    this.camera.position.set(this.camBase.x + px + sx, this.camBase.y + py + alertBob + sy, this.camBase.z);
    this.camera.lookAt(this.lookCurrent);

    // activity energy
    this.energyTarget = Math.max(0.18, this.energyTarget - dt * 0.5);
    this.energy += (this.energyTarget - this.energy) * ease;
    for (let i = 0; i < 3; i++) this.slotBoost[i] = Math.max(0, this.slotBoost[i] - dt * 1.4);

    // scope trace A: classic sweep, clipped to the round tube
    const attrA = this.traceA.geometry.getAttribute('position') as THREE.BufferAttribute;
    const amp = 0.7 + this.energy * 1.9 + this.slotBoost[0] * 0.7;
    for (let p = 0; p < SCOPE_POINTS; p++) {
      const x = -3.7 + (7.4 * p) / (SCOPE_POINTS - 1);
      let y = amp * (Math.sin(x * 1.9 + t * 3.1) + 0.35 * Math.sin(x * 4.3 - t * 5.2)) * 0.5;
      const lim = Math.sqrt(Math.max(0.01, 3.85 * 3.85 - x * x));
      y = Math.max(-lim, Math.min(lim, y));
      attrA.setXYZ(p, x, y, 0);
    }
    attrA.needsUpdate = true;

    // scope trace B: drifting Lissajous figure (the box's infinity loop)
    const attrB = this.traceB.geometry.getAttribute('position') as THREE.BufferAttribute;
    const drift = t * (0.55 + this.energy * 0.8);
    const scale = 0.5 + this.energy * 0.55 + this.slotBoost[1] * 0.2;
    for (let p = 0; p < SCOPE_POINTS; p++) {
      const u = (p / (SCOPE_POINTS - 1)) * Math.PI * 2;
      attrB.setXYZ(
        p,
        3.3 * scale * Math.sin(u + drift),
        1.75 * scale * Math.sin(2 * u),
        0,
      );
    }
    attrB.needsUpdate = true;

    // VU needle follows energy (dial sweep is -140°..-40°, i.e. rz ±0.87)
    const boost = (this.slotBoost[0] + this.slotBoost[1] + this.slotBoost[2]) / 3;
    const v = Math.min(
      1,
      this.energy * 1.05 + boost * 0.3 + Math.sin(t * 6.7) * 0.03 * (0.3 + this.energy),
    );
    const targetRot = 0.87 - v * 1.74;
    this.needle.rotation.z += (targetRot - this.needle.rotation.z) * ease * 0.8;

    // fader rides the same energy
    const targetX = -3.1 + Math.min(1, this.energy) * 6.2;
    this.sliderHandle.position.x += (targetX - this.sliderHandle.position.x) * ease * 0.5;

    // lamps: power breathes, red blinks on alert, blue is the steady "on air"
    this.lampPower.emissiveIntensity = 0.9 + Math.sin(t * 2) * 0.15 + this.flash;
    this.lampRed.emissiveIntensity = this.mood.alert
      ? (Math.sin(t * 6) > 0 ? 2.4 : 0.1)
      : 0.35 + this.flash;
    this.lampBlue.emissiveIntensity = 1.1 + this.flash * 1.5;

    // knobs slowly tune
    for (let i = 0; i < this.knobSpinners.length; i++) {
      this.knobSpinners[i].rotation.z += dt * 0.12 * (i % 2 === 0 ? 1 : -1);
    }

    // modules drift: slow bob + gentle yaw sway
    for (const m of this.modules) {
      m.g.position.y = m.y0 + Math.sin(t * m.sp + m.ph) * m.bob;
      m.g.rotation.y = m.ry0 + Math.sin(t * m.sp * 0.7 + m.ph) * m.sway;
    }

    // phosphor glow pulse
    this.glowMat.opacity =
      0.05 + this.flash * 0.25 + (this.mood.alert ? 0.04 + Math.sin(t * 5) * 0.03 : 0);

    // dust drift
    this.dust.rotation.y = t * 0.02;
    this.dust.position.y = Math.sin(t * 0.4) * 0.4;

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
