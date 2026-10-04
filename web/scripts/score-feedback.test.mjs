import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './load.mjs';

const { ScorePulse, scoreTone } = await import(await moduleUrl('scoreFeedback'));
const event = (id, kind = 'intercept', team = 'A', at = 1000) => ({ id, at, round: 5, changes: [{ team, kind, total: 1 }] });
const signal = (e = null, extra = {}) => ({ event: e, room: '1234', team: 'A', online: true, ...extra });

test('only fresh score events pulse; initial scores, repeats and restored snapshots stay quiet', () => {
    const p = new ScorePulse();
    p.observe(signal(event(1)), 1000, true);
    assert.equal(p.advance(.192, 1192, true), false);
    p.observe(signal(event(2)), 1200, true);
    assert.equal(p.advance(.192, 1392, true), true);
    assert.ok(Math.abs(p.level - 1) < 1e-9, 'peak coincides with the flag hitting its stop');
    p.observe(signal(event(2)), 1400, true);
    p.advance(.6, 1600, true);
    assert.ok(p.level < .05, 'duplicate result did not restart the pulse');
    assert.equal(p.advance(.6, 1800, true), true, 'final clear frame must redraw the backdrop');
    assert.equal(p.level, 0);
    assert.equal(p.advance(.1, 1900, true), false, 'a settled effect owes no frames');
    p.observe(signal(null), 2000, true);
    assert.equal(p.level, 0);
});

test('interception and failure in the same round each have their own pulse; terminal changes do not replay them', () => {
    const p = new ScorePulse();
    p.observe(signal(), 1000, true);
    p.observe(signal(event(1, 'intercept', 'B')), 1000, true);
    p.advance(.192, 1192, true);
    assert.equal(p.tone, 'bad');
    p.observe(signal(event(2, 'failure', 'A', 5000)), 5000, true);
    p.advance(.192, 5192, true);
    assert.equal(p.level, 1);
    assert.equal(p.tone, 'bad');
    p.observe(signal(event(2, 'failure', 'A', 5000)), 5200, true);
    p.advance(.3, 5500, true);
    assert.ok(p.level < .4);
});

test('team perspective follows the benefit of the marker, including neutral observers', () => {
    assert.equal(scoreTone(event(1, 'intercept', 'A'), 'A'), 'good');
    assert.equal(scoreTone(event(1, 'intercept', 'B'), 'A'), 'bad');
    assert.equal(scoreTone(event(1, 'failure', 'B'), 'A'), 'good');
    assert.equal(scoreTone(event(1, 'failure', 'A'), 'A'), 'bad');
    assert.equal(scoreTone(event(1), ''), 'neutral');
});

test('power, reduced motion, offline, hidden or stale deliveries consume events without replay', () => {
    for (const blocked of [signal(event(1), { online: false }), signal(event(1), { room: '5678' }), signal(event(1), { team: 'B' })]) {
        const p = new ScorePulse(); p.observe(signal(), 1000, true);
        p.observe(blocked, 1000, true);
        p.advance(.2, 1200, true);
        assert.equal(p.level, 0);
    }
    const p = new ScorePulse(); p.observe(signal(), 1000, true);
    p.observe(signal(event(1)), 1000, false);
    p.observe(signal(event(1)), 1100, true);
    assert.equal(p.advance(.2, 1300, true), false);
    p.observe(signal(event(2)), 4000, true);
    assert.equal(p.advance(.2, 4200, true), false, 'old event is not replayed');
    p.observe(signal(event(3, 'intercept', 'A', 5000)), 5000, true);
    p.advance(.1, 5100, true);
    assert.ok(p.level > 0);
    assert.equal(p.advance(.1, 5200, false), true);
    assert.equal(p.level, 0);
    p.observe(signal(event(3, 'intercept', 'A', 5000)), 5300, true);
    assert.equal(p.advance(.1, 5400, true), false);
});
