import assert from 'node:assert/strict';
import test from 'node:test';
import { moduleUrl } from './load.mjs';

const { containNote, moveNote, placeNote } = await import(await moduleUrl('notebook-writing'));

test('writing at the bottom or right edge keeps the complete note on paper', () => {
    assert.deepEqual(containNote({ x: 99, y: 97 }, { x: 48, y: 18 }), { x: 50, y: 80 });
    assert.deepEqual(containNote({ x: -10, y: -20 }, { x: 48, y: 18 }), { x: 2, y: 2 });
    assert.deepEqual(containNote({ x: 30, y: 40 }, { x: 48, y: 18 }), { x: 30, y: 40 });
});

test('drag keeps the original grab offset and clamps at every paper edge', () => {
    const origin = { x: 25, y: 50 }, start = { x: 34, y: 53 }, size = { x: 48, y: 12 };
    assert.deepEqual(moveNote(origin, start, { x: 44, y: 49 }, size), { x: 35, y: 46 });
    assert.deepEqual(moveNote(origin, start, { x: 200, y: 200 }, size), { x: 50, y: 86 });
    assert.deepEqual(moveNote(origin, start, { x: -20, y: -20 }, size), { x: 2, y: 2 });
});

test('growing text or resizing paper moves only a note that would overflow', () => {
    const position = { x: 42, y: 86 };
    assert.deepEqual(containNote(position, { x: 44, y: 8 }), position);
    assert.deepEqual(containNote(position, { x: 48, y: 24 }), { x: 42, y: 74 });
    assert.deepEqual(containNote({ x: NaN, y: Infinity }, { x: 48, y: 8 }), { x: 2, y: 2 });
});

test('right-side notes shrink to keep their text origin at the click', () => {
    assert.deepEqual(placeNote({ x: 65, y: 40 }, 450), { x: 65, y: 40, width: 33 });
    assert.deepEqual(placeNote({ x: 76, y: 40 }, 450), { x: 76, y: 40, width: 22 });
    assert.deepEqual(placeNote({ x: 95, y: 40 }, 450), { x: 76, y: 40, width: 22 });
    assert.deepEqual(placeNote({ x: 65, y: 40 }, 300), { x: 65, y: 40, width: 33 });
    assert.deepEqual(placeNote({ x: 85, y: 40 }, 300), { x: 68, y: 40, width: 30 });
    const note = placeNote({ x: 65, y: 40 }, 450);
    assert.deepEqual(moveNote(note, { x: 70, y: 42 }, { x: 72, y: 60 }, { x: note.width, y: 6 }), { x: 65, y: 58 });
});
