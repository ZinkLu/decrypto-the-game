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
    // Every eligible AI participates independently, even alongside humans.
    assert.deepEqual(cast.decoders.map(p => p.nickname), ['你', 'Bob', 'AI · 01']);
    assert.deepEqual(cast.interceptors.map(p => p.nickname), ['John', 'Lisa', 'AI · 02', 'AI · 03']);
    const machines = roundCast({ ...s, teamB: s.teamB.filter(p => p.is_ai) });
    assert.deepEqual(machines.interceptors.map(p => p.nickname), ['AI · 02', 'AI · 03'], 'an all-AI team is played by its AI');
    assert.equal(cast.intercepted, true);
    // A spectator learns the sending team from the encryptor's public name.
    assert.equal(roundCast({ ...s, myTeam: '', myRole: 'observer' }).sending, 'A');
    // Stable IDs identify the encryptor even when another player shares the name.
    const twins = roundCast({ ...s, myTeam: '', myRole: 'observer', teamB: [...s.teamB, { id: '9', nickname: 'Alice', is_ai: false }] });
    assert.equal(twins.sending, 'A');
    assert.equal(twins.encryptor.id, '1');
    const unknown = roundCast({ ...s, encryptorID: '', myTeam: '', myRole: 'observer', teamB: [...s.teamB, { id: '9', nickname: 'Alice', is_ai: false }] });
    assert.equal(unknown.sending, '');
    assert.equal(unknown.encryptor, undefined, 'a legacy name-only report remains unattributed if ambiguous');
    assert.equal(roundCast({ ...s, round: 2 }).intercepted, false, 'the first two transmissions are never intercepted');
});

test('only the round start opens a briefing; handovers go straight to the working page', () => {
    const s = previewState({}, 'encrypting');
    assert.equal(briefingKey(s), '5821:5:encrypting');
    assert.equal(briefingKey({ ...s, phase: 'guess' }), '');
    assert.equal(briefingKey({ ...s, phase: 'round_result' }), '');
    assert.equal(briefingKey({ ...s, phase: 'room', round: 0 }), '');
    assert.equal(briefingDuration(briefingKey(s)), briefingTime.round);
    assert.equal(briefingDuration(briefingKey({ ...s, phase: 'guess' })), 0);
});

test('watching seats learn which slot is being worked on, never the clue text', () => {
    const s = previewState({}, 'waiting');
    // Lines 1 and 3 are drafted out of order while the encryptor edits the second.
    const drafting = transmission({ ...s, playerProgress: { encrypt: { action: 'encrypt', player: 'Alice', state: 'editing', step: 2, focus: 2, filled: [true, false, true], total: 3 } } });
    assert.deepEqual(drafting.slots.map(slot => [slot.active, slot.done, slot.digit]), [[false, true, 0], [true, false, 0], [false, true, 0]]);
    assert.equal(drafting.count, 2);
    assert.equal(drafting.player, 'Alice');
    // Clients that only report a count fill the lines in order.
    assert.deepEqual(transmission({ ...s, playerProgress: { encrypt: { action: 'encrypt', player: 'Alice', state: 'editing', step: 1, focus: 2, total: 3 } } })
        .slots.map(slot => slot.done), [true, false, false]);
    // An AI encryptor reports the clue it is thinking about and how many it has finished.
    const ai = transmission({ ...s, playerProgress: {}, encryptor: 'AI · 01', aiStatus: { encrypt: { action: 'encrypt', player: 'AI · 01', state: 'thinking', step: 2, completed: 1, total: 3 } } });
    assert.deepEqual(ai.slots.map(slot => [slot.active, slot.done]), [[false, true], [true, false], [false, false]]);
    assert.ok(ai.ai);
    assert.equal(ai.player, 'AI · 01');
    const quiet = transmission({ ...s, playerProgress: {}, aiStatus: {} });
    assert.equal(quiet.started, false);
    assert.ok(quiet.slots.every(slot => !slot.active && !slot.done));
    // Progress of another beat never lights this one.
    assert.equal(transmission({ ...s, playerProgress: { decrypt: { action: 'decrypt', player: 'Bob', state: 'editing', step: 1, focus: 1, guesses: [2, 0, 0], total: 3 } } }).started, false);
    assert.equal(transmission({ ...s, phase: 'round_result' }), null);
});

