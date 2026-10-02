import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';
const load = async name => {
    const source = await readFile(new URL(`../src/console/${name}.ts`, import.meta.url), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
    return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
};
const { initialLocal, previewState, emptyKeyDisk, keyDiskIdentity, keyDiskReadable, syncKeyDisk, syncDiskPresentation, syncDiskPower, advanceKeyDisk, actKeyDisk, pullKeyDisk, releaseKeyDisk, keyDiskDurations } = await load('model');
const { keyDiskPose, diskSeatTravel, diskEjectedTravel, diskRemovedTravel } = await load('mechanics');
const state = previewState({}, 'encrypting');
const id = keyDiskIdentity(state);
const readable = (keyDisk, s = state, extra = {}) => keyDiskReadable(s, { ...initialLocal, keyDisk, ...extra });

test('only the encryptor receives a valid key for their room, seat, team and round', () => {
    assert.ok(id);
    for (const myRole of ['teammate', 'opponent', 'observer', '']) assert.equal(keyDiskIdentity({ ...state, myRole }), '');
    for (const phase of ['home', 'room', 'round_result', 'game_over']) assert.equal(keyDiskIdentity({ ...state, phase }), '');
    for (const secretDigits of [[], [1, 2], [1, 1, 2], [0, 2, 3], [2, 3, 5]]) assert.equal(keyDiskIdentity({ ...state, secretDigits }), '');
    for (const change of [{ roomCode: 'other' }, { myPlayerID: 'other' }, { myTeam: 'B' }, { round: state.round + 1 }, { secretDigits: [1, 2, 3] }]) {
        assert.notEqual(keyDiskIdentity({ ...state, ...change }), id);
        assert.equal(readable({ id, phase: 'ready', startedAt: 0 }, { ...state, ...change }), false, 'old key is revoked before effects run');
    }
});

test('delivery waits for a surface, then shows no secret until both pushes and the read finish', () => {
    let disk = syncKeyDisk(emptyKeyDisk, id, 0, false, false);
    assert.equal(disk.phase, 'queued');
    disk = syncKeyDisk(disk, id, 100, true, false);
    let now = 100;
    for (const phase of ['arriving', 'inserting', 'reading']) {
        assert.equal(disk.phase, phase);
        assert.equal(readable(disk), false);
        const duration = keyDiskDurations[phase];
        assert.equal(advanceKeyDisk(disk, now + duration - 1), disk);
        now += duration;
        disk = advanceKeyDisk(disk, now);
    }
    assert.equal(disk.phase, 'ready');
    assert.equal(readable(disk), true);
    assert.equal(readable(disk, state, { powerOn: false }), false);
    assert.equal(readable(disk, state, { diskOut: true }), false);
});

test('the encryptor introduction waits for a surface and finishes before ordinary delivery', () => {
    let disk = syncKeyDisk(emptyKeyDisk, id, 0, false, false, true);
    assert.equal(disk.phase, 'queued');
    disk = syncKeyDisk(disk, id, 100, true, false, true);
    assert.equal(disk.phase, 'announcing');
    assert.equal(readable(disk), false, 'the close-up must not reveal the password');
    assert.equal(keyDiskDurations.announcing, 2400);
    assert.equal(advanceKeyDisk(disk, 2499), disk);
    const arriving = advanceKeyDisk(disk, 2500);
    assert.equal(arriving.phase, 'arriving');
    assert.equal(arriving.startedAt, 2500);
    assert.equal(readable(arriving), false);
    assert.equal(advanceKeyDisk(arriving, 2500 + keyDiskDurations.arriving).phase, 'inserting');
});

test('reduced motion keeps the role introduction readable for the full duration', () => {
    const disk = syncKeyDisk(emptyKeyDisk, id, 100, true, true, true);
    assert.equal(disk.phase, 'announcing');
    assert.equal(readable(disk), false);
    assert.equal(advanceKeyDisk(disk, 100, true), disk);
    assert.equal(advanceKeyDisk(disk, 2499, true), disk);
    const ready = advanceKeyDisk(disk, 2500, true);
    assert.equal(ready.phase, 'ready');
    assert.equal(readable(ready), true);
});

test('background, obscured and offline role introductions preserve their remaining reading time', () => {
    for (const reduced of [false, true]) {
        const intro = syncKeyDisk(emptyKeyDisk, id, 100, true, reduced, true);
        const paused = syncDiskPresentation(intro, false, 700);
        assert.equal(paused.pausedAt, 700);
        assert.equal(paused.phase, 'announcing');
        assert.equal(readable(paused), false);
        assert.equal(syncDiskPresentation(paused, false, 60000), paused, 'repeated hidden updates preserve the pause start');
        assert.equal(syncDiskPower(paused, false, 60000), paused, 'power loss cannot clear a presentation pause');
        assert.equal(syncDiskPower(paused, true, 60000), paused, 'power restoration cannot consume a presentation pause');
        assert.equal(advanceKeyDisk(paused, 60000, reduced), paused);
        const resumed = syncDiskPresentation(paused, true, 10000);
        assert.equal(resumed.pausedAt, undefined);
        assert.equal(10000 - resumed.startedAt, 600, 'only the visible 600 ms count');
        assert.equal(advanceKeyDisk(resumed, 11799, reduced), resumed);
        assert.equal(advanceKeyDisk(resumed, 11800, reduced).phase, reduced ? 'ready' : 'arriving');
        assert.equal(syncKeyDisk(paused, '', 9000, false, reduced, true), emptyKeyDisk, 'ownership revocation still removes a paused introduction');
    }
});

test('a role received behind a dialog starts its full introduction when it becomes visible', () => {
    for (const reduced of [false, true]) {
        const queued = syncKeyDisk(emptyKeyDisk, id, 100, false, reduced, true);
        assert.equal(queued.phase, 'queued');
        assert.equal(advanceKeyDisk(queued, 60000, reduced), queued);
        const intro = syncKeyDisk(queued, id, 60000, true, reduced, true);
        assert.equal(intro.phase, 'announcing');
        assert.equal(intro.startedAt, 60000);
        assert.equal(advanceKeyDisk(intro, 62399, reduced), intro);
        assert.equal(readable(intro), false);
        assert.equal(advanceKeyDisk(intro, 62400, reduced).phase, reduced ? 'ready' : 'arriving');
    }
});

test('a role introduction does not restart on updates or reinsertion and is revoked with its identity', () => {
    const intro = syncKeyDisk(emptyKeyDisk, id, 100, true, false, true);
    assert.equal(syncKeyDisk(intro, id, 200, true, false, true), intro);
    assert.equal(syncKeyDisk(intro, '', 200, true, false, true), emptyKeyDisk);
    const nextID = keyDiskIdentity({ ...state, round: state.round + 1 });
    const nextIntro = syncKeyDisk(intro, nextID, 200, true, false, true);
    assert.equal(nextIntro.id, nextID);
    assert.equal(nextIntro.phase, 'announcing');
    assert.equal(nextIntro.startedAt, 200);
    for (const phase of ['arriving', 'inserting', 'reading', 'ready', 'ejected', 'removed', 'returning']) {
        const delivered = { id, phase, startedAt: 100 };
        assert.equal(syncKeyDisk(delivered, id, 200, true, false, true), delivered);
    }
    for (const phase of ['intercept', 'decrypt']) {
        const resumedID = keyDiskIdentity({ ...state, phase });
        assert.equal(syncKeyDisk(emptyKeyDisk, resumedID, 100, true, false, false).phase, 'arriving');
    }
});

test('a disk without an authorized identity stays invisible in every mechanical phase', () => {
    for (const phase of ['absent', 'queued', 'announcing', 'arriving', 'inserting', 'reading', 'ready', 'ejecting', 'ejected', 'removed', 'returning', 'pulling', 'settling']) {
        assert.equal(keyDiskPose({ id: '', phase, startedAt: 0 }, 500).visible, false, phase);
        assert.equal(keyDiskPose({ id: '', phase, startedAt: 0 }, 500, true).visible, false, `${phase}, reduced motion`);
    }
});

test('eject conceals immediately; refreshes, translations and phase changes do not auto-reinsert', () => {
    let disk = actKeyDisk({ id, phase: 'ready', startedAt: 0 }, true, 100);
    assert.equal(disk.phase, 'ejecting');
    assert.equal(readable(disk), false);
    assert.equal(actKeyDisk(disk, false, 110), disk, 'rapid clicks cannot reverse the spring');
    disk = advanceKeyDisk(disk, 720);
    assert.equal(disk.phase, 'ejected');
    for (const change of [{}, { encryptor: 'You' }, { phase: 'intercept' }, { phase: 'decrypt', waiting: true }, { recovering: true }]) {
        assert.equal(syncKeyDisk(disk, keyDiskIdentity({ ...state, ...change }), 900, true, false), disk);
    }
    disk = actKeyDisk(disk, false, 1000);
    assert.equal(disk.phase, 'inserting');
    assert.equal(readable(disk), false);
    disk = advanceKeyDisk(disk, 2195);
    assert.equal(disk.phase, 'reading');
    assert.equal(readable(disk), false);
    assert.equal(readable(advanceKeyDisk(disk, 2615)), true);
});

test('an eject during reading cancels reveal and role/round changes revoke the old key', () => {
    const reading = { id, phase: 'reading', startedAt: 0 };
    const ejected = actKeyDisk(reading, true, 200);
    assert.equal(readable(advanceKeyDisk(ejected, 420)), false);
    assert.equal(advanceKeyDisk(ejected, 900).phase, 'ejected');
    assert.equal(syncKeyDisk(reading, '', 210, true, false), emptyKeyDisk);
    const next = { ...state, round: state.round + 1 };
    const delivered = syncKeyDisk(reading, keyDiskIdentity(next), 210, true, false);
    assert.equal(delivered.phase, 'arriving');
    assert.equal(readable(delivered, next), false);
});

test('reduced motion settles without waiting and background pauses cannot reveal before seating', () => {
    const disk = syncKeyDisk(emptyKeyDisk, id, 0, true, true);
    assert.equal(readable(disk), true);
    assert.equal(actKeyDisk(disk, true, 100, true).phase, 'ejected');
    assert.equal(actKeyDisk({ ...disk, phase: 'ejected' }, false, 200, true).phase, 'ready');
    assert.equal(advanceKeyDisk({ ...disk, phase: 'inserting' }, 5, true).phase, 'ready');
    const resumed = advanceKeyDisk({ ...disk, phase: 'arriving' }, 60000);
    assert.equal(resumed.phase, 'inserting');
    assert.equal(resumed.startedAt, 60000);
    assert.equal(readable(resumed), false);
});

test('delivery aligns fully before entering guides and geometry is seated before reading', () => {
    const disk = { id, phase: 'arriving', startedAt: 0 };
    const presented = keyDiskPose(disk, 500);
    assert.ok(presented.tilt > 0 && presented.z > 0, 'label faces the player outside the drive');
    const aligned = keyDiskPose(disk, keyDiskDurations.arriving);
    assert.equal(aligned.tilt, 0); assert.equal(aligned.x, 0); assert.equal(aligned.y, 0); assert.equal(aligned.z, 0);
    assert.equal(aligned.travel, diskEjectedTravel);
    for (let t = 0; t < keyDiskDurations.inserting; t += 16) {
        const pose = keyDiskPose({ ...disk, phase: 'inserting' }, t);
        assert.equal(pose.tilt, 0); assert.equal(pose.x, 0); assert.equal(pose.y, 0); assert.equal(pose.z, 0);
    }
    assert.equal(keyDiskPose({ ...disk, phase: 'inserting' }, keyDiskDurations.inserting).travel, diskSeatTravel);
    assert.equal(keyDiskPose({ ...disk, phase: 'ejecting' }, keyDiskDurations.ejecting).travel, diskEjectedTravel);
    assert.equal(keyDiskPose(emptyKeyDisk, 0).visible, false);
});


test('manual pulling revokes the key immediately and release starts at the hand position', () => {
    const ready = { id, phase: 'ready', startedAt: 0 };
    const pulled = pullKeyDisk(ready, .68, 100);
    assert.equal(readable(pulled), false);
    const held = keyDiskPose(pulled, 500);
    assert.ok(held.travel > diskSeatTravel && held.travel < diskEjectedTravel);
    const released = releaseKeyDisk(pulled, false, 500);
    assert.equal(released.phase, 'settling');
    assert.equal(keyDiskPose(released, 500).travel, held.travel);
    assert.equal(keyDiskPose(released, 720).travel, diskEjectedTravel);
    assert.equal(advanceKeyDisk(released, 720).phase, 'ejected');
    assert.equal(readable(advanceKeyDisk(released, 720)), false);
});

test('short pulls and cancelled gestures settle safely, then reread before revealing', () => {
    const ready = { id, phase: 'ready', startedAt: 0 };
    for (const [amount, cancelled] of [[.2, false], [.9, true]]) {
        const pulled = pullKeyDisk(ready, amount, 100);
        const released = releaseKeyDisk(pulled, cancelled, 200);
        assert.equal(released.pull.target, 0);
        assert.equal(readable(released), false);
        assert.equal(keyDiskPose(released, 420).travel, diskSeatTravel);
        const reading = advanceKeyDisk(released, 420);
        assert.equal(reading.phase, 'reading');
        assert.equal(readable(reading), false);
        assert.equal(readable(advanceKeyDisk(reading, 840)), true);
    }
    const pushed = pullKeyDisk({ id, phase: 'ejected', startedAt: 0 }, .2, 100);
    assert.equal(advanceKeyDisk(releaseKeyDisk(pushed, false, 200), 420).phase, 'reading');
    assert.equal(advanceKeyDisk(releaseKeyDisk(pushed, true, 200), 420).phase, 'ejected');
});

test('manual travel has end stops, cannot interrupt insertion, and respects reduced motion', () => {
    const ready = { id, phase: 'ready', startedAt: 0 };
    assert.equal(pullKeyDisk(ready, -2, 1).pull.amount, 0);
    assert.equal(pullKeyDisk(ready, 3, 1).pull.amount, 2);
    assert.equal(pullKeyDisk(ready, NaN, 1), ready);
    for (const phase of ['absent', 'queued', 'announcing', 'arriving', 'returning', 'inserting', 'ejecting', 'settling']) {
        const busy = { ...ready, phase };
        assert.equal(pullKeyDisk(busy, .8, 100), busy);
    }
    const pulled = pullKeyDisk(ready, .7, 100);
    assert.equal(releaseKeyDisk(pulled, false, 200, true).phase, 'ejected');
    assert.equal(releaseKeyDisk(pulled, true, 200, true).phase, 'reading');
    assert.equal(readable(pulled, { ...state, round: state.round + 1 }), false);
    assert.equal(syncKeyDisk(pulled, '', 110, true, false), emptyKeyDisk);
});

test('an ejected disk can be fully removed and reinserted without an early reveal', () => {
    const ejected = { id, phase: 'ejected', startedAt: 0 };
    const pulled = pullKeyDisk(ejected, 1.8, 100);
    const held = keyDiskPose(pulled, 100);
    assert.ok(held.travel > diskEjectedTravel);
    assert.ok(held.tilt > 0, 'the label lifts only after clearing the guides');
    const settling = releaseKeyDisk(pulled, false, 200);
    assert.equal(settling.pull.target, 2);
    assert.equal(keyDiskPose(settling, 200).travel, held.travel);
    const removed = advanceKeyDisk(settling, 420);
    assert.equal(removed.phase, 'removed');
    assert.equal(keyDiskPose(removed, 420).travel, diskRemovedTravel);
    assert.equal(readable(removed), false);
    const returning = actKeyDisk(removed, false, 500);
    assert.equal(returning.phase, 'returning');
    assert.deepEqual(keyDiskPose(returning, 500), keyDiskPose(removed, 500));
    const inserting = advanceKeyDisk(returning, 820);
    assert.equal(keyDiskPose(returning, 820).travel, keyDiskPose(inserting, 820).travel);
    assert.equal(keyDiskPose(returning, 820).tilt, 0);
    const reading = advanceKeyDisk(inserting, 2015);
    assert.equal(readable(reading), false);
    assert.equal(readable(advanceKeyDisk(reading, 2435)), true);
    assert.equal(releaseKeyDisk(pulled, false, 200, true).phase, 'removed');
    assert.equal(actKeyDisk(removed, false, 500, true).phase, 'ready');
});

test('removed disks can be pushed back in or returned to the hand after cancellation', () => {
    const removed = { id, phase: 'removed', startedAt: 0 };
    const pushed = pullKeyDisk(removed, .2, 100);
    assert.equal(advanceKeyDisk(releaseKeyDisk(pushed, false, 200), 420).phase, 'reading');
    assert.equal(advanceKeyDisk(releaseKeyDisk(pushed, true, 200), 420).phase, 'removed');
    const ejected = { ...removed, phase: 'ejected' };
    assert.equal(releaseKeyDisk(pullKeyDisk(ejected, 1.9, 100), true, 200, true).phase, 'ejected');
});
