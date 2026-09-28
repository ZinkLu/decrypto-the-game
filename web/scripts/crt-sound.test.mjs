import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function load(name) {
    const source = await readFile(new URL(`../src/console/${name}.ts`, import.meta.url), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
    return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}
const { CrtMotion } = await load('crtMotion');
const { CrtSoundMotion } = await load('crtSound');

function monitor(powered = true, reduced = false) {
    const motion = new CrtMotion(), sound = new CrtSoundMotion();
    let power = powered, id = 'classic', time = 0;
    const events = [];
    const sample = () => {
        for (const event of sound.update(motion.tube, power, reduced)) events.push({
            ...event, time, height: motion.tube.height, width: motion.tube.width, steady: motion.tube.steady,
        });
    };
    function sync() {
        motion.sync(power, { id }); sample();
        if (reduced) motion.advance(0, true);
        sample();
    }
    sync();
    return { motion, events,
        power(on) { power = on; sync(); },
        theme(next) { id = next; sync(); },
        run(seconds, dt = 1 / 60) {
            for (let t = 0; t < seconds; t += dt) { time += dt; motion.advance(dt, reduced); sample(); }
        },
        cues: () => events.filter(e => e.type === 'play'),
    };
}

test('initial snapshots and ordinary game updates never start the CRT soundtrack', () => {
    for (const on of [false, true]) {
        const m = monitor(on); m.run(1); m.theme('classic'); m.run(1);
        assert.deepEqual(m.events, []);
    }
});

test('cold startup degausses once, warms on the rising rail and ends with a steady picture', () => {
    const m = monitor(false); m.power(true); m.run(2);
    assert.deepEqual(m.cues().map(e => e.cue), ['crt-degauss', 'crt-warmup']);
    assert.equal(m.cues()[0].gain, 1);
    assert.ok(m.cues()[1].time < .15 && !m.cues()[1].steady);
    const end = m.events.find(e => e.type === 'end');
    assert.ok(end.time > .5 && end.time < 1.5 && end.steady);
});

test('shutdown follows the real raster line, spot and darkness at different frame rates', () => {
    for (const dt of [1 / 120, 1 / 60, 1 / 30, .1]) {
        const m = monitor(); m.power(false); m.run(2, dt);
        assert.deepEqual(m.cues().map(e => e.cue), ['crt-collapse', 'crt-discharge']);
        const [line, spot] = m.cues();
        assert.ok(line.height < .10 && line.time <= .2);
        assert.ok(spot.width < .04 && spot.time > line.time && spot.time <= .6);
        assert.equal(m.events.at(-1).type, 'end');
        assert.ok(m.events.at(-1).time > spot.time);
    }
});

test('warm restarts and palette changes omit the cold-start coil and suppress stale shutdown stages', () => {
    const m = monitor(); m.power(false); m.run(.15); m.power(true); m.run(1);
    assert.deepEqual(m.cues().map(e => e.cue), ['crt-collapse', 'crt-warmup']);
    assert.ok(m.cues()[1].gain < .5);
    assert.equal(m.events.filter(e => e.type === 'begin').length, 2, 'reversal cancels the previous sound group');
    const theme = monitor(); theme.theme('amber'); theme.run(2);
    assert.deepEqual(theme.cues().map(e => e.cue), ['crt-collapse', 'crt-discharge', 'crt-warmup']);
    theme.theme('amber'); theme.run(1);
    assert.equal(theme.cues().length, 3, 'same palette game data stays quiet');
});

test('reduced motion uses one short cue per power change and keeps palette edits quiet', () => {
    const m = monitor(true, true); m.theme('amber'); m.run(1);
    assert.equal(m.events.length, 0);
    m.power(false); m.run(1); m.power(true); m.run(1);
    assert.deepEqual(m.cues().map(e => e.cue), ['crt-collapse', 'crt-degauss']);
    assert.equal(m.events.filter(e => e.type === 'begin').length, 2);
});
