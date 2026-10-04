import * as THREE from 'three';
import { crtProfile } from '../crt';
import { CrtMotion, crtRestSpot, type CrtKind } from '../crtMotion';
import { CrtSoundMotion, type CrtSoundEvent } from '../crtSound';
import { shadeCrt, crtUniforms, dotUniforms, dotInks, terminalUniforms, terminalRows, type CrtUniforms, type DotUniforms } from '../crtShader';
import { DotBank, DotDriver, dotGrid, type WordDisplay } from '../dotMatrix';
import { defaultDotFilter, type DotFilter } from '../dotFiltering';
import { initialLocal } from '../model';
import { screenBackground, type Blink, type Content, type Frame } from '../paint';
import { Effect, type Chassis, type Plane, type Surface } from './chassis';
import { glassMaterial } from './glass';

type TubeFrame = { id: string; frame?: Frame; palette?: Content['wordTube'] };

/** The picture tubes and the keyword windows: what they show, and how they come on and go dark. */
export class Displays {
    /** `lite` optics drop refraction through the faceplate, halation and colour fringing. */
    lite = false;
    private time = { value: 0 };
    // Every tube has its own supply tolerances, so no two come up or die alike.
    private tubes = new Map<string, { motion: CrtMotion<TubeFrame>; uniforms: CrtUniforms; printed?: Frame }>();
    private screen = new CrtMotion<TubeFrame>();
    private sound = new CrtSoundMotion();
    // The main screen as a terminal: blinking cells, and new pages written out row by row.
    private terminal = terminalUniforms(screenBackground, 830 / 1400);
    private screenPage?: string;
    private screenSignal = '';
    private screenPrivacyKey = '';
    private writeStarted = -Infinity;
    private writing = false;
    // The keyword windows can be fitted with dot-matrix modules instead of tubes.
    private wordDisplay: WordDisplay = initialLocal.wordDisplay;
    private dotFilter: DotFilter = defaultDotFilter;
    private dotModules = new Map<string, { driver: DotDriver; uniforms: DotUniforms; printed?: Frame }>();
    private dotBank = new DotBank<{ id: string; inks: Content['wordInks']; frames: Content['frames'] }>();
    private dotPrivacyKey = '';
    private powered = true;
    private materials: THREE.Material[] = [];
    private glass: THREE.Mesh[] = [];
    private wordGlass: THREE.MeshPhysicalMaterial[] = [];

    constructor(private chassis: Chassis, private host: HTMLElement, private play: (event: CrtSoundEvent) => void) {}

    /** Native inputs may sit on the main screen only while its picture stands still. */
    get interactive() { return this.screen.interactive; }
    scorePulse(level: number, sweep: number, color: string) {
        this.terminal.score.value.set(level, sweep);
        this.terminal.scoreColor.value.set(color);
        // A scoring receipt must be readable when the mechanical flag strikes.
        if (level > 0) this.writeStarted = -Infinity;
    }
    has(name: string) { return this.tubes.has(name); }

    /**
     * What moves in an ambient frame: every tube (the time uniform never rests
     * while powered, and the scope swaps its texture), plus an LED word window
     * only while its marquee crawls — a resting dot matrix shows nothing new.
     * Each plane's runtime glass is its child, so the regions cover it as well.
     */
    ambientRegions(): THREE.Object3D[] {
        const regions: THREE.Object3D[] = [];
        for (const name of this.tubes.keys()) {
            const plane = this.chassis.planes.get(name);
            if (!plane) continue;
            if (name.startsWith('word') && this.wordDisplay !== 'crt' && !this.dotModules.get(name)?.driver.scrolling) continue;
            regions.push(plane);
        }
        return regions;
    }

    /** Fits every curved surface with its tube, and the keyword windows with their modules as well. */
    install() {
        for (const [name, plane] of this.chassis.planes) {
            const curvature = crtProfile(name);
            if (curvature) this.fit(name, plane, this.chassis.surfaces[name], curvature);
        }
    }
    private fit(name: string, plane: Plane, s: Surface, curvature: NonNullable<ReturnType<typeof crtProfile>>) {
        const kind: CrtKind = name.startsWith('word') ? 'word' : name === 'scope' ? 'scope' : 'screen';
        const seed = name.startsWith('word') ? Number(name.slice(4)) + 1 : name === 'scope' ? 5 : 0;
        const eye = { value: new THREE.Vector3() };
        plane.onBeforeRender = (_renderer, _scene, camera) => {
            camera.getWorldPosition(eye.value);
            plane.worldToLocal(eye.value);
        };
        const uniforms = crtUniforms(kind);
        const motion = name === 'screen' ? this.screen : new CrtMotion<TubeFrame>(kind, seed);
        this.tubes.set(name, { motion, uniforms });
        const dots = kind === 'word' ? dotUniforms() : undefined;
        if (dots) {
            const driver = new DotDriver(seed - 1);
            this.dotModules.set(name, { driver, uniforms: dots });
            this.dotBank.drivers.push(driver);
        }
        shadeCrt(plane.material, { kind, seed, lite: () => this.lite, time: this.time, eye,
            tube: uniforms, size: new THREE.Vector2(s.w, s.h), curvature, spot: crtRestSpot(kind),
            display: () => kind === 'word' ? this.wordDisplay : 'crt',
            filter: () => kind === 'word' ? this.dotFilter : 'baseline', dots,
            terminal: kind === 'screen' ? this.terminal : undefined });
        this.materials.push(plane.material);
        this.addGlass(name, plane);
    }
    private addGlass(name: string, display: THREE.Mesh) {
        const glass = new THREE.Mesh(display.geometry.clone(), glassMaterial());
        if (this.dotModules.has(name)) {
            this.wordGlass.push(glass.material);
            this.syncWordGlass();
        }
        glass.name = `Runtime CRT glass ${name}`;
        glass.position.z = .006;
        glass.renderOrder = 6;
        glass.castShadow = glass.receiveShadow = false;
        display.add(glass);
        this.glass.push(glass);
    }
    private syncWordGlass() {
        // The LED contrast filter has a quieter finish than the CRT's clear cover.
        const led = this.wordDisplay !== 'crt';
        for (const material of this.wordGlass) {
            material.roughness = led ? .26 : .22;
            material.specularIntensity = led ? .22 : .35;
            material.envMapIntensity = led ? .20 : .30;
        }
    }

