// three.js stage — the render driver for the whole frontend.
//
// The Listening Room: you sit at a monitoring desk in a dark navy signals
// room. The camera is FIXED — every screen in the room carries real UI:
// the big central CRT holds the game (the DOM overlay is pixel-locked onto
// it via projected CSS variables), a smaller CRT shows the round archive,
// four desk displays show your code words, the VU meter is the phase
// countdown, and a wall strip of lamps is the score. Tape reels, a scope,
// headphones, posters and cables complete the post. Game phases relight
// the room; results flash it.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ScreenPainter } from './ui3d/painter';

export type Mood = 'idle' | 'lobby' | 'encrypt' | 'intercept' | 'decrypt' | 'result';

export type PickKind = 'click' | 'hover' | 'leave' | 'outside';

export interface ScoreLike {
  interceptions: number;
  decrypt_failures: number;
}

/** Public stage API — also implemented by NullStage (no-WebGL fallback). */
export interface StageAPI {
  setMood(mood: Mood): void;
  pulse(kind: 'ok' | 'fail' | 'info'): void;
  activity(level: number, slot?: number): void;
  /** Your team's 4 code words on the desk displays (null clears, e.g. lobby). */
  setCodebook(words: string[] | null): void;
  /** Score lamp strip: per team, interceptions won + decrypt failures. */
  setScore(a: ScoreLike, b: ScoreLike): void;
  /** Phase countdown mirrored on the VU meter (null parks the needle). */
  setCountdown(seconds: number | null, deadline?: number): void;
  /** Power the instruments up (match running) or down (menu/lobby standby). */
  setPowered(on: boolean): void;
  /** Sink a random desk-keyboard key — mirrors real DOM typing. */
  keyPress(): void;
  /** Fired when the desk codebook prop is clicked. */
  onCodebookClick: (() => void) | null;

  /** Main CRT canvas the UI is painted into (1536×936). */
  readonly mainPainter: ScreenPainter;
  /** Paper overlay canvas (1024×1280, portrait). */
  readonly paperPainter: ScreenPainter;
  /** Raise/lower the paper sheet in front of the camera. */
  setPaperOpen(open: boolean): void;
  /** UV picks on the main CRT (uv in 0..1, origin bottom-left). */
  onScreenPick: ((u: number, v: number, kind: PickKind) => void) | null;
  /** Project a main-screen UV point to client pixel coords (e2e/tests). */
  screenUvToClient(u: number, v: number): { x: number; y: number } | null;
  /** Project the codebook prop's center to client pixel coords (e2e/tests). */
  codebookClient(): { x: number; y: number } | null;
  /** UV picks on the paper sheet; 'outside' = click missed the sheet. */
  onPaperPick: ((u: number, v: number, kind: PickKind) => void) | null;
  /** Small readout plate under the score board (channel code / score text). */
  setStatus(line1: string, line2: string): void;
  start(): void;
  dispose(): void;
}

/** No-op fallback when WebGL is unavailable: UI keeps working, canvas stays dark. */
export class NullStage implements StageAPI {
  onCodebookClick: (() => void) | null = null;
  readonly mainPainter = new ScreenPainter(1536, 936);
  readonly paperPainter = new ScreenPainter(1024, 1280);
  onScreenPick: ((u: number, v: number, kind: PickKind) => void) | null = null;
  onPaperPick: ((u: number, v: number, kind: PickKind) => void) | null = null;
  screenUvToClient(): { x: number; y: number } | null {
    return null;
  }
  codebookClient(): { x: number; y: number } | null {
    return null;
  }
  setMood(): void {}
  pulse(): void {}
  activity(): void {}
  setCodebook(): void {}
  setScore(): void {}
  setCountdown(): void {}
  setPowered(): void {}
  keyPress(): void {}
  setPaperOpen(): void {}
  setStatus(): void {}
  start(): void {}
  dispose(): void {}
}

interface MoodSpec {
  light: THREE.Color; // room glow
  bg: THREE.Color;
  screen: THREE.Color; // screen phosphor / spill
  alert: boolean;
}

const MOODS: Record<Mood, MoodSpec> = {
  idle: {
    light: new THREE.Color('#c9bd9e'),
    bg: new THREE.Color('#0d1424'),
    screen: new THREE.Color('#ffb45e'),
    alert: false,
  },
  lobby: {
    light: new THREE.Color('#c9bd9e'),
    bg: new THREE.Color('#0d1526'),
    screen: new THREE.Color('#ffb45e'),
    alert: false,
  },
  encrypt: {
    light: new THREE.Color('#e8a33d'),
    bg: new THREE.Color('#151021'),
    screen: new THREE.Color('#ffb45e'),
    alert: false,
  },
  intercept: {
    light: new THREE.Color('#e0492f'),
    bg: new THREE.Color('#190c10'),
    screen: new THREE.Color('#ff4a3c'),
    alert: true,
  },
  decrypt: {
    light: new THREE.Color('#efe3c0'),
    bg: new THREE.Color('#101527'),
    screen: new THREE.Color('#ffd9a0'),
    alert: false,
  },
  result: {
    light: new THREE.Color('#93a7d8'),
    bg: new THREE.Color('#0e1526'),
    screen: new THREE.Color('#ffb45e'),
    alert: false,
  },
};

const SCOPE_POINTS = 140;

const stdMat = (color: string, roughness = 0.6, metalness = 0.2): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

let enamelRough: THREE.CanvasTexture | null = null;
/** Cream enamel housing material: subtle noise roughness so large shells
 *  don't read as flat cardboard under the key light. */
const enamelMat = (): THREE.MeshStandardMaterial => {
  if (!enamelRough) {
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 256;
    const g = cv.getContext('2d');
    if (g) {
      g.fillStyle = '#9a9a9a';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 2600; i++) {
        const v = 120 + ((Math.random() * 90) | 0);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
      }
    }
    enamelRough = new THREE.CanvasTexture(cv);
    enamelRough.wrapS = THREE.RepeatWrapping;
    enamelRough.wrapT = THREE.RepeatWrapping;
  }
  return new THREE.MeshStandardMaterial({
    color: '#dcd4bf',
    roughness: 0.85,
    metalness: 0.08,
    roughnessMap: enamelRough,
  });
};

