import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';

const modules = new Map();
async function moduleUrl(name) {
    if (modules.has(name)) return modules.get(name);
    let js = ts.transpileModule(await readFile(new URL(`../src/components/console/${name}.ts`, import.meta.url), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    }).outputText;
    for (const [, dependency] of [...js.matchAll(/from '\.\/(\w+)'/g)])
        js = js.replaceAll(`from './${dependency}'`, `from '${await moduleUrl(dependency)}'`);
    js = js.replaceAll("from 'three'", `from '${import.meta.resolve('three')}'`)
        .replaceAll("from 'three/addons/utils/BufferGeometryUtils.js'", `from '${import.meta.resolve('three/addons/utils/BufferGeometryUtils.js')}'`);
    const url = `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
    modules.set(name, url);
    return url;
}
const { consoleHardware, hardwareRecovery, terminalView, initialLocal, previewState, keyDiskIdentity,
    keyDiskReadable, syncDiskPower, advanceKeyDisk, draftIdentity } = await import(await moduleUrl('model'));

test('all supply combinations respect DC priority, series cells and the physical switch', () => {
    for (const powerOn of [false, true]) for (let unpluggedCables = 0; unpluggedCables < 8; unpluggedCables++) {
        for (let removedBatteries = 0; removedBatteries < 16; removedBatteries++) {
            const local = { ...initialLocal, powerOn, unpluggedCables, removedBatteries };
            const h = consoleHardware(local);
            const external = !(unpluggedCables & 4), supplied = external || removedBatteries === 0;
            assert.equal(h.powered, powerOn && supplied);
            assert.equal(h.supply, external ? 'external' : supplied ? 'battery' : 'none');
            assert.equal(h.online, h.powered && !(unpluggedCables & 1));
            assert.equal(h.auxAvailable, h.powered && !(unpluggedCables & 2));
            assert.equal(local.powerOn, powerOn, 'losing power never moves the physical switch');
        }
    }
    assert.equal(consoleHardware(initialLocal, { connected: false }).online, false);
    assert.equal(consoleHardware(initialLocal, { connected: true, recovering: true }).online, false);
});

test('recovery repairs one cause at a time without changing the other plugs or the switch', () => {
    const local = { ...initialLocal, powerOn: false, unpluggedCables: 7, removedBatteries: 1 };
    assert.equal(hardwareRecovery(local).id, 'restore-power');
    local.unpluggedCables &= ~4;
    assert.equal(hardwareRecovery(local).id, 'restore-switch');
    local.powerOn = true;
    assert.equal(hardwareRecovery(local).id, 'restore-link');
    local.unpluggedCables &= ~1;
    assert.equal(hardwareRecovery(local), null);
    assert.equal(consoleHardware(local).auxAvailable, false);
});

test('offline presentation holds public records but immediately revokes expired private information', () => {
    const held = previewState({}, 'encrypting');
    const local = { ...initialLocal, unpluggedCables: 1 };
    assert.deepEqual(terminalView(held, held, local).secretDigits, held.secretDigits);
    const next = { ...held, round: held.round + 1, secretDigits: [1, 2, 4], scoreA: { interceptions: 2, decrypt_failures: 0 }, history: [] };
    const offline = terminalView(next, held, local);
    assert.equal(offline.round, held.round);
    assert.equal(offline.scoreA, held.scoreA);
    assert.equal(offline.history, held.history);
    assert.deepEqual(offline.secretDigits, []);
    assert.notEqual(draftIdentity(next), draftIdentity(held));
    for (const changed of [{ myTeam: 'B' }, { myPlayerID: 'new-seat' }, { roomCode: '9999' }, { myWords: ['new'] }])
        assert.deepEqual(terminalView({ ...next, ...changed }, held, local).myWords, []);
    assert.deepEqual(terminalView({ ...held, myRole: 'observer' }, held, local).secretDigits, []);
    assert.equal(terminalView(next, held, initialLocal), next, 'restoring presents the latest snapshot directly');
    assert.equal(terminalView({ ...next, connected: false }, held, initialLocal).round, held.round, 'plugging in is not proof of a real connection');
});

test('read-head progress pauses across an arbitrarily long outage and resumes without exposing a stale key', () => {
    const s = previewState({}, 'encrypting');
    const disk = { id: keyDiskIdentity(s), phase: 'reading', startedAt: 100 };
    const paused = syncDiskPower(disk, false, 200);
    assert.equal(advanceKeyDisk(paused, 100000, true), paused);
    const resumed = syncDiskPower(paused, true, 100200);
    assert.equal(advanceKeyDisk(resumed, 100519).phase, 'reading');
    const ready = advanceKeyDisk(resumed, 100520);
    assert.equal(ready.phase, 'ready');
    assert.equal(keyDiskReadable(s, { ...initialLocal, keyDisk: ready, unpluggedCables: 1 }), true);
    assert.equal(keyDiskReadable(s, { ...initialLocal, keyDisk: ready, unpluggedCables: 4, removedBatteries: 1 }), false);
    assert.equal(keyDiskReadable({ ...s, round: s.round + 1 }, { ...initialLocal, keyDisk: ready }), false);
    assert.equal(syncDiskPower(ready, false, 100521).phase, 'reading');
    assert.equal(syncDiskPower({ ...paused, phase: 'ejecting' }, false, 100521).pausedAt, undefined, 'spring ejection is mechanical');
});

test('production receiver loses both AUTO and MAN signals through AUX and retains dial positions', async () => {
    const { ConsoleInstruments } = await import(await moduleUrl('instruments'));
    const root = new THREE.Group(), receiver = new THREE.Group();
    receiver.name = 'Instrument_signal'; root.add(receiver);
    for (const name of ['SignalNeedle', 'SignalTuning', 'SignalGain', 'SignalSweep']) {
        const part = new THREE.Group(); part.name = name; receiver.add(part);
    }
    const instrument = new ConsoleInstruments(root, undefined, () => .7);
    for (const instrumentDemo of [true, false]) {
        const local = { ...initialLocal, instrumentDemo, meterAmplitude: 21, meterRate: 3 };
        instrument.update(local); instrument.tick(1000, 1, true);
        const signal = receiver.getObjectByName('SignalNeedle').rotation.z;
        const dial = receiver.getObjectByName('SignalTuning').rotation.z;
        instrument.update({ ...local, unpluggedCables: 2 }); instrument.tick(2000, 1, true);
        assert.ok(receiver.getObjectByName('SignalNeedle').rotation.z > signal);
        assert.equal(receiver.getObjectByName('SignalTuning').rotation.z, dial);
        instrument.update({ ...local, unpluggedCables: 1 }); instrument.tick(3000, 1, true);
        assert.equal(receiver.getObjectByName('SignalNeedle').rotation.z, signal, 'RJ45 does not gate the auxiliary receiver');
        instrument.update({ ...local, unpluggedCables: 4, removedBatteries: 1 }); instrument.tick(4000, 1, true);
        assert.equal(receiver.getObjectByName('SignalNeedle').rotation.z, 1.08);
    }
});

test('feed and refill stop without electricity while a hand tear can finish', async () => {
    const { ReceiptTransport } = await import(await moduleUrl('tearing'));
    const paper = new ReceiptTransport();
    paper.sync(true, 4); paper.advance(100);
    const length = paper.length, travel = paper.feedTravel;
    paper.advance(10000, true, false);
    assert.equal(paper.length, length); assert.equal(paper.feedTravel, travel);
    paper.advance(10000, true, true); assert.equal(paper.phase, 'reading');
    paper.sync(false); paper.advance(10000, true, false);
    assert.equal(paper.phase, 'refilling'); assert.equal(paper.leaderProgress, 0);
    paper.advance(10000, true, false); assert.equal(paper.phase, 'refilling');
    paper.advance(10000, true, true); assert.equal(paper.phase, 'idle');
});
