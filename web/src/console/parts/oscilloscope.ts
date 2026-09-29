import * as THREE from 'three';
import { translate, type Locale } from '../i18n';
import { initialLocal, scopeModes, scopeWaveBlend, scopeRatio, scopeSweepHz, scopeTimebase, scopeAxisAngle, scopeFigures, type HardwareState } from '../model';
import { crtFinish } from '../paint';
import { VectorMonitor, scopeResonance, scopeTuning } from '../scope';
import { Effect, type Chassis } from './chassis';

const width = 420, height = 350;
type Dial = 'freq' | 'wave' | 'rate' | 'axis';
const dials: [Dial, string][] = [['freq', 'ScopeTuning'], ['wave', 'ScopeWave'], ['rate', 'ScopeRate'], ['axis', 'ScopePersistence']];

/** The vector monitor: four dials, and the screen its simulated beam writes on. */
export class Oscilloscope {
    private monitor = new VectorMonitor();
    private canvas = document.createElement('canvas');
    private grid = document.createElement('canvas');
    private trace = document.createElement('canvas');
    private bloom = document.createElement('canvas');
    private glow?: ImageData;
    private texture?: THREE.CanvasTexture;
    private locale: Locale = 'zh';
    private controls = { freq: initialLocal.scopeFreq, wave: initialLocal.scopeWave, rate: initialLocal.scopeRate, axis: initialLocal.scopeAxis };
    private knobs: Partial<Record<Dial, THREE.Object3D>> = {};
    private angle: Record<Dial, number> = { freq: 0, wave: 0, rate: 0, axis: 0 };
    private desired: Record<Dial, number> = { freq: 0, wave: 0, rate: 0, axis: 0 };

    constructor() {
        for (const canvas of [this.canvas, this.grid]) {
            canvas.width = width;
            canvas.height = height;
        }
        // The phosphor owns the plotting area; a quarter-size copy is its bloom.
        this.trace.width = scopeTuning.width;
        this.trace.height = scopeTuning.height;
        this.bloom.width = scopeTuning.width / 4;
        this.bloom.height = scopeTuning.height / 4;
        this.drawGraticule();
    }

    /** How nearly the two oscillators hold a whole-number ratio, for the LOCK lamp. */
    get coherence() { return this.monitor.signal.coherence; }

