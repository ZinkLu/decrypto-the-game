import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/components/console/crtMotion.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { CrtMotion, CrtTube, crtDensity, crtRestSpot, crtTuning } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const frame = (id, value = 'clue') => ({ id, value });
const finish = motion => { for (let i = 0; i < 1500 && (motion.moving || !motion.tube.resting); i++) motion.advance(1 / 60); };
const until = (motion, done, limit = 5) => {
    let time = 0;
    for (; time < limit && !done(); time += 1 / 60) motion.advance(1 / 60);
    return time;
};
/** Steps a bare tube and samples it once a frame. */
const record = (tube, seconds, dt = 1 / 60) => {
    const samples = [];
    for (let time = 0; time < seconds; time += dt) {
        tube.step(dt);
        samples.push({ time: time + dt, width: tube.width, height: tube.height, light: tube.light, glow: tube.glow, ghost: tube.ghost,
            spot: tube.spot, roll: tube.roll, moving: tube.moving, steady: tube.steady });
    }
    return samples;
};

test('theme changes retain the old picture until it is past recognising, then reveal the latest choice', () => {
    const motion = new CrtMotion();
    motion.sync(true, frame('classic'));
    assert.equal(motion.interactive, true);
    motion.sync(true, frame('amber'));
    assert.equal(motion.interactive, false);
    motion.advance(.1);
    assert.equal(motion.current.id, 'classic');
    assert.equal(motion.phase, 'closing');
    assert.ok(motion.tube.height < .2 && motion.tube.ghost > .1, 'the raster has gone, its afterglow has not');
    motion.sync(true, frame('rose', 'latest clue'));
    const swapped = until(motion, () => motion.current.id !== 'classic');
    assert.equal(motion.current.id, 'rose', 'only the latest palette is ever shown');
    assert.ok(swapped > .2 && swapped < .6, `exchanged in the dark after ${swapped.toFixed(2)} s`);
    assert.ok(motion.tube.ghost < .03);
    const restored = until(motion, () => motion.interactive);
    assert.ok(restored < .7, `a warm cathode brings the picture straight back (${restored.toFixed(2)} s)`);
    assert.equal(motion.current.value, 'latest clue');
    finish(motion);
    motion.sync(true, frame('rose', 'new game data'));
    assert.equal(motion.current.value, 'new game data');
    assert.equal(motion.phase, 'on', 'game updates never reboot the CRT');
    assert.equal(motion.moving, false);
});

test('power off keeps the outgoing picture until the glass is dark, and stays dark across updates', () => {
    const motion = new CrtMotion();
    motion.sync(true, frame('classic', 'visible'));
    motion.sync(false, frame('classic', 'blank'));
    motion.advance(.15);
    assert.equal(motion.current.value, 'visible', 'do not upload paint’s blank frame early');
    const dark = until(motion, () => !motion.moving);
    assert.ok(dark > .4 && dark < 1.4, `the spot lingers, then goes (${dark.toFixed(2)} s)`);
    assert.equal(motion.current.value, 'blank');
    assert.equal(motion.phase, 'off');
    assert.ok(motion.tube.light < 1e-4);
    motion.sync(false, frame('violet', 'updated'));
    assert.equal(motion.current.value, 'updated', 'dark glass takes any frame at once');
    assert.equal(motion.interactive, false);
    motion.sync(true, frame('violet', 'restored'));
    assert.equal(motion.current.value, 'restored');
    motion.advance(.2);
    assert.equal(motion.phase, 'opening');
    assert.equal(motion.interactive, false, 'native text waits for a settled raster');
    finish(motion);
    assert.equal(motion.phase, 'on');
    assert.equal(motion.interactive, true);
});

test('rapid power reversals and a theme change while warming converge without stale frames', () => {
    const motion = new CrtMotion();
    motion.sync(true, frame('classic'));
    motion.sync(false, frame('classic')); motion.advance(.1);
    const { light, height } = motion.tube;
    motion.sync(true, frame('classic', 'back'));
    assert.equal(motion.current.value, 'back', 'the same palette needs no dark exchange');
    assert.deepEqual([motion.tube.light, motion.tube.height], [light, height], 'reversals do not jump');
    motion.advance(.05);
    assert.equal(motion.phase, 'opening');
    motion.sync(true, frame('violet'));
    assert.equal(motion.phase, 'closing');
    motion.sync(false, frame('rose'));
    finish(motion);
    assert.equal(motion.phase, 'off');
    assert.equal(motion.current.id, 'rose');
    motion.sync(true, frame('rose'));
    finish(motion);
    assert.equal(motion.current.id, 'rose');
    assert.equal(motion.level, 1);
    assert.equal(motion.interactive, true);
});

