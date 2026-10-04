import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './load.mjs';

const { spotlightBounds } = await import(await moduleUrl('spotlight'));

test('one focus region includes all visible parts of a function with breathing room', () => {
    const channel = { left: 650, top: 80, width: 180, height: 90 };
    const copy = { left: 850, top: 100, width: 40, height: 40 };
    assert.deepEqual(spotlightBounds([channel, copy], 1000, 700), {
        left: 636, top: 66, width: 268, height: 118,
    });
    assert.deepEqual(spotlightBounds([copy, channel], 1000, 700), spotlightBounds([channel, copy], 1000, 700));
});

test('partially visible targets keep the focus inside the viewport', () => {
    assert.deepEqual(spotlightBounds([{ left: -20, top: -10, width: 140, height: 90 }], 100, 80), {
        left: 4, top: 4, width: 92, height: 72,
    });
    assert.deepEqual(spotlightBounds([{ left: 80, top: 65, width: 30, height: 30 }], 100, 80, 6), {
        left: 74, top: 59, width: 22, height: 17,
    });
});

test('offscreen targets cannot expand a visible focus or create an empty-page mask', () => {
    const visible = { left: 100, top: 80, width: 50, height: 30 };
    const offscreen = [
        { left: -50, top: 80, width: 50, height: 30 },
        { left: 100, top: -30, width: 50, height: 30 },
        { left: 500, top: 80, width: 50, height: 30 },
        { left: 100, top: 400, width: 50, height: 30 },
    ];
    assert.equal(spotlightBounds([], 500, 400), null);
    assert.equal(spotlightBounds(offscreen, 500, 400), null);
    assert.deepEqual(spotlightBounds([visible, ...offscreen], 500, 400), spotlightBounds([visible], 500, 400));
});

test('invalid projection and zero-sized controls cannot poison a valid focus', () => {
    const visible = { left: 100, top: 80, width: 50, height: 30 };
    const invalid = [
        { ...visible, left: NaN },
        { ...visible, top: Infinity },
        { ...visible, width: Infinity },
        { ...visible, height: -1 },
        { ...visible, width: 0 },
    ];
    assert.equal(spotlightBounds(invalid, 500, 400), null);
    assert.deepEqual(spotlightBounds([...invalid, visible], 500, 400), spotlightBounds([visible], 500, 400));
});

test('a viewport too small for an inset focus produces no unusable mask', () => {
    const target = { left: 0, top: 0, width: 100, height: 100 };
    for (const [width, height] of [[0, 0], [8, 100], [100, 8]]) {
        assert.equal(spotlightBounds([target], width, height), null);
    }
});
