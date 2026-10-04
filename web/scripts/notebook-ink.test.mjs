import assert from 'node:assert/strict';
import test from 'node:test';
import { moduleUrl } from './load.mjs';

const { appendInkPoints, inkPointerSamples } = await import(await moduleUrl('notebook-ink'));
const toPaper = samples => samples.map(({ clientX: x, clientY: y }) => ({ x, y }));

test('a quick press and release records the endpoint even without a move event', () => {
    const down = [{ x: 40, y: 60 }];
    const up = { clientX: 160, clientY: 72 };
    assert.deepEqual(appendInkPoints(down, toPaper(inkPointerSamples(up))), [
        { x: 40, y: 60 }, { x: 160, y: 72 },
    ]);
    assert.deepEqual(down, [{ x: 40, y: 60 }], 'previous stroke snapshots must remain immutable for undo');
});

test('the final short tail survives a release less than the old sample threshold away', () => {
    assert.deepEqual(appendInkPoints([{ x: 40, y: 60 }], [{ x: 40.3, y: 60.2 }]), [
        { x: 40, y: 60 }, { x: 40.3, y: 60.2 },
    ]);
});

test('coalesced input preserves bends in a fast stroke, including the final pointer position', () => {
    const event = {
        clientX: 80, clientY: 60,
        getCoalescedEvents() {
            assert.equal(this, event, 'the native method needs its pointer-event receiver');
            return [
                { clientX: 50, clientY: 80 },
                { clientX: 60, clientY: 90 },
                { clientX: 70, clientY: 80 },
            ];
        },
    };
    assert.deepEqual(appendInkPoints([{ x: 40, y: 60 }], toPaper(inkPointerSamples(event))), [
        { x: 40, y: 60 }, { x: 50, y: 80 }, { x: 60, y: 90 }, { x: 70, y: 80 }, { x: 80, y: 60 },
    ]);
});

test('duplicate release samples keep a dot as one point and do not create a new undo snapshot', () => {
    const points = [{ x: 40, y: 60 }];
    const event = { clientX: 40, clientY: 60, getCoalescedEvents: () => [{ clientX: 40, clientY: 60 }] };
    assert.equal(appendInkPoints(points, toPaper(inkPointerSamples(event))), points);
    assert.equal(appendInkPoints(points, [{ x: NaN, y: 60 }, { x: 40, y: Infinity }]), points);
});

test('browsers without coalesced events still preserve the dispatched point', () => {
    const event = { clientX: 5, clientY: 10, getCoalescedEvents() { throw new Error('unsupported event type'); } };
    assert.deepEqual(toPaper(inkPointerSamples(event)), [{ x: 5, y: 10 }]);
    assert.deepEqual(toPaper(inkPointerSamples({ clientX: 5, clientY: 10 })), [{ x: 5, y: 10 }]);
});
