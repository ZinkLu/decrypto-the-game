import assert from 'node:assert/strict';
import test from 'node:test';
import { moduleUrl } from './load.mjs';

const { stepNotebookHinge, notebookPaperBend } = await import(await moduleUrl('page-turn'));

test('a paper turn settles in about 800 ms without overshoot', () => {
  for (const target of [0, 1]) {
    let hinge = { position: 1 - target, velocity: 0 };
    let previous = hinge.position;
    let frames = 0;
    do {
      hinge = stepNotebookHinge(hinge, target, 1 / 60);
      assert.ok(hinge.position >= 0 && hinge.position <= 1);
      assert.ok(target ? hinge.position >= previous : hinge.position <= previous);
      previous = hinge.position;
    } while (++frames < 90 && hinge.position !== target);
    assert.deepEqual(hinge, { position: target, velocity: 0 });
    assert.ok(frames >= 40 && frames <= 54, `settled in ${frames / 60} s`);
  }
});

test('the sheet stays attached to its clip and does not stretch as the free edge curls', () => {
  for (const position of [0, .05, .2, .5, .8, 1]) {
    const strips = notebookPaperBend(position, 640);
    assert.equal(strips[0].y, 0);
    assert.equal(strips[0].z, 0);
    assert.ok(Math.abs(strips.reduce((sum, strip) => sum + strip.length, 0) - 640) < 1e-8);
    for (let i = 1; i < strips.length; i++) {
      const previous = strips[i - 1];
      assert.ok(Math.abs(strips[i].y - previous.y - Math.cos(previous.angle) * previous.length) < 1e-8);
      assert.ok(Math.abs(strips[i].z - previous.z - Math.sin(previous.angle) * previous.length) < 1e-8);
      assert.ok(strips[i].angle >= previous.angle);
    }
    assert.ok(strips.every(strip => strip.angle >= 0 && strip.angle <= Math.PI));
  }
  assert.ok(notebookPaperBend(.2, 640).at(-1).angle > notebookPaperBend(.2, 640)[0].angle * 2);
});

test('both resting sheets are flat and the same pose can reverse without a geometric jump', () => {
  for (const position of [0, 1]) {
    const strips = notebookPaperBend(position, 520);
    assert.ok(strips.every(strip => Math.abs(strip.z) < 1e-8));
    assert.ok(strips.every(strip => strip.angle === position * Math.PI));
  }
  const before = notebookPaperBend(.4, 520);
  const after = notebookPaperBend(.4001, 520);
  assert.ok(before.every((strip, i) => Math.hypot(strip.y - after[i].y, strip.z - after[i].z) < 1));
});

test('rapid reversals retain momentum and settle at the final requested page', () => {
  let hinge = { position: 0, velocity: 0 };
  for (let frame = 0; frame < 15; frame++) hinge = stepNotebookHinge(hinge, 1, 1 / 60);
  const before = hinge;
  hinge = stepNotebookHinge(hinge, 0, 1 / 600);
  assert.ok(Math.abs(hinge.position - before.position) < .01, 'reversing keeps the sheet continuous');
  for (let frame = 0; frame < 150; frame++) {
    hinge = stepNotebookHinge(hinge, frame < 50 ? frame % 2 : 0, 1 / 60);
    assert.ok(hinge.position >= 0 && hinge.position <= 1);
    assert.ok(Number.isFinite(hinge.velocity));
  }
  assert.deepEqual(hinge, { position: 0, velocity: 0 });
});

test('suspended frames are bounded and invalid elapsed time cannot move a sheet', () => {
  const hinge = { position: .4, velocity: 2 };
  for (const elapsed of [0, -1, NaN, Infinity]) assert.deepEqual(stepNotebookHinge(hinge, 1, elapsed), hinge);
  assert.deepEqual(stepNotebookHinge(hinge, 1, 60), stepNotebookHinge(hinge, 1, .05));
});

test('the hinge gives the same position at 30, 60 and 120 Hz', () => {
  const positions = [30, 60, 120].map(frequency => {
    let hinge = { position: 0, velocity: 0 };
    for (let frame = 0; frame < frequency / 3; frame++) hinge = stepNotebookHinge(hinge, 1, 1 / frequency);
    return hinge.position;
  });
  assert.ok(Math.max(...positions) - Math.min(...positions) < 1e-10);
});