test('a guess shows its digits only to its own team and the encryptor, who alone can grade them', () => {
    // The encryptor of team A watches both teams guess at once.
    const s = previewState({}, 'watch-guess');
    const teammate = transmission({ ...s, myRole: 'teammate' }, false, 'intercept');
    assert.deepEqual(teammate.slots.map(slot => [slot.done, slot.digit]), [[true, 0], [true, 0], [false, 0]], 'a decoder sees that a number was picked, not which');
    assert.deepEqual(transmission(s, false, 'intercept').slots.map(slot => [slot.digit, slot.match]), [[2, undefined], [1, undefined], [0, undefined]], 'without the disk read, no grading');
    const graded = transmission(s, true, 'intercept');
    assert.deepEqual(graded.slots.map(slot => slot.match), [false, true, undefined]);
    assert.ok(graded.slots[2].active);
    const decode = transmission(s, true, 'decrypt');
    assert.deepEqual(decode.slots.map(slot => [slot.digit, slot.match, slot.active]), [[3, true, false], [0, undefined, true], [0, undefined, false]]);
    assert.deepEqual(transmission({ ...s, myRole: 'opponent', myTeam: 'B' }, false, 'decrypt').slots.map(slot => [slot.done, slot.digit]),
        [[true, 0], [false, 0], [false, 0]], 'the interceptors never see the decode');
    assert.deepEqual(transmission({ ...s, myRole: 'observer', myTeam: '' }, false, 'decrypt').slots.map(slot => slot.digit), [0, 0, 0], 'nor do spectators');
    // Where the server withholds the digits, its progress still marks the chosen slots.
    assert.deepEqual(transmission(previewState({}, 'decrypt-sent'), false, 'intercept').slots.map(slot => [slot.done, slot.digit]), [[true, 0], [true, 0], [false, 0]]);
    const submitted = { ...s, playerProgress: { ...s.playerProgress, intercept: { ...s.playerProgress.intercept, state: 'submitted' } } };
    assert.ok(transmission(submitted, false, 'intercept').slots.every(slot => slot.done && !slot.active));
    // An answer the table learned of without any progress still fills the row.
    const answered = transmission({ ...s, playerProgress: {}, actions: { ...s.actions, intercept: { ...s.actions.intercept, submitted: true } } }, false, 'intercept');
    assert.ok(answered.submitted && answered.started && answered.slots.every(slot => slot.done));
});

test('each seat is told its part while both teams guess', () => {
    const decoding = previewState({}, 'decrypt'), intercepting = previewState({}, 'intercept');
    assert.deepEqual(seatDuty(decoding), ['轮到你解码：对照我方密词，按顺序选编号。', []]);
    assert.deepEqual(seatDuty(intercepting), ['轮到你拦截：三个编号全对才算截获。', []]);
    assert.deepEqual(seatDuty({ ...intercepting, round: 2 }), ['{0} 队正在解码。', ['B']], 'nobody intercepts round 2');
    assert.deepEqual(seatDuty(previewState({}, 'watch-guess')), ['队友解码，对手同时拦截，你只能等待。', []]);
    assert.deepEqual(seatDuty({ ...previewState({}, 'watch-guess'), round: 1 }), ['队友正在解码，你只能等待。', []]);
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
    assert.deepEqual(timeoutNotice({ ...s, timeouts: [timeout] }), ['{0} 没在时限内发报，已发出写好的线索（空行记为 —）。', ['Alice']]);
    assert.match(timeoutNotice({ ...s, timeouts: [{ ...timeout, action: 'decrypt', outcome: 'none' }] })[0], /记一次解码失误/);
    // Both teams may run out of time in one phase: the latest notice is shown.
    assert.match(timeoutNotice({ ...s, timeouts: [timeout, { ...timeout, action: 'intercept', team: 'B', outcome: 'none' }] })[0], /拦截超时/);
    assert.equal(timeoutNotice({ ...s, timeouts: [{ ...timeout, round: s.round - 1 }] }), null);
    assert.equal(timeoutNotice(s), null);
});

test('round results name the team and read as good or bad news for this seat', () => {
    // Team B sends here; Team B's error is good news for Team A.
    const settled = previewState({}, 'round_result');
    const base = { ...settled, encryptor: 'John', myRole: 'opponent', history: settled.history.filter(row => row.round !== settled.round) };
    const theirError = { ...base, roundResult: { intercept_success: false, decrypt_success: false } };
    assert.deepEqual(resultView(theirError).title, ['本轮回执', []]);
    assert.deepEqual(resultView(theirError).sub, ['{0} 队失误 +1', ['B']]);
    assert.equal(resultView(theirError).tone, 'good');
    assert.equal(resultTint(theirError), '#8bc995');
    const intercepted = { ...base, roundResult: { intercept_success: true, decrypt_success: true } };
    assert.deepEqual(resultView(intercepted).title, ['本轮回执', []]);
    assert.deepEqual(resultView(intercepted).sub, ['{0} 队截获 +1', ['A']]);
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
    const s = previewState({}, 'watch-guess');
    const chosen = transmission({ ...s, playerProgress: { ...s.playerProgress, intercept: { ...s.playerProgress.intercept, guesses: [2, 1, 4], step: 3, focus: 3 } } }, false, 'intercept');
    assert.ok(chosen.slots.every(slot => !slot.active && slot.done));
});
