import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/components/console/scoreFlagMotion.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { ScoreFlagMotion } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('a restored score is seated immediately; subsequent pulses physically turn the flag', () => {
    const flag = new ScoreFlagMotion();
    flag.sync(true); assert.equal(flag.angle, Math.PI);
    flag.sync(false); flag.advance(.14);
    assert.ok(flag.angle > 0 && flag.angle < Math.PI);
    flag.advance(.14); assert.equal(flag.angle, 0);
    assert.equal(flag.advance(1), false);
});

test('rapid reversals start at the current pose and settle exactly on the latest score', () => {
    const flag = new ScoreFlagMotion();
    flag.sync(false); flag.sync(true); flag.advance(.07);
    const angle = flag.angle;
    flag.sync(false); assert.equal(flag.angle, angle);
    flag.advance(.03); assert.ok(flag.angle < angle);
    flag.sync(true); flag.advance(1); assert.equal(flag.angle, Math.PI);
});

test('a bistable register holds its last pulse without power and catches up when powered', () => {
    const flag = new ScoreFlagMotion();
    flag.sync(false); flag.sync(true); flag.advance(.08);
    flag.sync(false, false); flag.advance(1); assert.equal(flag.angle, Math.PI);
    flag.sync(false, true); flag.advance(1); assert.equal(flag.angle, 0);
});

test('reduced motion settles a moving or reversed flag without overshoot', () => {
    const flag = new ScoreFlagMotion();
    flag.sync(false); flag.sync(true); flag.advance(.05);
    flag.advance(0, true); assert.equal(flag.angle, Math.PI);
    flag.sync(false); flag.advance(0, true); assert.equal(flag.angle, 0);
    assert.equal(flag.consumeImpact(), false);
});

test('the spring releases, strikes once, and recoils inside its mechanical end stops', () => {
    const flag = new ScoreFlagMotion();
    flag.sync(false);
    assert.equal(flag.consumeImpact(), false);
    flag.sync(true); flag.advance(.02); assert.equal(flag.angle, 0);
    flag.advance(.173); assert.equal(flag.consumeImpact(), true);
    assert.equal(flag.consumeImpact(), false);
    flag.advance(.031);
    assert.ok(flag.angle < Math.PI && flag.angle >= Math.PI - .022);
    flag.advance(.1); assert.equal(flag.angle, Math.PI);
    assert.equal(flag.consumeImpact(), false);
    flag.sync(false); flag.advance(.224);
    assert.ok(flag.angle > 0 && flag.angle <= .022);
    flag.advance(.1); assert.equal(flag.angle, 0);
});

test('simultaneous score changes stagger but cancelling before release stays silent', () => {
    const first = new ScoreFlagMotion(), second = new ScoreFlagMotion();
    for (const flag of [first, second]) flag.sync(false);
    first.sync(true); second.sync(true, true, .044);
    first.advance(.05); second.advance(.05);
    assert.ok(first.angle > 0); assert.equal(second.angle, 0);
    assert.equal(second.sync(false), false);
    second.advance(1); assert.equal(second.angle, 0);
    assert.equal(second.consumeImpact(), false);
    first.advance(1); assert.equal(first.angle, Math.PI);
    assert.equal(first.consumeImpact(), true);
});

test('mechanical timing is frame-rate independent and long frames do not lose the strike', () => {
    const run = steps => {
        const flag = new ScoreFlagMotion(); flag.sync(false); flag.sync(true);
        let strikes = 0;
        for (const dt of steps) { flag.advance(dt); strikes += Number(flag.consumeImpact()); }
        return { angle: flag.angle, strikes };
    };
    const fine = run(Array(42).fill(.005)), coarse = run(Array(7).fill(.03));
    assert.ok(Math.abs(fine.angle - coarse.angle) < 1e-10);
    assert.equal(fine.strikes, 1); assert.equal(coarse.strikes, 1);
    assert.deepEqual(run([1]), { angle: Math.PI, strikes: 1 });
});

test('all eight printed flags have independent pivots, clear covers and no remaining lamps', async () => {
    const raw = await readFile(new URL('../public/models/decrypto-console.glb', import.meta.url));
    const gltf = JSON.parse(raw.subarray(20, 20 + raw.readUInt32LE(12)).toString());
    const nodes = new Map(gltf.nodes.map(node => [node.name, node]));
    assert.equal([...nodes.keys()].filter(name => name.startsWith('ScoreLamp_')).length, 0);
    for (const team of ['A', 'B']) for (const category of ['intercept', 'failure']) {
        assert.ok(nodes.has(`ScoreRegister_glass ${team}_${category}`));
        for (let i = 0; i < 2; i++) {
            const key = `${team}_${category}_${i}`;
            const pivot = nodes.get(`ScoreFlag_${key}`);
            assert.ok(pivot);
            const children = pivot.children.map(index => gltf.nodes[index].name);
            assert.ok(children.includes(`ScoreRegister_blade ${key}`));
            assert.ok(children.includes(`ScoreRegister_enamel ${key}`));
            assert.ok(children.includes(`ScoreRegister_mark ${key}_0`));
            for (const side of [-1, 1]) {
                assert.ok(children.includes(`ScoreRegister_folded edge ${key}_${side}`));
                for (const part of ['bushing', 'collar', 'mount foot', 'contact'])
                    assert.ok(nodes.has(`ScoreRegister_${part} ${key}_${side}`));
            }
            assert.equal(pivot.extras.travel_degrees, 180);
        }
    }
});