test('reduced motion settles immediately, including a transition already in flight', () => {
    const motion = new CrtMotion();
    motion.sync(true, frame('classic'));
    motion.sync(true, frame('amber')); motion.advance(.1);
    motion.advance(0, true);
    assert.equal(motion.current.id, 'amber');
    assert.equal(motion.interactive, true);
    assert.equal(motion.moving, false);
    motion.sync(false, frame('amber')); motion.advance(0, true);
    assert.equal(motion.level, 0);
    motion.sync(true, frame('rose')); motion.advance(0, true);
    assert.equal(motion.current.id, 'rose');
    assert.equal(motion.level, 1);
});

test('a dying supply collapses the raster to a line, then a spot that fades through decades', () => {
    const tube = new CrtTube();
    tube.power(false);
    const samples = record(tube, 1.6);
    const line = samples.find(s => s.height < .03);
    assert.ok(line.time < .16, `vertical deflection goes first (${line.time.toFixed(3)} s)`);
    assert.ok(line.width > .3, 'a line, not yet a spot');
    const spot = samples.find(s => s.width < .03);
    assert.ok(spot.time > line.time + .15 && spot.time < .5);
    // The same beam in less area: the glass gets brighter as the picture gets smaller.
    assert.ok(line.glow > 8 && samples.every(s => s.time > line.time || s.glow >= 1 - 1e-9));
    assert.ok(samples.every(s => s.light < 1.3), 'an unblanked gun floods the raster without a blinding flash');
    // Afterglow of the last full picture only ever decays.
    for (let i = 1; i < samples.length; i++) assert.ok(samples[i].ghost <= samples[i - 1].ghost + 1e-12);
    assert.ok(samples.find(s => s.time > .1).ghost < .25 && samples.find(s => s.time > .1).ghost > .05);
    // The spot dims by a steady ratio per frame instead of vanishing.
    const fading = samples.filter(s => s.time > spot.time && s.glow < 3 && s.glow > .02);
    assert.ok(fading.length > 10, `${fading.length} frames of fading spot`);
    for (let i = 1; i < fading.length; i++) assert.ok(fading[i].glow < fading[i - 1].glow && fading[i].glow > fading[i - 1].glow * .4);
    const dark = samples.find(s => !s.moving);
    assert.ok(dark && dark.time < 1.3, 'frames stop being owed once the glass is black');
    assert.ok(samples.at(-1).glow < crtTuning.black);
});

test('a cold tube warms into a soft, slightly large picture; a warm one comes straight back', () => {
    const cold = new CrtTube();
    cold.settle(false);
    cold.power(true);
    const samples = record(cold, 3);
    assert.ok(samples.filter(s => s.time < .15).every(s => s.light < .005), 'no picture before the cathode emits');
    const lit = samples.filter(s => s.light > .05);
    for (let i = 1; i < lit.length; i++) assert.ok(lit[i].light > lit[i - 1].light - 1e-9 || lit[i].light > .9, 'brightness only rises');
    assert.ok(lit.every(s => Math.abs(s.width - 1) < .05 && Math.abs(s.height - 1) < .05), 'deflection is up before there is light: nothing unfolds');
    assert.ok(lit[0].width > 1.01 && lit[0].spot > crtRestSpot('screen') * 3, 'first light is over-sized and out of focus');
    const steady = samples.find(s => s.steady).time;
    assert.ok(steady > .6 && steady < 1.4, `usable after ${steady.toFixed(2)} s`);
    assert.equal(cold.resting, true);
    assert.deepEqual([cold.width, cold.height, cold.light, cold.spot, cold.roll], [1, 1, 1, crtRestSpot('screen'), 0], 'rest is exact');

    const warm = new CrtTube();
    warm.power(false);
    record(warm, .5);
    warm.power(true);
    const back = record(warm, 2).find(s => s.steady).time;
    assert.ok(back < steady * .6, `warm ${back.toFixed(2)} s against cold ${steady.toFixed(2)} s`);
});