function canvasTexture(
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  if (g) draw(g);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Stage implements StageAPI {
  private renderer: THREE.WebGLRenderer;
  private composer!: EffectComposer;
  private bloom!: UnrealBloomPass;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();

  // Retint targets: lerped every frame, then copied into lights/materials
  // (three.js materials copy constructor colors — sharing would NOT retint).
  private lightColor = new THREE.Color('#c9bd9e');
  private targetLight = new THREE.Color('#c9bd9e');
  private bgColor = new THREE.Color('#0d1424');
  private targetBg = new THREE.Color('#0d1424');
  private screenColor = new THREE.Color('#ffb45e');
  private targetScreen = new THREE.Color('#ffb45e');

  private mood: MoodSpec = MOODS.idle;
  private flash = 0;
  private flashColor = new THREE.Color('#ffffff');
  private energy = 0.18;
  private energyTarget = 0.18;
  private slotBoost = [0, 0, 0];
  private powered = false;
  private powerBlend = 0; // 0 = standby dark, 1 = fully lit (lerped)
  private reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  onCodebookClick: (() => void) | null = null;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private codebookGrp: THREE.Group | null = null;
  private codebookHover = 0;
  private keyMeshes: THREE.Mesh[] = [];
  private keySink: number[] = [];
  private kbdKeyMat!: THREE.MeshStandardMaterial;
  private wordPlateMats: THREE.MeshBasicMaterial[] = [];
  private scoreLevels: number[] = new Array(8).fill(0);
  private minuteHand!: THREE.Mesh;
  private hourHand!: THREE.Mesh;

  private moodLight!: THREE.PointLight;
  private spillLight!: THREE.PointLight;
  private traceA!: THREE.Line;
  private traceB!: THREE.Line;
  private traceMatA!: THREE.LineBasicMaterial;
  private traceMatB!: THREE.LineBasicMaterial;
  private glowMats: THREE.MeshBasicMaterial[] = [];
  private needle!: THREE.Group;
  private reels: THREE.Group[] = [];
  private secondHand!: THREE.Mesh;
  private lampPower!: THREE.MeshStandardMaterial;
  private lampRed!: THREE.MeshStandardMaterial;
  private scoreLamps: THREE.MeshStandardMaterial[] = []; // A int×2, A fail×2, B int×2, B fail×2
  private wordTextures: { tex: THREE.CanvasTexture; cv: HTMLCanvasElement }[] = [];
  private sideScreenTex: { tex: THREE.CanvasTexture; cv: HTMLCanvasElement; redraw?: (t: number) => void } | null = null;
  private countdownTotal: number | null = null;
  private countdownDeadline = 0;
  private screenMeshes: Record<string, THREE.Mesh> = {};
  private dust!: THREE.Points;

  // canvas-UI plumbing
  readonly mainPainter = new ScreenPainter(1536, 936);
  readonly paperPainter = new ScreenPainter(1024, 1280);
  onScreenPick: ((u: number, v: number, kind: PickKind) => void) | null = null;
  onPaperPick: ((u: number, v: number, kind: PickKind) => void) | null = null;
  private mainGlass: THREE.Mesh | null = null;
  private paperGrp: THREE.Group | null = null;
  private paperMesh: THREE.Mesh | null = null;
  private paperOpen = false;
  private paperT = 0; // 0 closed .. 1 fully raised
  private statusTex: { tex: THREE.CanvasTexture; cv: HTMLCanvasElement } | null = null;
  private zoomed = false;
  private camPosTarget = new THREE.Vector3(0, 3.9, 4.3);
  private camLookTarget = new THREE.Vector3(0, 3.0, -12);
  private camLookCur = new THREE.Vector3(0, 3.0, -12);

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
    // shadows are what ground the props — without them everything is cardboard
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Fixed camera: you are seated at the desk. Nothing moves the camera;
    // the room stays alive through its contents (reels, scope, lamps, VU).
    // 46° vFOV + a closer seat make the main CRT the dominant surface
    // (~55-60% of the viewport) while keeping the desk props in frame.
    this.camera = new THREE.PerspectiveCamera(
      46,
      window.innerWidth / window.innerHeight,
      0.1,
      200,
    );
    this.camera.position.set(0, 3.9, 4.3);
    this.camera.lookAt(0, 3.0, -12);

    this.scene.background = this.bgColor;
    this.scene.fog = new THREE.Fog(this.bgColor.getHex(), 18, 55);

    this.scene.add(new THREE.HemisphereLight(0x33415f, 0x3a2f22, 0.5));
    const key = new THREE.DirectionalLight(0xffe9c4, 1.7);
    key.position.set(5, 12, 6);
    key.target.position.set(0, 2, -8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -16;
    key.shadow.camera.right = 16;
    key.shadow.camera.top = 14;
    key.shadow.camera.bottom = -8;
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 35;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    this.scene.add(key, key.target);
    this.moodLight = new THREE.PointLight(this.lightColor.getHex(), 70, 50, 1.8);
    this.moodLight.position.set(0, 7, -2);
    this.scene.add(this.moodLight);
    // phosphor spill from the main screen onto the desk
    this.spillLight = new THREE.PointLight(this.screenColor.getHex(), 14, 16, 2);
    this.spillLight.position.set(-1, 4.0, -7.8);
    this.scene.add(this.spillLight);

    this.buildRoom();
    this.buildScreens();
    this.buildDeskProps();
    this.buildCodebook();
    this.buildDust();
    this.buildPaperSheet();
    this.buildStatusPlate();

    // main CRT glass carries the canvas-painted UI
    this.mainGlass = this.screenMeshes.main;
    const glassMat = this.mainGlass.material as THREE.MeshBasicMaterial;
    glassMat.map = this.mainPainter.tex;
    glassMat.color.set('#ffffff');
    glassMat.needsUpdate = true;

    // picking: codebook prop + screen UV + paper sheet
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('click', this.onCanvasClick);

    // shadows: opaque props cast, everything receives (glow/glass panes are
    // transparent and skip casting so they can't smear the desk)
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mat = obj.material as THREE.Material;
        obj.castShadow = !mat.transparent;
        obj.receiveShadow = true;
      }
    });

    // bloom: phosphor, lamps and traces actually glow
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.4, // strength
      0.5, // radius
      0.82, // threshold — only hot emitters bloom
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', this.onResize);
    // initial camera mode (zoomed on narrow windows)
    this.updateZoom();
  }

  // ---- public controls -----------------------------------------------------

  setMood(mood: Mood): void {
    this.mood = MOODS[mood];
    this.targetLight.copy(this.mood.light);
    this.targetBg.copy(this.mood.bg);
    this.targetScreen.copy(this.mood.screen);
  }

  /** Room flash + needle kick for round results. */
  pulse(kind: 'ok' | 'fail' | 'info'): void {
    this.flash = 1;
    this.flashColor.set(kind === 'ok' ? '#e8c15a' : kind === 'fail' ? '#e0492f' : '#93a7d8');
    this.energyTarget = 1;
  }

  /** Live player activity (0..1) — drives the desk scope and reels speed. */
  activity(level: number, slot?: number): void {
    this.energyTarget = Math.max(this.energyTarget, 0.2 + level * 0.75);
    if (slot !== undefined && slot >= 1 && slot <= 3) this.slotBoost[slot - 1] = 1;
  }

  setCodebook(words: string[] | null): void {
    this.wordTextures.forEach(({ tex, cv }, i) => {
      const g = cv.getContext('2d');
      if (!g) return;
      const w = words?.[i] ?? null;
      g.fillStyle = '#160a05';
      g.fillRect(0, 0, cv.width, cv.height);
      g.strokeStyle = 'rgba(255,180,94,0.25)';
      g.lineWidth = 4;
      g.strokeRect(4, 4, cv.width - 8, cv.height - 8);
      g.textAlign = 'center';
      if (w) {
        g.fillStyle = '#ffb45e';
        g.font = '700 34px "SF Mono", ui-monospace, monospace';
        g.fillText(String(i + 1), 34, 48);
        g.font = '600 40px "PingFang SC", "Microsoft YaHei", sans-serif';
        // shrink long words to fit the plate
        const maxW = cv.width - 90;
        let size = 40;
        while (size > 18 && g.measureText(w).width > maxW) {
          size -= 2;
          g.font = `600 ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
        }
        g.fillText(w, cv.width / 2 + 14, cv.height / 2 + size * 0.35);
      } else {
        // standby: a dark dormant plate, no giant fake digits
        g.fillStyle = 'rgba(255,180,94,0.18)';
        g.font = '400 22px "PingFang SC", sans-serif';
        g.fillText('待 命', cv.width / 2, cv.height / 2 + 4);
        g.fillStyle = 'rgba(255,180,94,0.3)';
        g.font = '700 18px "SF Mono", ui-monospace, monospace';
        g.fillText(`0${i + 1}`, cv.width / 2, cv.height / 2 + 34);
      }
      tex.needsUpdate = true;
    });
  }

  setScore(a: ScoreLike, b: ScoreLike): void {
    this.scoreLevels = [
      ...[...Array(2)].map((_, i) => (a.interceptions > i ? 1 : 0)),
      ...[...Array(2)].map((_, i) => (a.decrypt_failures > i ? 1 : 0)),
      ...[...Array(2)].map((_, i) => (b.interceptions > i ? 1 : 0)),
      ...[...Array(2)].map((_, i) => (b.decrypt_failures > i ? 1 : 0)),
    ];
  }

  /** Menu/lobby = standby: instruments dark. Match = powered on. */
  setPowered(on: boolean): void {
    this.powered = on;
  }

  /** Sink a random keyboard key — called when the player types in the DOM. */
  keyPress(): void {
    if (this.keyMeshes.length === 0) return;
    const i = (Math.random() * this.keyMeshes.length) | 0;
    this.keySink[i] = 1;
  }

  setCountdown(seconds: number | null, deadline?: number): void {
    this.countdownTotal = seconds;
    this.countdownDeadline = deadline ?? 0;
  }

  start(): void {
    this.renderer.setAnimationLoop(this.tick);
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.removeEventListener('click', this.onCanvasClick);
    this.renderer.dispose();
  }

  // ---- DOM screen mounting -------------------------------------------------

  // ---- camera zoom (narrow windows) ----------------------------------------

  /** Projected pixel width of the main CRT glass at the current camera. */
  private mainScreenWidth(): number {
    const mesh = this.screenMeshes.main;
    if (!mesh) return Infinity;
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    mesh.updateMatrixWorld();
    const hw = mesh.userData.w / 2;
    const tl = new THREE.Vector3(-hw, 0, 0).applyMatrix4(mesh.matrixWorld).project(this.camera);
    const br = new THREE.Vector3(hw, 0, 0).applyMatrix4(mesh.matrixWorld).project(this.camera);
    return ((br.x - tl.x) * 0.5) * window.innerWidth;
  }

  /** Narrow window → dolly the camera onto the main CRT so the canvas UI
   *  stays readable; wide window → back to the seated desk pose. */
  private updateZoom(): void {
    const wasZoomed = this.zoomed;
    this.zoomed = this.mainScreenWidth() < 720;
    if (this.zoomed === wasZoomed && wasZoomed) return;
    if (this.zoomed) {
      const mesh = this.screenMeshes.main;
      const center = new THREE.Vector3();
      mesh.getWorldPosition(center);
      const normal = new THREE.Vector3(0, 0, 1)
        .applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()))
        .normalize();
      const halfW = mesh.userData.w / 2 + 0.7;
      const d = THREE.MathUtils.clamp(
        halfW / (Math.tan(THREE.MathUtils.degToRad(23)) * this.camera.aspect),
        9,
        30,
      );
      this.camPosTarget.copy(center).addScaledVector(normal, d);
      this.camLookTarget.copy(center);
    } else {
      this.camPosTarget.set(0, 3.9, 4.3);
      this.camLookTarget.set(0, 3.0, -12);
    }
  }

  /** Project a point on the main CRT glass (uv, origin bottom-left) to
   *  client pixel coordinates — used by the e2e to send real mouse events. */
  screenUvToClient(u: number, v: number): { x: number; y: number } | null {
    const mesh = this.screenMeshes.main;
    if (!mesh) return null;
    mesh.updateMatrixWorld();
    this.camera.updateMatrixWorld(true);
    const local = new THREE.Vector3(
      (u - 0.5) * mesh.userData.w,
      (v - 0.5) * mesh.userData.h,
      0,
    );
    const ndc = local.applyMatrix4(mesh.matrixWorld).project(this.camera);
    return {
      x: (ndc.x * 0.5 + 0.5) * window.innerWidth,
      y: (-ndc.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  /** Project the desk codebook's center to client pixels (e2e/tests). */
  codebookClient(): { x: number; y: number } | null {
    if (!this.codebookGrp) return null;
    const p = new THREE.Vector3();
    this.codebookGrp.getWorldPosition(p);
    this.camera.updateMatrixWorld(true);
    const ndc = p.project(this.camera);
    return {
      x: (ndc.x * 0.5 + 0.5) * window.innerWidth,
      y: (-ndc.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  // ---- paper sheet (codebook archive / field manual) ------------------------

  private buildPaperSheet(): void {
    const grp = new THREE.Group();
    const back = new THREE.Mesh(
      new RoundedBoxGeometry(3.5, 4.45, 0.08, 2, 0.03),
      stdMat('#d4c4a8', 0.9, 0.05),
    );
    back.position.z = -0.05;
    grp.add(back);
    const paperMat = new THREE.MeshBasicMaterial({
      map: this.paperPainter.tex,
      transparent: true,
    });
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4.25), paperMat);
    grp.add(paper);
    grp.visible = false;
    this.paperGrp = grp;
    this.paperMesh = paper;
    this.scene.add(grp);
  }

  setPaperOpen(open: boolean): void {
    this.paperOpen = open;
    if (open) {
      // float the sheet in front of the camera, wherever it currently sits
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this.paperGrp?.position.copy(this.camera.position).addScaledVector(dir, 5.6);
      this.paperGrp?.lookAt(this.camera.position);
      if (this.paperGrp) this.paperGrp.visible = true;
    }
  }

  /** Small readout plate under the score board: channel code + score text. */
  private buildStatusPlate(): void {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 96;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.statusTex = { tex, cv };
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 0.6),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
    );
    plate.position.set(6.6, 6.82, -10.19);
    plate.rotation.y = -0.08;
    this.scene.add(plate);
    this.setStatus('', '');
  }

  setStatus(line1: string, line2: string): void {
    if (!this.statusTex) return;
    const g = this.statusTex.cv.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, 512, 96);
    if (!line1 && !line2) {
      this.statusTex.tex.needsUpdate = true;
      return;
    }
    g.fillStyle = 'rgba(22, 10, 5, 0.85)';
    g.fillRect(0, 0, 512, 96);
    g.strokeStyle = 'rgba(255,180,94,0.35)';
    g.lineWidth = 3;
    g.strokeRect(3, 3, 506, 90);
    g.textAlign = 'center';
    if (line1) {
      g.fillStyle = '#ffb45e';
      g.font = '700 34px "SF Mono", ui-monospace, monospace';
      g.fillText(line1, 256, line2 ? 42 : 60);
    }
    if (line2) {
      g.fillStyle = 'rgba(243,230,207,0.85)';
      g.font = '400 24px "PingFang SC", sans-serif';
      g.fillText(line2, 256, line1 ? 78 : 60);
    }
    this.statusTex.tex.needsUpdate = true;
  }

  // ---- scene construction --------------------------------------------------

  private buildRoom(): void {
    // back wall + floor + desk
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(44, 18), stdMat('#141a2e', 0.9, 0.05));
    wall.position.set(0, 5, -14);
    this.scene.add(wall);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(44, 30), stdMat('#0b0e1a', 0.85, 0.1));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -2.2, -4);
    this.scene.add(floor);

    // desk slab: dark walnut with canvas-drawn grain
    const woodTex = canvasTexture(512, 512, (g) => {
      g.fillStyle = '#2e2119';
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 90; i++) {
        const y = Math.random() * 512;
        const r = 18 + (Math.random() * 26) | 0;
        const gg = 12 + (Math.random() * 18) | 0;
        const b = 8 + (Math.random() * 10) | 0;
        g.strokeStyle = `rgba(${r},${gg},${b},${0.25 + Math.random() * 0.3})`;
        g.lineWidth = 1 + Math.random() * 3;
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 3);
        g.stroke();
      }
      for (let x = 0; x < 512; x += 128) {
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, 512);
        g.stroke();
      }
    });
    woodTex.wrapS = THREE.RepeatWrapping;
    woodTex.wrapT = THREE.RepeatWrapping;
    woodTex.repeat.set(3, 1);
    const desk = new THREE.Mesh(
      new THREE.BoxGeometry(26, 0.5, 9),
      new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.5, metalness: 0.1 }),
    );
    desk.position.set(0, 0.05, -7.2);
    this.scene.add(desk);
    const deskFront = new THREE.Mesh(new THREE.BoxGeometry(26, 2.2, 0.4), stdMat('#241a13', 0.6, 0.1));
    deskFront.position.set(0, -1.25, -3.0);
    this.scene.add(deskFront);

    // wainscot rail + skirting give the wall structure
    const rail = new THREE.Mesh(new THREE.BoxGeometry(44, 0.28, 0.16), stdMat('#1c2338', 0.8, 0.1));
    rail.position.set(0, 3.0, -13.9);
    this.scene.add(rail);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(44, 0.5, 0.2), stdMat('#171d30', 0.8, 0.1));
    skirt.position.set(0, -1.95, -13.9);
    this.scene.add(skirt);

    // acoustic foam tiles on the upper wall (canvas texture)
    const foamTex = canvasTexture(512, 256, (g) => {
      g.fillStyle = '#101527';
      g.fillRect(0, 0, 512, 256);
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 16; x++) {
          const odd = (x + y) % 2 === 0;
          g.fillStyle = odd ? '#182036' : '#131a2e';
          g.fillRect(x * 32 + 2, y * 32 + 2, 28, 28);
          g.fillStyle = 'rgba(255,255,255,0.03)';
          g.fillRect(x * 32 + 2, y * 32 + 2, 28, 6);
        }
      }
    });
    foamTex.wrapS = THREE.RepeatWrapping;
    foamTex.repeat.set(2, 1);
    const foam = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 7),
      new THREE.MeshStandardMaterial({ map: foamTex, roughness: 0.95 }),
    );
    foam.position.set(-2, 7.6, -13.9);
    this.scene.add(foam);

    // posters: ribbon logo + top-secret stamp
    const posterTex = canvasTexture(512, 640, (g) => {
      g.fillStyle = '#e9e1cc';
      g.fillRect(0, 0, 512, 640);
      g.strokeStyle = '#25365e';
      g.lineWidth = 10;
      g.strokeRect(18, 18, 476, 604);
      g.save();
      g.translate(256, 240);
      g.rotate(-0.05);
      g.fillStyle = '#25365e';
      g.fillRect(-190, -70, 380, 140);
      g.strokeStyle = '#c9402e';
      g.lineWidth = 6;
      g.strokeRect(-190, -70, 380, 140);
      g.fillStyle = '#f3ecd9';
      g.font = '800 64px "PingFang SC", sans-serif';
      g.textAlign = 'center';
      g.fillText('谍报风云', 0, 24);
      g.font = '700 30px monospace';
      g.fillText('D E C R Y P T O', 0, 62);
      g.restore();
      g.fillStyle = '#25365e';
      g.font = '600 26px "PingFang SC", sans-serif';
      g.textAlign = 'center';
      g.fillText('让队友听懂 · 让敌人迷路', 256, 420);
      g.save();
      g.translate(256, 520);
      g.rotate(-0.18);
      g.strokeStyle = '#c9402e';
      g.lineWidth = 5;
      g.strokeRect(-150, -40, 300, 80);
      g.fillStyle = '#c9402e';
      g.font = '800 40px monospace';
      g.fillText('TOP SECRET', 0, 14);
      g.restore();
    });
    const poster = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 2.4),
      new THREE.MeshStandardMaterial({ map: posterTex, roughness: 0.85 }),
    );
    // squeezed into the visible wall band left of the main CRT (between the
    // CRT's occlusion cone and the frame edge), under the clock
    poster.position.set(-10.6, 4.5, -13.85);
    poster.rotation.z = 0.02;
    this.scene.add(poster);

    // wall clock — all three hands driven by local time
    const clockTex = canvasTexture(256, 256, (g) => {
      g.beginPath();
      g.arc(128, 128, 120, 0, Math.PI * 2);
      g.fillStyle = '#f2e9d0';
      g.fill();
      g.lineWidth = 8;
      g.strokeStyle = '#2b3040';
      g.stroke();
      g.fillStyle = '#25365e';
      g.textAlign = 'center';
      g.font = '700 28px monospace';
      g.fillText('12', 128, 44);
      g.fillText('6', 128, 232);
      g.fillText('3', 224, 137);
      g.fillText('9', 32, 137);
    });
    const clockG = new THREE.Group();
    clockG.position.set(-10.6, 7.3, -13.8);
    clockG.scale.setScalar(0.85);
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(1.05, 40),
      new THREE.MeshBasicMaterial({ map: clockTex }),
    );
    clockG.add(face);
    this.hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.02), stdMat('#25365e', 0.5, 0.1));
    this.hourHand.geometry.translate(0, 0.18, 0);
    this.hourHand.position.z = 0.02;
    clockG.add(this.hourHand);
    this.minuteHand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.75, 0.02), stdMat('#25365e', 0.5, 0.1));
    this.minuteHand.geometry.translate(0, 0.3, 0);
    this.minuteHand.position.z = 0.025;
    clockG.add(this.minuteHand);
    this.secondHand = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.9, 0.02), stdMat('#c9402e', 0.4, 0.1));
    this.secondHand.geometry.translate(0, 0.36, 0);
    this.secondHand.position.z = 0.03;
    clockG.add(this.secondHand);
    this.scene.add(clockG);
  }

  /** The two room screens: big main CRT + smaller archive CRT. The DOM
   *  overlay is pixel-locked onto these via projectScreens(). */
  private buildScreens(): void {
    const mkScreen = (
      id: string,
      w: number,
      h: number,
      pos: [number, number, number],
      rotY: number,
    ): void => {
      const grp = new THREE.Group();
      grp.position.set(...pos);
      grp.rotation.y = rotY;

      // cream enamel housing (rounded, noise-roughened) + dark bezel
      const housing = new THREE.Mesh(
        new RoundedBoxGeometry(w + 1.0, h + 1.0, 0.9, 3, 0.12),
        enamelMat(),
      );
      housing.position.z = -0.5;
      grp.add(housing);
      const bezel = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.45, h + 0.45, 0.2),
        stdMat('#2b3040', 0.45, 0.5),
      );
      // a slim dark rim BEHIND the glass (a full-depth plate would hide it)
      bezel.position.z = -0.18;
      grp.add(bezel);
      // dark glass behind the DOM
      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: '#150a05' }),
      );
      glass.position.z = 0.01;
      grp.add(glass);
      glass.userData.w = w;
      glass.userData.h = h;
      this.screenMeshes[id] = glass;
      // phosphor halo spilling past the edges
      const glowMat = new THREE.MeshBasicMaterial({
        color: '#ffb45e',
        transparent: true,
        opacity: 0.08,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(w + 1.6, h + 1.6), glowMat);
      glow.position.z = 0.02;
      grp.add(glow);
      this.glowMats.push(glowMat);
      // housing screws
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const s = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.09, 0.06, 12),
          stdMat('#b8ae96', 0.3, 0.8),
        );
        s.rotation.x = Math.PI / 2;
        s.position.set((sx * (w + 0.7)) / 2, (sy * (h + 0.7)) / 2, -0.03);
        grp.add(s);
      }
      this.scene.add(grp);
    };

    // main CRT: center-left, slight angle toward the seat — the room's
    // dominant surface, the DOM UI is pixel-locked onto its glass
    mkScreen('main', 11.5, 7.0, [-1.1, 4.3, -9.5], 0.06);
    // archive CRT: right side. It no longer carries DOM (the paper codebook
    // owns history now), so it faces the seat almost straight and shows only
    // analog standby content — no pixel-lock projection needed.
    mkScreen('side', 3.7, 5.6, [6.6, 3.95, -10.2], -0.08);
    delete this.screenMeshes.side;

    // side screen idle content: analog standby readout with a scrolling
    // waveform and rotating field-manual tips (it no longer hosts the DOM
    // archive — history lives in the paper codebook)
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 384;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.sideScreenTex = { tex, cv };
    const TIPS = [
      '① 加密：三条线索讲给队友',
      '② 拦截：推理敌方词序',
      '③ 获胜：两次拦截到手',
      '④ 失误两次满盘皆输',
    ];
    const redraw = (t: number): void => {
      const g = cv.getContext('2d');
      if (!g) return;
      g.fillStyle = '#160a05';
      g.fillRect(0, 0, 256, 384);
      g.strokeStyle = 'rgba(255,180,94,0.35)';
      g.lineWidth = 3;
      g.strokeRect(8, 8, 240, 368);
      g.fillStyle = 'rgba(255,180,94,0.85)';
      g.font = '700 20px "PingFang SC", sans-serif';
      g.textAlign = 'center';
      g.fillText('频段扫描', 128, 48);
      g.font = '400 13px monospace';
      g.fillStyle = 'rgba(255,180,94,0.45)';
      g.fillText('SWEEP · STANDBY', 128, 74);
      // scrolling waveform to keep the tube alive
      g.strokeStyle = 'rgba(255,106,69,0.8)';
      g.lineWidth = 2;
      g.beginPath();
      for (let x = 0; x <= 220; x++) {
        const y = 180 + Math.sin(x * 0.09 + t * 2.2) * 22 * Math.sin(x * 0.021 + t * 0.6);
        if (x === 0) g.moveTo(18 + x, y);
        else g.lineTo(18 + x, y);
      }
      g.stroke();
      // rotating field-manual tip
      const tip = TIPS[Math.floor(t / 8) % TIPS.length];
      g.fillStyle = 'rgba(255,217,160,0.75)';
      g.font = '600 17px "PingFang SC", sans-serif';
      g.fillText(tip, 128, 300);
      g.fillStyle = 'rgba(255,180,94,0.4)';
      g.font = '400 12px "PingFang SC", sans-serif';
      g.fillText('—— 野战手册 ——', 128, 332);
      tex.needsUpdate = true;
    };
    redraw(0);
    this.sideScreenTex.redraw = redraw;
    const idle = new THREE.Mesh(
      new THREE.PlaneGeometry(3.7, 5.6),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    idle.position.set(6.6, 3.95, -10.2 + 0.015);
    idle.rotation.y = -0.08;
    this.scene.add(idle);

    // console strip under the main CRT — the terminal's own control deck:
    // VU countdown meter (left), nameplate (center), power/alert lamps (right)
    const deckStrip = new THREE.Group();
    deckStrip.position.set(-1.1, 0.78, -9.5);
    const stripBox = new THREE.Mesh(new RoundedBoxGeometry(10.6, 0.9, 0.9, 3, 0.1), enamelMat());
    deckStrip.add(stripBox);
    // VU meter on the strip
    const vuTex = this.vuTexture();
    const vuFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.82, 0.82),
      new THREE.MeshBasicMaterial({ map: vuTex, transparent: true }),
    );
    vuFace.position.set(-4.35, 0, 0.46);
    deckStrip.add(vuFace);
    this.needle = new THREE.Group();
    this.needle.position.set(-4.35, -0.34, 0.5);
    const pin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.48, 0.02), stdMat('#c9402e', 0.4, 0.1));
    pin.position.y = 0.24;
    this.needle.add(pin);
    const vuCap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12), stdMat('#2b3040', 0.45, 0.5));
    vuCap.rotation.x = Math.PI / 2;
    this.needle.add(vuCap);
    deckStrip.add(this.needle);
    // nameplate: brushed brass with etched lettering, auto-fit so the text
    // never clips no matter the glyph widths
    const plateTex = canvasTexture(1024, 96, (g) => {
      g.fillStyle = '#b8a06a';
      g.fillRect(0, 0, 1024, 96);
      // brushed-metal streaks
      for (let i = 0; i < 120; i++) {
        g.strokeStyle = `rgba(90,70,35,${0.04 + Math.random() * 0.08})`;
        g.lineWidth = 1;
        const y = Math.random() * 96;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(1024, y);
        g.stroke();
      }
      g.strokeStyle = '#6b5426';
      g.lineWidth = 5;
      g.strokeRect(6, 6, 1012, 84);
      const text = '监听台 · LISTENING POST K-3';
      let size = 44;
      g.textAlign = 'center';
      do {
        g.font = `700 ${size}px "PingFang SC", sans-serif`;
        size -= 2;
      } while (size > 20 && g.measureText(text).width > 940);
      // etched look: dark fill + faint highlight offset
      g.fillStyle = 'rgba(255,240,200,0.35)';
      g.fillText(text, 512, 62 + 1.5);
      g.fillStyle = '#3d2f14';
      g.fillText(text, 512, 62);
    });
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(3.0, 0.5),
      new THREE.MeshBasicMaterial({ map: plateTex }),
    );
    plate.position.set(-0.6, 0, 0.46);
    deckStrip.add(plate);
    // power + alert lamps on the strip
    const mkStripLamp = (x: number, color: string): THREE.MeshStandardMaterial => {
      const mat = new THREE.MeshStandardMaterial({
        color: '#2b3040',
        roughness: 0.3,
        emissive: color,
        emissiveIntensity: 0.5,
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.045, 8, 20), stdMat('#8f8672', 0.35, 0.75));
      ring.position.set(x, 0, 0.46);
      deckStrip.add(ring);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), mat);
      bulb.position.set(x, 0, 0.48);
      deckStrip.add(bulb);
      return mat;
    };
    this.lampPower = mkStripLamp(4.25, '#e8a33d');
    this.lampRed = mkStripLamp(4.75, '#e0492f');
    this.scene.add(deckStrip);

    // score lamp board: a grounded topper bolted onto the archive CRT's
    // housing (the main CRT grew too tall to host it, and a floating wall
    // strip clipped at common aspect ratios). Per team row: 2 interception
    // (blue) + 2 failure (red) lamps, with the legend as column headers
    // directly above each lamp group.
    const strip = new THREE.Group();
    strip.position.set(6.6, 7.6, -10.2);
    strip.rotation.y = -0.08;
    const stripBack = new THREE.Mesh(new RoundedBoxGeometry(4.2, 1.15, 0.3, 3, 0.06), enamelMat());
    stripBack.position.z = -0.1;
    strip.add(stripBack);
    // support posts down to the archive CRT housing top
    for (const px of [-1.4, 1.4]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 10), stdMat('#8f8672', 0.35, 0.75));
      post.position.set(px, -0.72, -0.1);
      strip.add(post);
    }
    // column headers above each lamp group: 拦截 over the blue pair, 失误
    // over the red pair — the legend can no longer drift half a screen away
    const mkHeader = (x: number, text: string, color: string): void => {
      const tex = canvasTexture(256, 96, (g) => {
        g.fillStyle = color;
        g.font = '700 56px "PingFang SC", sans-serif';
        g.textAlign = 'center';
        g.fillText(text, 128, 68);
      });
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(0.8, 0.3),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
      );
      plate.position.set(x, 0.42, 0.06);
      strip.add(plate);
    };
    mkHeader(-0.55, '拦截', '#25365e');
    mkHeader(0.65, '失误', '#c9402e');
    const mkLampRow = (team: 'A' | 'B', yOff: number): void => {
      const labelTex = canvasTexture(128, 64, (g) => {
        g.fillStyle = team === 'A' ? '#25365e' : '#8f3a2e';
        g.fillRect(0, 0, 128, 64);
        g.fillStyle = '#f3ecd9';
        g.font = '700 34px "PingFang SC", sans-serif';
        g.textAlign = 'center';
        g.fillText(`${team} 队`, 64, 44);
      });
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(0.7, 0.34),
        new THREE.MeshBasicMaterial({ map: labelTex }),
      );
      label.position.set(-1.55, yOff, 0.06);
      strip.add(label);
      // shared semantics: interception = blue, failure = red (both teams)
      const colors = ['#3d6fb4', '#3d6fb4', '#e0492f', '#e0492f'];
      const xs = [-0.75, -0.35, 0.45, 0.85];
      for (let i = 0; i < 4; i++) {
        const mat = new THREE.MeshStandardMaterial({
          color: '#2b3040',
          roughness: 0.3,
          emissive: colors[i],
          emissiveIntensity: 0.03,
        });
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), mat);
        bulb.position.set(xs[i], yOff, 0.1);
        strip.add(bulb);
        this.scoreLamps.push(mat);
      }
    };
    mkLampRow('A', 0.08);
    mkLampRow('B', -0.3);
    this.scene.add(strip);
  }

  /** Desk props: code-word displays, tape reels, oscilloscope, keypad,
   *  headphones, cables. The VU countdown meter and power/alert lamps live
   *  on the main CRT's console strip (see buildScreens). */
  private buildDeskProps(): void {
    // four code-word displays in front of the main CRT
    for (let i = 0; i < 4; i++) {
      const grp = new THREE.Group();
      grp.position.set(-3.9 + i * 1.65, 0.85, -4.6);
      grp.rotation.x = -0.5;
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.95, 0.12), stdMat('#2b3040', 0.45, 0.5));
      grp.add(back);
      const cv = document.createElement('canvas');
      cv.width = 256;
      cv.height = 144;
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.wordTextures.push({ tex, cv });
      const plateMat = new THREE.MeshBasicMaterial({ map: tex });
      this.wordPlateMats.push(plateMat);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 0.85), plateMat);
      plate.position.z = 0.07;
      grp.add(plate);
      this.scene.add(grp);
    }
    this.setCodebook(null);

    // reel-to-reel tape deck, always slowly turning — parked far left so it
    // never crosses the screens' sightline
    const deck = new THREE.Group();
    deck.position.set(-7.2, 1.35, -5.6);
    deck.rotation.y = 0.45;
    const deckBox = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 0.5), stdMat('#3f382c', 0.6, 0.3));
    deckBox.position.z = -0.3;
    deck.add(deckBox);
    for (const x of [-0.8, 0.8]) {
      const reel = new THREE.Group();
      reel.position.set(x, 0.35, 0.02);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 28), stdMat('#8f8672', 0.35, 0.75));
      disc.rotation.x = Math.PI / 2;
      reel.add(disc);
      for (let s = 0; s < 3; s++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), stdMat('#2b3040', 0.5, 0.4));
        spoke.rotation.z = (s * Math.PI * 2) / 3;
        reel.add(spoke);
      }
      deck.add(reel);
      this.reels.push(reel);
    }
    const deckGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(2.9, 0.7),
      new THREE.MeshBasicMaterial({ color: '#160a05' }),
    );
    deckGlass.position.set(0, -0.85, 0.02);
    deck.add(deckGlass);
    this.scene.add(deck);

    // desk oscilloscope (activity waveform)
    this.buildScopeModule();

    // a proper low keyboard in front of the main CRT. Keys share one
    // material so the whole deck can dim in standby; individual keys sink
    // when the player types in the DOM (stage.keyPress).
    const kbd = new THREE.Group();
    kbd.position.set(1.5, 0.42, -3.9);
    kbd.rotation.x = -0.1;
    const kbdBase = new THREE.Mesh(new RoundedBoxGeometry(4.6, 0.22, 1.8, 3, 0.06), stdMat('#2b3040', 0.5, 0.4));
    kbd.add(kbdBase);
    this.kbdKeyMat = new THREE.MeshStandardMaterial({ color: '#f3ecd9', roughness: 0.55, metalness: 0.05 });
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 12; c++) {
        const key = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.3), this.kbdKeyMat);
        key.position.set(-2.05 + c * 0.375, 0.16, -0.55 + r * 0.55);
        kbd.add(key);
        this.keyMeshes.push(key);
        this.keySink.push(0);
      }
    }
    this.scene.add(kbd);

    // headphones on a stand
    const phones = new THREE.Group();
    phones.position.set(-6.4, 0.3, -5.4);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.7, 10), stdMat('#8f8672', 0.35, 0.75));
    pole.position.y = 0.85;
    phones.add(pole);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.08, 20), stdMat('#2b3040', 0.5, 0.4));
    phones.add(base);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 10, 24, Math.PI), stdMat('#2b3040', 0.5, 0.4));
    band.position.y = 1.75;
    phones.add(band);
    for (const x of [-0.55, 0.55]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 16), stdMat('#3f382c', 0.6, 0.3));
      cup.rotation.z = Math.PI / 2;
      cup.position.set(x, 1.68, 0);
      phones.add(cup);
    }
    phones.rotation.y = 0.5;
    this.scene.add(phones);

    // power + alert lamps live on the console strip (see buildScreens)

    // cables: monitors and props wired down through the desk
    const cableMat = stdMat('#241f18', 0.85, 0.1);
    const link = (a: [number, number, number], b: [number, number, number], sag: number): void => {
      const pa = new THREE.Vector3(...a);
      const pb = new THREE.Vector3(...b);
      const mid = pa.clone().add(pb).multiplyScalar(0.5);
      mid.y -= sag;
      mid.z -= 0.4;
      const curve = new THREE.CatmullRomCurve3([pa, mid, pb]);
      this.scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.06, 6), cableMat));
    };
    link([-1.1, 0.4, -9.5], [-1.1, 0.3, -7.5], 0.4); // console strip → desk
    link([6.6, 0.9, -10.2], [6.0, 0.3, -7.0], 0.8); // archive CRT → desk
    link([-10.2, 1.4, -6.8], [-7.2, 0.6, -5.6], 0.5); // scope → tape deck
    link([-5.5, 0.7, -9.5], [-4.4, 0.3, -7.2], 0.5); // strip → desk behind
    link([2.2, 0.7, -9.5], [1.5, 0.4, -4.2], 0.6); // strip → keyboard
  }

  /** The field codebook on the desk — clicking it opens the paper archive
   *  (round history). Hovering lifts it slightly to show it's interactive. */
  private buildCodebook(): void {
    const grp = new THREE.Group();
    grp.position.set(4.7, 0.42, -4.9);
    grp.rotation.y = -0.38;

    // cloth-bound cover with gold-foil title
    const coverTex = canvasTexture(256, 192, (g) => {
      g.fillStyle = '#5c2f24';
      g.fillRect(0, 0, 256, 192);
      // cloth weave
      for (let y = 0; y < 192; y += 3) {
        g.strokeStyle = `rgba(0,0,0,${0.05 + (y % 6 === 0 ? 0.05 : 0)})`;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(256, y);
        g.stroke();
      }
      g.strokeStyle = '#c9a84c';
      g.lineWidth = 3;
      g.strokeRect(12, 12, 232, 168);
      g.fillStyle = '#e3c56a';
      g.textAlign = 'center';
      g.font = '700 44px "PingFang SC", sans-serif';
      g.fillText('密码本', 128, 100);
      g.font = '400 15px monospace';
      g.fillText('FIELD CODEBOOK', 128, 132);
      g.font = '600 13px "PingFang SC", sans-serif';
      g.fillText('K-3 监听台', 128, 162);
    });
    const coverMat = new THREE.MeshStandardMaterial({ map: coverTex, roughness: 0.8, metalness: 0.05 });
    const clothMat = stdMat('#5c2f24', 0.85, 0.05);

    const bottom = new THREE.Mesh(new RoundedBoxGeometry(1.9, 0.07, 1.4, 2, 0.03), clothMat);
    bottom.position.y = 0.035;
    grp.add(bottom);
    const pages = new THREE.Mesh(new RoundedBoxGeometry(1.78, 0.12, 1.28, 2, 0.02), stdMat('#e8dcc8', 0.9, 0.02));
    pages.position.y = 0.13;
    grp.add(pages);
    const top = new THREE.Mesh(new RoundedBoxGeometry(1.9, 0.07, 1.4, 2, 0.03), clothMat);
    top.position.y = 0.225;
    grp.add(top);
    // the titled cover plate: a separate plane so the foil text never mirrors
    const cover = new THREE.Mesh(new THREE.PlaneGeometry(1.82, 1.32), coverMat);
    cover.rotation.x = -Math.PI / 2;
    cover.position.y = 0.262;
    grp.add(cover);
    // brass spine band
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.27, 1.42), stdMat('#b8860b', 0.35, 0.8));
    spine.position.set(-0.92, 0.135, 0);
    grp.add(spine);

    this.codebookGrp = grp;
    this.scene.add(grp);
  }

  private setPointer(ev: MouseEvent): void {
    this.pointer.set(
      (ev.clientX / window.innerWidth) * 2 - 1,
      -(ev.clientY / window.innerHeight) * 2 + 1,
    );
  }

  private onPointerMove = (ev: PointerEvent): void => {
    this.setPointer(ev);
    this.raycaster.setFromCamera(this.pointer, this.camera);

    if (this.paperOpen && this.paperT > 0.5 && this.paperMesh) {
      const hit = this.raycaster.intersectObject(this.paperMesh, false)[0];
      if (hit?.uv) this.onPaperPick?.(hit.uv.x, hit.uv.y, 'hover');
      else this.onPaperPick?.(0, 0, 'leave');
      return;
    }

    if (this.mainGlass) {
      const hit = this.raycaster.intersectObject(this.mainGlass, false)[0];
      if (hit?.uv) {
        this.codebookHover = 0;
        this.onScreenPick?.(hit.uv.x, hit.uv.y, 'hover');
        return;
      }
    }
    this.onScreenPick?.(0, 0, 'leave');

    const book = this.codebookGrp
      ? this.raycaster.intersectObject(this.codebookGrp, true).length > 0
      : false;
    this.codebookHover = book ? 1 : 0;
    this.renderer.domElement.style.cursor = book ? 'pointer' : '';
  };

  private onCanvasClick = (ev: MouseEvent): void => {
    this.setPointer(ev);
    this.raycaster.setFromCamera(this.pointer, this.camera);

    if (this.paperOpen && this.paperT > 0.5 && this.paperMesh) {
      const hit = this.raycaster.intersectObject(this.paperMesh, false)[0];
      if (hit?.uv) this.onPaperPick?.(hit.uv.x, hit.uv.y, 'click');
      else this.onPaperPick?.(0, 0, 'outside');
      return;
    }

    if (this.mainGlass) {
      const hit = this.raycaster.intersectObject(this.mainGlass, false)[0];
      if (hit?.uv) {
        this.onScreenPick?.(hit.uv.x, hit.uv.y, 'click');
        return;
      }
    }
    if (this.codebookGrp && this.raycaster.intersectObject(this.codebookGrp, true).length > 0) {
      this.onCodebookClick?.();
    }
  };

  private buildScopeModule(): void {
    const scope = new THREE.Group();
    scope.position.set(-10.2, 2.3, -6.8);
    scope.rotation.y = 0.45;

    const back = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.45, 0.5, 40), stdMat('#3f382c', 0.7, 0.3));
    back.rotation.x = Math.PI / 2;
    back.position.z = -0.35;
    scope.add(back);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.16, 12, 56), stdMat('#8f8672', 0.35, 0.75));
    scope.add(bezel);
    const screen = new THREE.Mesh(
      new THREE.CircleGeometry(2.0, 48),
      new THREE.MeshBasicMaterial({ color: '#150a05' }),
    );
    screen.position.z = 0.05;
    scope.add(screen);
    const glowMat = new THREE.MeshBasicMaterial({
      color: '#ff5a3c',
      transparent: true,
      opacity: 0.06,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(new THREE.CircleGeometry(2.0, 48), glowMat);
    glow.position.z = 0.06;
    scope.add(glow);
    this.glowMats.push(glowMat);

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
      line.position.z = 0.1;
      return line;
    };
    this.traceA = mkTrace(this.traceMatA);
    this.traceB = mkTrace(this.traceMatB);
    scope.add(this.traceA, this.traceB);
    this.scene.add(scope);
  }

  private vuTexture(): THREE.CanvasTexture {
    return canvasTexture(512, 512, (g) => {
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

      g.beginPath();
      g.arc(px, py, R - 27, redFrom, a1);
      g.strokeStyle = '#c9402e';
      g.lineWidth = 11;
      g.stroke();

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

      // scale numbers: 60 (full) at the left end, 0 (spent) at the right
      g.fillStyle = '#25365e';
      g.textAlign = 'center';
      g.font = '700 30px monospace';
      for (let i = 0; i <= 4; i++) {
        const a = a0 + (a1 - a0) * (i / 4);
        const v = 60 - i * 15;
        g.fillText(String(v), px + Math.cos(a) * (R - 84), py + Math.sin(a) * (R - 84) + 10);
      }

      g.fillStyle = '#25365e';
      g.textAlign = 'center';
      g.font = '700 36px "PingFang SC", sans-serif';
      g.fillText('回合', 256, 322);
      g.font = '700 16px sans-serif';
      g.fillText('ROUND TIME', 256, 348);

      g.beginPath();
      g.arc(px, py, 16, 0, Math.PI * 2);
      g.fillStyle = '#2b3040';
      g.fill();
    });
  }

  private buildDust(): void {
    const count = 220;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 1] = Math.random() * 10 - 1;
      pos[i * 3 + 2] = Math.random() * 16 - 14;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x8fa0c8,
      size: 0.06,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.dust = new THREE.Points(geo, mat);
    this.scene.add(this.dust);
  }

  // ---- frame loop ----------------------------------------------------------

  private tick = (): void => {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    // palette easing
    const ease = 1 - Math.pow(0.001, dt);
    this.lightColor.lerp(this.targetLight, ease * 0.6);
    this.bgColor.lerp(this.targetBg, ease * 0.6);
    this.screenColor.lerp(this.targetScreen, ease * 0.6);

    this.moodLight.color.copy(this.lightColor);
    this.spillLight.color.copy(this.screenColor);
    this.traceMatA.color.copy(this.screenColor);
    this.traceMatB.color.copy(this.screenColor);
    for (const m of this.glowMats) m.color.copy(this.screenColor);

    // flash decay
    this.flash = Math.max(0, this.flash - dt * 1.6);
    if (this.flash > 0) {
      this.scene.background = this.bgColor.clone().lerp(this.flashColor, this.flash * 0.45);
    } else {
      this.scene.background = this.bgColor;
    }
    if (this.scene.fog) this.scene.fog.color.copy(this.scene.background as THREE.Color);
    this.moodLight.intensity = 70 + this.flash * 140;
    this.spillLight.intensity = 14 + this.energy * 10 + this.flash * 20;

    // activity energy
    this.energyTarget = Math.max(0.18, this.energyTarget - dt * 0.5);
    this.energy += (this.energyTarget - this.energy) * ease;
    for (let i = 0; i < 3; i++) this.slotBoost[i] = Math.max(0, this.slotBoost[i] - dt * 1.4);

    // power-up blend: instruments fade in when a match starts, out in menus
    this.powerBlend += ((this.powered ? 1 : 0) - this.powerBlend) * ease * 0.7;

    // desk keyboard: DOM typing sinks a random key, then it springs back
    for (let i = 0; i < this.keyMeshes.length; i++) {
      this.keySink[i] = Math.max(0, this.keySink[i] - dt * 6);
      this.keyMeshes[i].position.y = 0.16 - this.keySink[i] * 0.06;
    }
    this.kbdKeyMat.color.set('#f3ecd9').lerp(new THREE.Color('#3a362e'), 1 - this.powerBlend);

    // word plates brighten with power
    for (const m of this.wordPlateMats) {
      m.color.setScalar(0.35 + this.powerBlend * 0.65);
    }

    // score lamps follow the score, gated by power
    this.scoreLamps.forEach((m, i) => {
      m.emissiveIntensity = 0.02 + this.powerBlend * (0.1 + (this.scoreLevels[i] ?? 0) * 1.5);
    });

    // codebook hover lift
    if (this.codebookGrp) {
      const targetY = 0.42 + this.codebookHover * 0.1;
      this.codebookGrp.position.y += (targetY - this.codebookGrp.position.y) * ease * 1.4;
    }

    // scope traces (tube is r=2.0 here)
    const attrA = this.traceA.geometry.getAttribute('position') as THREE.BufferAttribute;
    const amp = 0.35 + this.energy * 0.9 + this.slotBoost[0] * 0.35;
    for (let p = 0; p < SCOPE_POINTS; p++) {
      const x = -1.85 + (3.7 * p) / (SCOPE_POINTS - 1);
      let y = amp * (Math.sin(x * 3.4 + t * 3.1) + 0.35 * Math.sin(x * 7.7 - t * 5.2)) * 0.5;
      const lim = Math.sqrt(Math.max(0.01, 1.92 * 1.92 - x * x));
      y = Math.max(-lim, Math.min(lim, y));
      attrA.setXYZ(p, x, y, 0);
    }
    attrA.needsUpdate = true;
    const attrB = this.traceB.geometry.getAttribute('position') as THREE.BufferAttribute;
    const drift = t * (0.55 + this.energy * 0.8);
    const scale = 0.5 + this.energy * 0.5 + this.slotBoost[1] * 0.2;
    for (let p = 0; p < SCOPE_POINTS; p++) {
      const u = (p / (SCOPE_POINTS - 1)) * Math.PI * 2;
      attrB.setXYZ(p, 1.65 * scale * Math.sin(u + drift), 0.9 * scale * Math.sin(2 * u), 0);
    }
    attrB.needsUpdate = true;

    // VU needle = countdown fraction (dial sweep is -140°..-40°, rz ±0.87)
    let frac: number | null = null;
    if (this.countdownTotal !== null && this.countdownTotal > 0) {
      frac = Math.max(0, Math.min(1, (this.countdownDeadline - performance.now()) / (this.countdownTotal * 1000)));
    }
    const boost = (this.slotBoost[0] + this.slotBoost[1] + this.slotBoost[2]) / 3;
    const v =
      frac !== null
        ? frac
        : this.powered
          ? Math.min(1, 0.15 + this.energy * 0.5 + boost * 0.3 + Math.sin(t * 2.3) * 0.05)
          : 0; // standby: needle parked at rest
    const targetRot = 0.87 - v * 1.74;
    this.needle.rotation.z += (targetRot - this.needle.rotation.z) * ease * 0.8;

    // reels turn faster with activity
    for (let i = 0; i < this.reels.length; i++) {
      this.reels[i].rotation.z += dt * (0.3 + this.energy * 1.6) * (i % 2 === 0 ? 1 : -1);
    }

    // wall clock: all three hands from local time
    {
      const now = new Date();
      const sec = now.getSeconds() + (this.reducedMotion ? 0 : now.getMilliseconds() / 1000);
      const min = now.getMinutes() + sec / 60;
      const hr = (now.getHours() % 12) + min / 60;
      this.secondHand.rotation.z = -(sec / 60) * Math.PI * 2;
      this.minuteHand.rotation.z = -(min / 60) * Math.PI * 2;
      this.hourHand.rotation.z = -(hr / 12) * Math.PI * 2;
    }

    // lamps
    this.lampPower.emissiveIntensity =
      0.15 + this.powerBlend * (0.75 + Math.sin(t * 2) * 0.15) + this.flash;
    this.lampRed.emissiveIntensity = this.mood.alert
      ? this.reducedMotion
        ? 1.2
        : Math.sin(t * 6) > 0
          ? 2.4
          : 0.1
      : 0.1 + this.powerBlend * 0.2 + this.flash;

    // screen glow pulse
    for (const m of this.glowMats) {
      m.opacity = 0.06 + this.flash * 0.2 + (this.mood.alert ? 0.03 + Math.sin(t * 5) * 0.02 : 0);
    }

    // side screen standby waveform
    if (this.sideScreenTex?.redraw && Math.floor(t * 12) % 3 === 0) this.sideScreenTex.redraw(t);

    // dust drift (frozen when the user prefers reduced motion)
    if (!this.reducedMotion) {
      this.dust.rotation.y = t * 0.015;
      this.dust.position.y = Math.sin(t * 0.4) * 0.3;
    }

    this.composer.render();

    // canvas UI repaint (dirty-flagged) + camera/paper motion
    this.mainPainter.flush();
    if (this.paperGrp?.visible) this.paperPainter.flush();

    this.camera.position.lerp(this.camPosTarget, ease * 0.8);
    this.camLookCur.lerp(this.camLookTarget, ease * 0.8);
    this.camera.lookAt(this.camLookCur);

    const paperTarget = this.paperOpen ? 1 : 0;
    this.paperT += (paperTarget - this.paperT) * ease * 1.2;
    if (this.paperGrp) {
      if (!this.paperOpen && this.paperT < 0.02) {
        this.paperGrp.visible = false;
        this.paperT = 0;
      }
      if (this.paperGrp.visible) {
        // settle from a slight dip as it rises
        this.paperGrp.position.y += 0; // position set on open; bob via rotation only
        this.paperGrp.rotation.z = (1 - this.paperT) * 0.06;
        const mat = this.paperMesh?.material as THREE.MeshBasicMaterial | undefined;
        if (mat) mat.opacity = this.paperT;
      }
    }
  };

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.updateZoom();
  };
}
