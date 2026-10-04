import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/console/view.ts', import.meta.url), 'utf8');
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

test('head-on framing keeps the power switch, feet and handles within the viewport', () => {
    // Extreme points from the exported model, including their depth. Project
    // through the same 28-degree lens so this checks the visible result rather
    // than repeating the fitting formula.
    const landmarks = [[5.831, 5.915, -.85], [7.075, -5.595, -.83], [0, -5.37, .355], [-8.76, 0, .73], [8.76, 0, .73]];
    for (const [width, height] of [[865, 863], [1440, 900], [1920, 1080], [1200, 500], [2560, 1080], [900, 400]]) {
        const frame = gameFraming(width, height);
        const distance = frame.height / (2 * Math.tan(14 * Math.PI / 180));
        for (const [x, y, z] of landmarks) {
            const scale = distance / (distance + 1.25 - z);
            const screenX = width / 2 + x * scale * height / frame.height;
            const screenY = height / 2 - (y - frame.centerY) * scale * height / frame.height;
            assert.ok(screenX >= 16 && screenX <= width - 16, `hardware clears side edges at ${width} × ${height}`);
            assert.ok(screenY >= Math.min(42, height * .09) && screenY <= height - 16,
                `hardware clears navigation and bottom edge at ${width} × ${height}`);
        }
    }
    assert.ok(Number.isFinite(gameFraming(0, 0).height), 'hidden mobile stage never makes an invalid camera');
    assert.ok(Number.isFinite(gameFraming(0, 0).centerY));
});

test('landscape framing uses the space released by the footer hints', () => {
    assert.ok(gameFraming(1920, 1080).height < 11.4, 'desktop machine uses the available height');
    assert.ok(gameFraming(1200, 500).height < 12.2, 'short windows retain a large working surface');
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