test('the same flick of the switch plays the same at any frame rate', () => {
    const at = dts => {
        const tube = new CrtTube();
        tube.power(false);
        let time = 0;
        for (let i = 0; time < .12 - 1e-9; i++) { const dt = Math.min(dts[i % dts.length], .12 - time); tube.step(dt); time += dt; }
        return tube;
    };
    const reference = at([1 / 60]);
    for (const tube of [at([1 / 144]), at([1 / 30]), at([.004, .031, .017])]) {
        assert.ok(Math.abs(tube.height - reference.height) < .01);
        assert.ok(Math.abs(tube.width - reference.width) < .02);
        assert.ok(Math.abs(tube.light - reference.light) < .02);
    }
});

test('the four word tubes are one batch with four temperaments', () => {
    const tubes = [1, 2, 3, 4].map(seed => new CrtTube('word', seed));
    const lit = tubes.map(tube => {
        tube.settle(false);
        tube.power(true);
        return record(tube, 2.5).find(s => s.light > .5).time;
    });
    assert.ok(Math.max(...lit) - Math.min(...lit) > .04, `first light at ${lit.map(t => t.toFixed(2)).join(', ')} s`);
    assert.ok(Math.max(...lit) < .7, 'small tubes are quicker than the main display');
    assert.ok(tubes.every(tube => tube.resting && tube.light === 1));
    const going = tubes.map(tube => {
        tube.power(false);
        return record(tube, .05).at(-1).height;
    });
    assert.ok(Math.max(...going) - Math.min(...going) > .15, `nor do they die together: ${going.map(h => h.toFixed(2)).join(', ')} high after 50 ms`);
    const main = new CrtTube('screen');
    main.power(false);
    main.step(.004);
    assert.ok(main.rail < 1, 'the main display answers its switch at once');
});

test('a new signal costs a raster tube its hold for a moment; a dark tube ignores it', () => {
    const tube = new CrtTube('word', 2);
    tube.disturb(.55);
    assert.equal(tube.resting, false);
    assert.ok(Math.abs(tube.roll) > .05 && tube.unstable > .5);
    assert.equal(tube.light, 1, 'the picture slips, it does not dim');
    const samples = record(tube, 1.5);
    assert.ok(samples.find(s => Math.abs(s.roll) < .002).time < .45);
    assert.equal(tube.resting, true);
    assert.equal(tube.roll, 0);
    const off = new CrtTube('word', 2);
    off.settle(false);
    off.disturb();
    assert.equal(off.resting, true);
    const scope = new CrtTube('scope', 5);
    scope.disturb();
    assert.equal(scope.unstable, 0, 'a vector monitor has no raster to tear');
});

test('packed uniforms are exact at rest, so the shader can take its resting path', () => {
    const pack = tube => {
        const out = [];
        const vector = () => ({ set: (...values) => out.push(values) });
        tube.pack(vector(), vector(), vector());
        return out;
    };
    const on = new CrtTube();
    assert.deepEqual(pack(on), [[1, 1, 0, crtRestSpot('screen')], [1, 0, 1, 0], [1, 1, 0, 0]]);
    on.power(false);
    on.step(1 / 60);
    assert.equal(pack(on)[2][3], 1, 'moving');
    const off = new CrtTube();
    off.settle(false);
    assert.deepEqual(pack(off), [[0, 0, 0, crtRestSpot('screen')], [0, 1, 0, 0], [0, 0, 0, 0]]);
});

test('a collapsing raster gains in brightness exactly what it loses in area', () => {
    const integral = (reach, spot) => {
        let sum = 0;
        const step = Math.min(reach, spot) / 40;
        for (let u = -reach - spot * 6; u <= reach + spot * 6; u += step) sum += crtDensity(u, reach, spot) * step;
        return sum;
    };
    for (const [reach, spot] of [[.5, .0035], [.2, .02], [.01, .02], [.001, .015]])
        assert.ok(Math.abs(integral(reach, spot) - 1) < .01, `reach ${reach}, spot ${spot}: ${integral(reach, spot)}`);
    assert.ok(Math.abs(crtDensity(0, .5, .0035) - 1) < 1e-6, 'a resting raster is lit evenly at one');
    assert.ok(Math.abs(crtDensity(.3, .5, .0035) - 1) < 1e-6);
    assert.ok(crtDensity(.6, .5, .0035) < 1e-6, 'and dark beyond its edge');
    assert.ok(crtDensity(0, .01, .005) > 40, 'a line is a great deal brighter');
});
