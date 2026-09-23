import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/components/console/view.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { consoleRoute, gameFraming, handlePull, handleCommit, inspectionZoom } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('the public preview works in production without exposing development scenarios', () => {
    for (const development of [true, false]) {
        assert.deepEqual(consoleRoute('/', '', development), { view: 'game', scenario: null });
        for (const path of ['/preview', '/preview/']) {
            assert.deepEqual(consoleRoute(path, '', development), { view: 'preview', scenario: 'encrypting' });
        }
    }
    assert.deepEqual(consoleRoute('/', '?preview=late-game', false), { view: 'game', scenario: null });
    assert.deepEqual(consoleRoute('/preview', '?preview=late-game&instruments=tuning', false), { view: 'preview', scenario: 'encrypting' });
    assert.deepEqual(consoleRoute('/preview', '?preview=late-game', true), { view: 'preview', scenario: 'late-game' });
    assert.equal(consoleRoute('/', '?preview=decrypt', true).view, 'game', 'debug fixtures do not unlock the game camera');
});

test('both inward handle gestures turn the machine; taps and outward pulls do not', () => {
    for (const width of [390, 865, 1440, 2560]) {
        for (const side of ['left', 'right']) {
            const direction = side === 'left' ? 1 : -1;
            assert.equal(handlePull(side, 0, width), 0);
            assert.ok(handlePull(side, direction * 4, width) < handleCommit);
            assert.equal(handlePull(side, -direction * 200, width), 0);
            assert.ok(handlePull(side, direction * width * .18, width) >= handleCommit);
            assert.equal(handlePull(side, direction * 10000, width), .65, 'drag remains below a completed turn until release');
        }
    }
});

test('head-on framing fits the chassis across aspect ratios', () => {
    for (const [width, height] of [[865, 863], [1440, 900], [1920, 1080], [1200, 500], [2560, 1080]]) {
        const frame = gameFraming(width, height);
        const top = Math.min(66, height * .14), bottom = Math.min(44, height * .06);
        assert.ok(frame.height >= 10.65 * height / (height - top - bottom));
        assert.ok(frame.height * width / height >= 18.3 * width / (width - 32) - 1e-10);
        assert.ok(Number.isFinite(frame.centerY));
    }
    assert.ok(Number.isFinite(gameFraming(0, 0).height), 'hidden mobile stage never makes an invalid camera');
});

test('wheel zoom supports pixel, line and page deltas and has physical limits', () => {
    assert.ok(inspectionZoom(1, -100) > 1);
    assert.ok(inspectionZoom(1, 100) < 1);
    assert.equal(inspectionZoom(1, 16), inspectionZoom(1, 1, 1));
    assert.equal(inspectionZoom(1, 120), inspectionZoom(1, .2, 2));
    let zoom = 1;
    for (let i = 0; i < 100; i++) zoom = inspectionZoom(zoom, -240);
    assert.equal(zoom, 2.4);
    for (let i = 0; i < 100; i++) zoom = inspectionZoom(zoom, 240);
    assert.equal(zoom, .65);
    assert.ok(Math.abs(inspectionZoom(inspectionZoom(1, -80), 80) - 1) < 1e-10);
});
