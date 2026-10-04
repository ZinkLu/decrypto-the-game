import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './load.mjs';

const { partialFrame, stillAfterFullFrame, growRect, clipRect, rectFromNdc, mergeRects } = await import(await moduleUrl('partialFrame'));

const still = { enabled: true, stillValid: true, changed: false, dirty: false, probing: false, shadowPending: false };

test('a frame is partial only when nothing but the registered regions could change', () => {
  assert.equal(partialFrame(still), true, 'a plain ambient frame over a valid copy is partial');
  assert.equal(partialFrame({ ...still, enabled: false }), false, 'the runtime switch forces full frames');
  assert.equal(partialFrame({ ...still, stillValid: false }), false, 'without a copy of the last full frame there is nothing to put back');
  for (const key of ['changed', 'dirty', 'probing', 'shadowPending'])
    assert.equal(partialFrame({ ...still, [key]: true }), false, `${key} asks for a full frame`);
});

test('a full frame is copied only when the picture is about to stand still', () => {
  assert.equal(stillAfterFullFrame(false, false), true);
  assert.equal(stillAfterFullFrame(true, false), false, 'frames that carry motion are never copied');
  assert.equal(stillAfterFullFrame(false, true), false, 'measurement frames are never copied');
  assert.equal(stillAfterFullFrame(true, true), false);
});

test('rectangles grow, clip to the canvas, and drop when empty', () => {
  assert.deepEqual(growRect([10, 20, 30, 40], 6), [4, 14, 36, 46]);
  assert.deepEqual(clipRect([4, 14, 36, 46], 100, 100), [4, 14, 36, 46]);
  assert.deepEqual(clipRect([-10, -20, 30, 40], 100, 100), [0, 0, 30, 40], 'straddling rectangles are clamped');
  assert.deepEqual(clipRect([90, 90, 140, 140], 100, 100), [90, 90, 100, 100]);
  assert.equal(clipRect([-40, 0, -10, 50], 100, 100), null, 'fully outside one side drops the rectangle');
  assert.equal(clipRect([0, 100, 50, 140], 100, 100), null);
  assert.equal(clipRect([10, 10, 10, 20], 100, 100), null, 'an empty rectangle is dropped');
});

test('the canvas rectangle of projected corners is padded, clipped, and y grows up', () => {
  const square = [[-.5, -.5, 0], [.5, -.5, 0], [-.5, .5, 0], [.5, .5, 0]];
  assert.deepEqual(rectFromNdc(square, 100, 100, 0), [25, 25, 75, 75], 'NDC maps to CSS pixels, origin bottom-left');
  assert.deepEqual(rectFromNdc(square, 100, 100, 6), [19, 19, 81, 81], 'each side grows by the pad');
  assert.deepEqual(rectFromNdc([[.9, .9, 0], [1, 1, 0]], 100, 100, 6), [89, 89, 100, 100], 'the pad is clipped to the canvas');
  assert.equal(rectFromNdc([[1.2, 0, 0], [1.4, .2, 0]], 100, 100, 6), null, 'fully off-screen drops the rectangle');
  assert.equal(rectFromNdc([[0, 0, 1.5], [.5, .5, 2]], 100, 100, 6), null, 'entirely behind the camera drops the rectangle');
  assert.equal(rectFromNdc([], 100, 100, 6), null);
  assert.deepEqual(rectFromNdc([[0, 0, 0], [.1, .1, 1.5]], 100, 100, 6), [0, 0, 100, 100],
    'an object crossing the camera plane cannot be bounded and covers the canvas');
});

test('overlapping or touching rectangles merge, disjoint ones stay', () => {
  assert.deepEqual(mergeRects([]), []);
  assert.deepEqual(mergeRects([[0, 0, 10, 10]]), [[0, 0, 10, 10]]);
  assert.deepEqual(mergeRects([[0, 0, 10, 10], [5, 5, 15, 15]]), [[0, 0, 15, 15]], 'overlap');
  assert.deepEqual(mergeRects([[0, 0, 10, 10], [10, 0, 20, 10]]), [[0, 0, 20, 10]], 'touching edges merge');
  assert.deepEqual(mergeRects([[0, 0, 10, 10], [20, 20, 30, 30]]).length, 2, 'disjoint rectangles stay separate');
  assert.deepEqual(mergeRects([[0, 0, 10, 10], [20, 0, 30, 10], [8, 0, 22, 10]]), [[0, 0, 30, 10]],
    'a bridge merges transitively');
  const input = [[0, 0, 10, 10], [5, 5, 15, 15]];
  mergeRects(input);
  assert.deepEqual(input, [[0, 0, 10, 10], [5, 5, 15, 15]], 'the input is not mutated');
});