    /** Returns whether all four dials are fitted. */
    install(chassis: Chassis) {
        for (const [dial, name] of dials) this.knobs[dial] = chassis.moving(name, { merge: true });
        return dials.every(([dial]) => this.knobs[dial]);
    }
    /** The screen's texture, which lives as long as the engine. */
    mount(chassis: Chassis) {
        const texture = this.texture = new THREE.CanvasTexture(this.canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        chassis.textures.set('scope', texture);
        chassis.planes.get('scope')!.material.map = texture;
    }

    update(local: HardwareState) {
        this.locale = local.locale;
        this.controls = { freq: local.scopeFreq, wave: local.scopeWave, rate: local.scopeRate, axis: local.scopeAxis };
        // Analog knobs have physical end stops and retain every fractional turn.
        // Each pointer sweeps exactly between the outer index marks of its dial.
        this.desired.freq = Math.PI * .75 * (1 - 2 * local.scopeFreq);
        this.desired.wave = 2.182 * (1 - 2 * local.scopeWave);
        this.desired.rate = 2.182 * (1 - 2 * local.scopeRate);
        this.desired.axis = 2.182 * (1 - 2 * local.scopeAxis);
    }

    clear() {
        this.monitor.clear();
    }

    tick(dt: number, reduced: boolean) {
        let effect = Effect.none;
        for (const [dial] of dials) {
            if (Math.abs(this.angle[dial] - this.desired[dial]) > .0001) effect |= Effect.shadow;
            this.angle[dial] = reduced ? this.desired[dial] : THREE.MathUtils.damp(this.angle[dial], this.desired[dial], 16, dt);
            const knob = this.knobs[dial];
            if (knob) knob.rotation.z = this.angle[dial];
        }
        return effect;
    }

    private drawGraticule() {
        const c = this.grid.getContext('2d')!;
        const w = width, plotBottom = 292;
        c.fillStyle = '#0e2118';
        c.fillRect(0, 0, w, height);
        const bloom = c.createRadialGradient(210, 145, 10, 210, 145, 278);
        bloom.addColorStop(0, 'rgba(117, 156, 67, .14)');
        bloom.addColorStop(.72, 'rgba(45, 74, 31, .05)');
        bloom.addColorStop(1, 'rgba(3, 12, 8, .72)');
        c.fillStyle = bloom;
        c.fillRect(0, 0, w, height);
        c.strokeStyle = 'rgba(111, 143, 72, .20)';
        c.lineWidth = 1;
        for (let x = 0; x <= w; x += 35) {
            c.beginPath(); c.moveTo(x, 0); c.lineTo(x, plotBottom); c.stroke();
        }
        for (let y = 5; y <= plotBottom; y += 35) {
            c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
        }
        c.strokeStyle = 'rgba(136, 159, 88, .38)';
        c.beginPath(); c.moveTo(210, 0); c.lineTo(210, plotBottom); c.stroke();
        c.beginPath(); c.moveTo(0, 146); c.lineTo(w, 146); c.stroke();
        c.fillStyle = 'rgba(139, 163, 94, .46)';
        for (let n = -10; n <= 10; n++) {
            c.fillRect(210 + n * 7 - .5, 142, 1, 8);
            c.fillRect(206, 146 + n * 7 - .5, 8, 1);
        }
        c.fillStyle = 'rgba(8, 28, 35, .42)';
        c.fillRect(0, plotBottom, w, 58);
        c.strokeStyle = 'rgba(160, 203, 200, .15)';
        c.beginPath(); c.moveTo(0, plotBottom + .5); c.lineTo(w, plotBottom + .5); c.stroke();
    }

    /**
     * The tube is simulated, not plotted: two oscillators steer one beam and
     * the phosphor keeps what it wrote. Reduced motion shows a long exposure.
     */
    draw(dt: number, reduced: boolean) {
        const { freq, wave, rate, axis } = this.controls;
        this.monitor.run(dt, { freq, wave, rate, axis }, reduced);
        const trace = this.trace.getContext('2d')!;
        const glow = this.glow ??= trace.createImageData(scopeTuning.width, scopeTuning.height);
        this.monitor.phosphor.expose(glow.data);
        trace.putImageData(glow, 0, 0);
        const bloom = this.bloom.getContext('2d')!;
        bloom.clearRect(0, 0, this.bloom.width, this.bloom.height);
        bloom.drawImage(this.trace, 0, 0, this.bloom.width, this.bloom.height);

        const c = this.canvas.getContext('2d')!;
        c.clearRect(0, 0, width, height);
        c.drawImage(this.grid, 0, 0);
        // Light adds to the lit graticule: a soft halo in the glass, then the trace.
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = .5; c.drawImage(this.bloom, 0, 0, scopeTuning.width, scopeTuning.height);
        c.globalAlpha = 1; c.drawImage(this.trace, 0, 0);
        c.restore();
        const ratio = scopeRatio(freq), hz = scopeSweepHz(rate), resonance = scopeResonance(ratio);
        c.fillStyle = 'rgba(211, 239, 232, .86)';
        c.font = '17px "PingFang SC", sans-serif';
        const blend = scopeWaveBlend(wave), shape = translate(this.locale, scopeModes[blend.from]);
        c.fillText(`${blend.mix ? `${shape}›${translate(this.locale, scopeModes[blend.to])}` : shape} · ${scopeFigures(ratio * hz)} Hz`, 20, 319);
        c.textAlign = 'right';
        // Inside a tongue the oscillators hold a whole-number ratio and the figure stands.
        if (!resonance?.locked) c.fillStyle = '#c99d65';
        c.fillText(resonance?.locked ? translate(this.locale, '锁定 {0}', [`${resonance.p}:${resonance.q}`]) : translate(this.locale, '自由运行'), 400, 319);
        c.textAlign = 'left';
        c.fillStyle = 'rgba(174, 211, 205, .75)';
        c.font = '14px "PingFang SC", sans-serif';
        const div = translate(this.locale, '每格'), turned = Math.round(scopeAxisAngle(axis) * 180 / Math.PI);
        const horizontal = turned <= 0 ? `${scopeFigures(scopeTimebase(rate) * 1000)} ms/${div}` : turned >= 90 ? 'X-Y' : `X-Y ${turned}°`;
        c.fillText(`0.5 V/${div} · ${horizontal}`, 20, 340);
        c.textAlign = 'right';
        c.fillText(`Y:X ${ratio.toFixed(3)}`, 400, 340);
        c.textAlign = 'left';
        crtFinish(c, width, height);
        if (this.texture) this.texture.needsUpdate = true;
    }
}
