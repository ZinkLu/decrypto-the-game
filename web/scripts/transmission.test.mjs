import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { previewState, roundCast, transmission, briefingKey, briefingDuration, briefingTime } =
    await import(`data:text/javascript;base64,${Buffer.from(compile(await readFile(new URL('../src/components/console/model.ts', import.meta.url), 'utf8'))).toString('base64')}`);

test('the round cast names who sends, intercepts and decodes, for players and spectators', () => {
    const s = previewState({}, 'waiting');
    const cast = roundCast(s);
    assert.equal(cast.sending, 'A');
    assert.equal(cast.receiving, 'B');
    assert.equal(cast.encryptor.nickname, 'Alice');
    assert.deepEqual(cast.decoders.map(p => p.nickname), ['你', 'Bob', 'AI · 01']);
    assert.deepEqual(cast.interceptors.map(p => p.nickname), ['John', 'Lisa', 'AI · 02', 'AI · 03']);
    assert.equal(cast.intercepted, true);
    // A spectator learns the sending team from the encryptor's public name.
    assert.equal(roundCast({ ...s, myTeam: '', myRole: 'observer' }).sending, 'A');
    // Two players sharing that name cannot be told apart.
    const twins = roundCast({ ...s, myTeam: '', myRole: 'observer', teamB: [...s.teamB, { id: '9', nickname: 'Alice', is_ai: false }] });
    assert.equal(twins.sending, '');
    assert.equal(twins.encryptor, undefined);
    assert.equal(roundCast({ ...s, round: 2 }).intercepted, false, 'the first two transmissions are never intercepted');
});

test('every beat opens with its own briefing, the round start with a longer one', () => {
    const s = previewState({}, 'encrypting');
    assert.equal(briefingKey(s), '5821:5:encrypting');
    assert.equal(briefingKey({ ...s, phase: 'intercept' }), '5821:5:intercept');
    assert.equal(briefingKey({ ...s, phase: 'round_result' }), '');
    assert.equal(briefingKey({ ...s, phase: 'room', round: 0 }), '');
    assert.equal(briefingDuration(briefingKey(s)), briefingTime.round);
    assert.equal(briefingDuration(briefingKey({ ...s, phase: 'decrypt' })), briefingTime.handover);
    assert.ok(briefingTime.round > briefingTime.handover);
});

test('watching seats learn which slot is being worked on, never the clue text', () => {
    const s = previewState({}, 'waiting');
    // Lines 1 and 3 are drafted out of order while the encryptor edits the second.
    const drafting = transmission({ ...s, playerProgress: { action: 'encrypt', player: 'Alice', state: 'editing', step: 2, focus: 2, filled: [true, false, true], total: 3 } });
    assert.deepEqual(drafting.slots.map(slot => [slot.active, slot.done, slot.digit]), [[false, true, 0], [true, false, 0], [false, true, 0]]);
    assert.equal(drafting.count, 2);
    assert.equal(drafting.player, 'Alice');
    // Clients that only report a count fill the lines in order.
    assert.deepEqual(transmission({ ...s, playerProgress: { action: 'encrypt', player: 'Alice', state: 'editing', step: 1, focus: 2, total: 3 } })
        .slots.map(slot => slot.done), [true, false, false]);
    // An AI encryptor reports the clue it is thinking about and how many it has finished.
    const ai = transmission({ ...s, playerProgress: null, encryptor: 'AI · 01', aiStatus: { action: 'encrypt', player: 'AI · 01', state: 'thinking', step: 2, completed: 1, total: 3 } });
    assert.deepEqual(ai.slots.map(slot => [slot.active, slot.done]), [[false, true], [true, false], [false, false]]);
    assert.ok(ai.ai);
    assert.equal(ai.player, 'AI · 01');
    const quiet = transmission({ ...s, playerProgress: null, aiStatus: null });
    assert.equal(quiet.started, false);
    assert.ok(quiet.slots.every(slot => !slot.active && !slot.done));
    // Progress of another beat never lights this one.
    assert.equal(transmission({ ...s, playerProgress: { action: 'decrypt', player: 'Bob', state: 'editing', step: 1, focus: 1, guesses: [2, 0, 0], total: 3 } }).started, false);
    assert.equal(transmission({ ...s, phase: 'round_result' }), null);
});

test('rival picks stay hidden from the team still to decode; only the encryptor can grade them', () => {
    const s = previewState({}, 'watch-intercept');
    const teammate = transmission({ ...s, myRole: 'teammate' });
    assert.deepEqual(teammate.slots.map(slot => [slot.done, slot.digit]), [[true, 0], [true, 0], [false, 0]], 'a teammate sees that a number was picked, not which');
    assert.deepEqual(transmission(s, false).slots.map(slot => [slot.digit, slot.match]), [[2, undefined], [1, undefined], [0, undefined]], 'without the disk read, no grading');
    const graded = transmission(s, true);
    assert.deepEqual(graded.slots.map(slot => slot.match), [false, true, undefined]);
    assert.ok(graded.slots[2].active);
    assert.deepEqual(transmission({ ...previewState({}, 'watch-decrypt'), myRole: 'opponent' }).slots.map(slot => slot.digit), [3, 0, 0], 'after intercepting, rivals may watch the decode');
    assert.ok(transmission({ ...s, playerProgress: { ...s.playerProgress, state: 'submitted' } }).slots.every(slot => slot.done && !slot.active));
});