    applyQuality(glass: boolean, lite: boolean) {
        this.lite = lite;
        for (const pane of this.glass) pane.visible = glass;
        // The cache key names the optics, so this selects the other program.
        for (const material of this.materials) material.needsUpdate = true;
    }

    update(content: Content, powered: boolean, wordDisplay: WordDisplay, reduced: boolean) {
        this.powered = powered;
        if (this.wordDisplay !== wordDisplay) this.fitWordDisplay(wordDisplay, reduced);
        // Every tube keeps its outgoing picture and phosphor colour until dark;
        // paint's blank power-off frames wait for that same exchange.
        this.screen.sync(powered, { id: content.displayKey, frame: content.frames.screen });
        this.syncTerminal(content, reduced);
        // Revoking a key also replaces the outgoing image during palette changes
        // and power-off afterglow; no secret is kept in the phosphor snapshot.
        if (this.screenPrivacyKey !== content.screenPrivacyKey && this.screen.current)
            this.screen.current = { ...this.screen.current, frame: content.frames.screen };
        this.screenPrivacyKey = content.screenPrivacyKey;
        // Observe the power edge before reduced motion settles the tube instantly.
        this.syncSound(reduced);
        for (const [name, tube] of this.tubes) {
            if (tube.motion === this.screen) continue;
            const word = name.startsWith('word');
            tube.motion.sync(powered && (!word || this.wordDisplay === 'crt'), {
                id: word ? content.displayKey : name, frame: content.frames[name],
                palette: word ? content.wordTube : undefined,
            });
            if (name.startsWith('word') && this.dotPrivacyKey !== content.wordPrivacyKey && tube.motion.current)
                tube.motion.current = { ...tube.motion.current, frame: content.frames[name] };
        }
        this.dotBank.sync(powered && this.wordDisplay !== 'crt', {
            id: content.displayKey, inks: content.wordInks, frames: content.frames,
        });
        // Concealment and team/room changes revoke the outgoing picture immediately,
        // even during a palette shutdown. Keep its old colour until the bus is dark.
        if (this.dotPrivacyKey !== content.wordPrivacyKey && this.dotBank.current)
            this.dotBank.current = { ...this.dotBank.current, frames: content.frames };
        this.dotPrivacyKey = content.wordPrivacyKey;
        if (reduced) this.dotBank.advance(0, true);
        if (reduced) for (const tube of this.tubes.values()) tube.motion.advance(0, true);
        this.sync(reduced);
    }

    /**
     * A briefing is a new signal: the tube loses its hold for a moment and locks on again,
     * once per briefing. Any new page is then written out from the top, as a terminal
     * receives it. Only a steady picture does either: never dark glass, a tube still
     * warming up or changing palette, nor for anyone who asked for reduced motion.
     */
    private syncTerminal(content: Content, reduced: boolean) {
        const steady = this.powered && this.screen.interactive && !reduced;
        if (content.screenSignal && content.screenSignal !== this.screenSignal && steady) this.screen.tube.disturb(.5);
        if (content.screenSignal) this.screenSignal = content.screenSignal;
        if (this.screenPage !== undefined && content.screenPage !== this.screenPage && steady) this.writeStarted = performance.now();
        this.screenPage = content.screenPage;
        this.setBlink(content.screenBlink, content.frames.screen, reduced);
    }
    private setBlink(cells: Blink[], page: Frame, reduced: boolean) {
        const kinds = [0, 0, 0, 0];
        cells.slice(0, 4).forEach((cell, i) => {
            // Canvas rows run down the page; texture rows run up.
            this.terminal.blink.value[i].set(cell.x / page.width, 1 - (cell.y + cell.h) / page.height,
                (cell.x + cell.w) / page.width, 1 - cell.y / page.height);
            kinds[i] = reduced ? 0 : cell.kind === 'cursor' ? 1 : 2;
        });
        this.terminal.blinkKind.value.fromArray(kinds);
    }

