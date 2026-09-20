import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';
import { Quaternion, Vector3 } from 'three';

const source = await readFile(new URL('../src/components/console/mechanics.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { diskInsertPose, diskEjectPose, diskSeatTravel, diskEjectedTravel, diskTailTravel } =
    await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

const run = (pose, from, dt = 16, limit = 4000) => {
    const frames = [];
    for (let t = 0; t <= limit && !frames.at(-1)?.done; t += dt)
        frames.push(pose(t, from));
    return frames;
};

test('manual insertion moves inward through resistance, then settles at the latch', () => {
    const frames = run(diskInsertPose, diskEjectedTravel);
    assert.deepEqual([...new Set(frames.map(f => f.phase))], ['slide', 'grip', 'resistance', 'latch', 'seat']);
    const pushing = frames.filter(f => f.phase !== 'seat');
    for (let i = 1; i < pushing.length; i++)
        assert.ok(pushing[i].travel <= pushing[i - 1].travel, 'the hand never pulls back during insertion');
    assert.ok(Math.abs(frames.filter(f => f.phase === 'slide').at(-1).travel - diskTailTravel) < .01);
    assert.ok(Math.min(...frames.map(f => f.travel)) >= diskSeatTravel - .013, 'latch compression is shallow');
    assert.equal(frames.at(-1).travel, diskSeatTravel);
    assert.ok(frames.at(-1).done);
    assert.ok(frames.length * 16 < 1300);
});

test('insert shortens the glide for a disk that is already partway in', () => {
    const full = run(diskInsertPose, diskEjectedTravel).filter(f => f.phase === 'slide').length;
    const halfway = run(diskInsertPose, -.3).filter(f => f.phase === 'slide').length;
    assert.ok(halfway < full);
    assert.equal(run(diskInsertPose, -.3).at(-1).travel, diskSeatTravel);
});

test('eject holds the disk until the button releases the latch, then stops in the guides', () => {
    const frames = run(diskEjectPose, diskSeatTravel);
    assert.deepEqual([...new Set(frames.map(f => f.phase))], ['press', 'release', 'pop', 'settle']);
    for (const frame of frames.filter(f => ['press', 'release'].includes(f.phase)))
        assert.equal(frame.travel, diskSeatTravel, 'disk waits for manual latch release');
    assert.equal(frames.find(f => f.phase === 'release').button, 1);
    for (let i = 1; i < frames.length; i++) assert.ok(frames[i].travel >= frames[i - 1].travel);
    assert.equal(Math.max(...frames.map(f => f.travel)), diskEjectedTravel, 'no floating overshoot');
    assert.equal(frames.at(-1).button, 0);
    assert.ok(frames.at(-1).done);
});

test('interrupted motions restart from any travel and still settle exactly', () => {
    for (const from of [diskSeatTravel, -.5, 0, .3, diskEjectedTravel + .05]) {
        assert.equal(run(diskInsertPose, from).at(-1).travel, diskSeatTravel);
        assert.equal(run(diskEjectPose, from).at(-1).travel, diskEjectedTravel);
    }
});

test('second push starts at the finger recess and leaves the disk recessed', () => {
    const tailZ = travel => 1.13 + .66 + travel;
    const faceZ = 1.02;
    const grip = diskInsertPose(650, diskEjectedTravel);
    assert.equal(grip.phase, 'grip');
    assert.ok(Math.abs(tailZ(grip.travel) - faceZ) < .015, 'first push reaches the face before regripping');
    assert.equal(diskInsertPose(770, diskEjectedTravel).travel, grip.travel, 'pause at notch precedes second push');
    assert.ok(tailZ(diskSeatTravel) < faceZ - .15, 'tail seats visibly behind the face');
    assert.ok(tailZ(diskSeatTravel) > .812, 'tail stays in front of the inset slot floor');
});

test('exported disk and label lie flat on the guide axis throughout transport', async () => {
    const bytes = await readFile(new URL('../public/models/decrypto-console.glb', import.meta.url));
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const node = name => gltf.nodes.find(n => n.name === name);
    const assembly = node('FloppyTransport');
    const axis = new Vector3().fromArray(assembly.extras.travel_axis);
    assert.ok(axis.distanceTo(new Vector3(0, 0, 1)) < 1e-6, 'motion must follow the face normal, without vertical drift');
    for (const name of ['Floppy disk', 'Floppy paper label', 'Floppy shell lower', 'DriveDetail_shutter left']) {
        const part = node(name);
        const q = new Quaternion().fromArray(part.rotation);
        const longEdge = new Vector3(0, 1, 0).applyQuaternion(q);
        assert.ok(Math.abs(longEdge.dot(axis)) > .99999, `${name} must align with the depth guides`);
        const surfaceNormal = new Vector3(0, 0, 1).applyQuaternion(q);
        assert.ok(surfaceNormal.y > .99999, `${name} must stay horizontal`);
    }
    const upper = node('Floppy disk').translation[1] + assembly.translation[1];
    const lower = node('Floppy shell lower').translation[1] + assembly.translation[1];
    const guidesY = node('DriveDetail_insertion guide -1').translation[1];
    assert.ok(Math.abs((upper + lower) / 2 - guidesY) < .001, 'disk center and guides share the same height');
    const surfaces = JSON.parse(await readFile(new URL('../public/models/console-surfaces.json', import.meta.url), 'utf8'));
    assert.ok(Math.abs(surfaces.disklabel.rotationX + Math.PI / 2) < 1e-8, 'printed overlay follows the flat label');
});
