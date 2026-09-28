import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { previewState, roundCast, transmission, briefingKey, briefingDuration, briefingTime, initialLocal, seatDuty, deadlineWarning, paintedSeconds, timeoutNotice, resultView, gameOverView, resultTint } =
    await import(`data:text/javascript;base64,${Buffer.from(compile(await readFile(new URL('../src/console/model.ts', import.meta.url), 'utf8'))).toString('base64')}`);

test('the round cast names who sends, intercepts and decodes, for players and spectators', () => {
    const s = previewState({}, 'waiting');
    const cast = roundCast(s);
    assert.equal(cast.sending, 'A');
    assert.equal(cast.receiving, 'B');
    assert.equal(cast.encryptor.nickname, 'Alice');
    // With humans on a team, its AI seats sit the beat out, so only the humans are named.
    assert.deepEqual(cast.decoders.map(p => p.nickname), ['你', 'Bob']);
    assert.deepEqual(cast.interceptors.map(p => p.nickname), ['John', 'Lisa']);
    const machines = roundCast({ ...s, teamB: s.teamB.filter(p => p.is_ai) });
    assert.deepEqual(machines.interceptors.map(p => p.nickname), ['AI · 02', 'AI · 03'], 'an all-AI team is played by its AI');
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

test('the acting seat is warned in its last 15 seconds, and told what a timeout does', () => {
    const s = { ...previewState({}, 'encrypting'), deadline: Date.now() + 20000, waiting: false };
    const u = { ...initialLocal };
    assert.equal(deadlineWarning(s, u, 20), null);
    assert.deepEqual(deadlineWarning(s, u, 15), ['还剩 {0} 秒 · 到时自动发出已写的线索', [15]]);
    assert.equal(deadlineWarning({ ...s, myRole: 'teammate', waiting: true }, u, 10), null, 'a waiting seat is not rushed');
    assert.equal(deadlineWarning(s, { ...u, submitted: true }, 10), null);
    const intercept = { ...previewState({}, 'intercept'), deadline: Date.now() + 9000, waiting: false };
    assert.match(deadlineWarning(intercept, u, 9)[0], /视为未拦截/);
    assert.deepEqual(deadlineWarning(s, u, 0), ['时间到 · 正在按规则提交', []]);
});

test('the screen is painted again when a turn gets its time back', () => {
    // After a server restart the interrupted turn begins again with its full time.
    assert.notEqual(paintedSeconds(0), paintedSeconds(90), 'time up and a full turn looked the same to the screen');
    assert.notEqual(paintedSeconds(0), paintedSeconds(60));
    assert.equal(paintedSeconds(90), paintedSeconds(16), 'the screen follows the clock before the warning');
    for (const seconds of [15, 14, 5, 1, 0]) assert.equal(paintedSeconds(seconds), seconds, 'each warned second is painted');
});

test('a timeout is explained to everyone for the rest of its round only', () => {
    const s = previewState({}, 'decrypt');
    const timeout = { round: s.round, action: 'encrypt', team: 'A', player: 'Alice', outcome: 'draft' };
    assert.deepEqual(timeoutNotice({ ...s, timeout }), ['{0} 没在时限内发报，已发出写好的线索（空行记为 —）。', ['Alice']]);
    assert.match(timeoutNotice({ ...s, timeout: { ...timeout, action: 'decrypt', outcome: 'none' } })[0], /记一次解码失误/);
    assert.equal(timeoutNotice({ ...s, timeout: { ...timeout, round: s.round - 1 } }), null);
    assert.equal(timeoutNotice(s), null);
});

test('round results name the team and read as good or bad news for this seat', () => {
    // Team A sends in the preview; Team B's error is good news for Team A.
    const base = { ...previewState({}, 'round_result'), encryptor: 'John', myRole: 'opponent' };
    const theirError = { ...base, roundResult: { intercept_success: false, decrypt_success: false } };
    assert.deepEqual(resultView(theirError).title, ['{0} 队解码失误', ['B']]);
    assert.equal(resultView(theirError).tone, 'good');
    assert.equal(resultTint(theirError), '#8bc995');
    const intercepted = { ...base, roundResult: { intercept_success: true } };
    assert.deepEqual(resultView(intercepted).title, ['{0} 队截获成功', ['A']]);
    assert.equal(resultView(intercepted).tone, 'good');
    const spectator = { ...intercepted, myTeam: '', myRole: 'observer' };
    assert.equal(resultView(spectator).tone, 'neutral');
});

test('the final screen says why the game ended', () => {
    const s = { ...previewState({}, 'game_over'), gameOver: { winner: 'A', reason: 'interceptions' } };
    assert.deepEqual(gameOverView(s).reason, ['{0} 队截获 2 次', ['A']]);
    assert.equal(gameOverView(s).mine, '你方获胜');
    assert.deepEqual(gameOverView({ ...s, gameOver: { winner: 'B', reason: 'errors' } }).reason, ['{0} 队解码失误 2 次', ['A']]);
    assert.equal(gameOverView({ ...s, gameOver: { winner: null, reason: 'draw' } }).mine, null);
    assert.deepEqual(seatDuty({ ...previewState({}, 'intercept'), myRole: 'observer', myTeam: '' }), ['你在旁观这一局，下一局可以入队。', []]);
});

test('a guess with all three digits chosen has no slot still being worked on', () => {
    const s = previewState({}, 'watch-intercept');
    const chosen = transmission({ ...s, playerProgress: { ...s.playerProgress, guesses: [2, 1, 4], step: 3, focus: 3 } });
    assert.ok(chosen.slots.every(slot => !slot.active && slot.done));
});