    /** Review only: keep the same frame and supply while exchanging its filter. */
    setFilter(filter: DotFilter) {
        if (filter === this.dotFilter) return;
        this.dotFilter = filter;
        for (const name of this.dotModules.keys()) this.chassis.planes.get(name)!.material.needsUpdate = true;
        this.chassis.invalidate();
    }

    /** Swaps the keyword windows' hardware; the newly fitted modules start from cold. */
    private fitWordDisplay(display: WordDisplay, reduced: boolean) {
        this.wordDisplay = display;
        this.syncWordGlass();
        for (const [name, tube] of this.tubes) {
            if (!this.dotModules.has(name)) continue;
            this.chassis.planes.get(name)!.material.needsUpdate = true;
            tube.printed = undefined;
            tube.motion.tube.settle(false);
        }
        for (const module of this.dotModules.values()) {
            module.printed = undefined;
            module.driver.settle(false);
            module.driver.power(this.powered);
            if (reduced) module.driver.settle(this.powered);
        }
        this.chassis.invalidate();
    }

    private syncSound(reduced: boolean) {
        for (const event of this.sound.update(this.screen.tube, this.powered, reduced)) this.play(event);
    }

    /** Hands each tube and module its drive levels, and its picture once the old one is gone. */
    private sync(reduced: boolean) {
        this.syncSound(reduced);
        const snapshot = this.dotBank.current;
        if (snapshot) {
            dotInks.word.value.set(snapshot.inks.word);
            dotInks.legend.value.set(snapshot.inks.legend);
            dotInks.warning.value.set(snapshot.inks.warning);
        }
        for (const [name, module] of this.dotModules) {
            if (this.wordDisplay === 'crt') break;
            const { driver } = module, frame = snapshot?.frames[name];
            // The bank keeps the outgoing frame through shutdown, except explicit concealment.
            if (frame && frame !== module.printed) {
                const lit = module.printed !== undefined && driver.on;
                module.printed = frame;
                driver.strip = Math.max(dotGrid.cols, frame.canvas.width);
                if (this.chassis.print(name, frame) && lit && !reduced) driver.load();
            }
            driver.pack(module.uniforms.drive.value, module.uniforms.panel.value);
        }
        for (const [name, tube] of this.tubes) {
            const { motion, uniforms } = tube;
            if (this.wordDisplay !== 'crt' && this.dotModules.has(name)) continue;
            motion.tube.pack(uniforms.scan.value, uniforms.light.value, uniforms.trail.value);
            const frame = motion.current?.frame;
            if (!frame || frame === tube.printed) continue;
            // New words on a lit window arrive as a new signal, which the hold has to find again.
            const lit = tube.printed !== undefined && motion.tube.on;
            tube.printed = frame;
            const palette = motion.current?.palette;
            if (palette) {
                uniforms.hot.value.set(palette.light);
                uniforms.after.value.set(palette.light).lerp(new THREE.Color(1, 1, 1), .45);
                uniforms.tint.value.set(palette.background).multiplyScalar(.04);
            }
            if (this.chassis.print(name, frame) && lit && name !== 'screen') motion.tube.disturb(.55);
        }
        if (import.meta.env.DEV) {
            this.host.dataset.crtPhase = this.screen.phase;
            this.host.dataset.crtTheme = this.screen.current?.id ?? '';
            this.host.dataset.crtLevel = this.screen.level.toFixed(3);
        }
    }

    tick(now: number, dt: number, reduced: boolean) {
        let effect = Effect.none;
        const interactive = this.screen.interactive;
        for (const tube of this.tubes.values()) {
            // A glass that is still changing owes every frame, whatever the ambient pace.
            if (tube.motion.moving) effect |= Effect.redraw;
            tube.motion.advance(dt, reduced);
        }
        if (this.wordDisplay !== 'crt') {
            // A transition owes frames at once; a marquee crawl is ambient motion,
            // drawn at the quality level's pace inside the window's region.
            if (!reduced && this.dotBank.changing) effect |= Effect.redraw;
            else if (!reduced && this.dotBank.scrolling) effect |= Effect.ambient;
            this.dotBank.advance(dt, reduced);
        }
        this.sync(reduced);
        // A page takes a little under half a second to arrive; every frame shows its progress.
        const written = reduced ? 1 : Math.min(1, (now - this.writeStarted) / 450);
        this.terminal.write.value.x = written * terminalRows;
        // Including the frame that completes it.
        if (written < 1 || this.writing) effect |= Effect.redraw;
        this.writing = written < 1;
        if (interactive !== this.screen.interactive) effect |= Effect.project;
        this.time.value = reduced ? 0 : now / 1000;
        return effect;
    }

    dispose() {
        delete this.host.dataset.crtPhase;
        delete this.host.dataset.crtTheme;
        delete this.host.dataset.crtLevel;
    }
}
