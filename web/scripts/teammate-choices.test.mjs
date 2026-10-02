import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/console/model.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { previewState, teammateChoices, teammateStatus, rosterTeams, transmission, initialLocal } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('guessing teammates keep individual partial choices and AI recommendations', () => {
  const state = previewState({}, 'decrypt-peers');
  const choices = teammateChoices(state);
  assert.deepEqual(choices.map(choice => [choice.id, choice.guesses, choice.focus]), [
    ['2', [3, 0, 4], 2], ['3', [3, 1, 4], 0],
  ]);
  assert.equal(choices[1].suggestion, true);
  assert.equal(choices[1].submitted, false, 'a complete AI recommendation is still a working choice');
  assert.equal(choices[0].ai, false);
  const unavailable = teammateChoices({ ...state, teammateProgress: {
    ...state.teammateProgress, '3': { ...state.teammateProgress['3'], state: 'unavailable', guesses: undefined, focus: 2 },
  } })[1];
  assert.equal(unavailable.state, 'unavailable');
  assert.equal(unavailable.focus, 0, 'a failed recommendation no longer appears to be thinking');
  assert.deepEqual(unavailable.guesses, [0, 0, 0]);
  const idle = teammateChoices({ ...state, teammateProgress: {} });
  assert.deepEqual(idle.map(choice => [choice.id, choice.state, choice.guesses]), [['2', 'idle', [0, 0, 0]], ['3', 'idle', [0, 0, 0]]],
    'all eligible humans and AI appear before their first draft arrives');
  assert.equal(teammateChoices(previewState({}, 'intercept-peers')).length, 3, 'all other seats can intercept, including the previous encryptor');
});

test('choices belong only to the current action, team, round and stable player ID', () => {
  const state = previewState({}, 'decrypt-peers');
  const injected = { ...state, teammateProgress: {
    ...state.teammateProgress,
    '0': { ...state.teammateProgress['2'], player_id: '0', guesses: [1, 2, 3] },
    '1': { ...state.teammateProgress['2'], player_id: '1', guesses: [1, 2, 3] },
    '4': { ...state.teammateProgress['2'], player_id: '4', action: 'intercept', guesses: [1, 2, 3] },
  } };
  assert.deepEqual(teammateChoices(injected).map(choice => choice.id), ['2', '3'], 'self, encryptor and opponents never become peer advice');
  for (const replacement of [{ action: 'intercept' }, { round: 4 }, { player_id: 'other' }]) {
    const changed = { ...state, teammateProgress: { '2': { ...state.teammateProgress['2'], ...replacement } } };
    assert.deepEqual(teammateChoices(changed)[0].guesses, [0, 0, 0]);
  }
  const twins = { ...state, teamA: state.teamA.map(person => ({ ...person, nickname: '同名' })) };
  assert.deepEqual(teammateChoices(twins).map(choice => choice.id), ['2', '3'], 'duplicate names do not hide peers or expose the encryptor');
  for (const replacement of [{ phase: 'encrypting' }, { phase: 'round_result' }, { myRole: 'encryptor' },
    { myRole: 'observer', myTeam: '' }, { actions: { decrypt: { team: 'B' } } }]) {
    assert.deepEqual(teammateChoices({ ...state, ...replacement }), []);
  }
  assert.deepEqual(teammateChoices({ ...previewState({}, 'intercept-peers'), round: 2 }), [], 'the first two rounds have no interception');
});

test('accepted team answers freeze focus and redacted or invalid digits stay blank', () => {
  const state = previewState({}, 'decrypt-peers');
  const submitted = teammateChoices({ ...state, actions: { ...state.actions, decrypt: { ...state.actions.decrypt, submitted: true } } });
  assert.ok(submitted.every(choice => choice.actionClosed && !choice.submitted && !choice.canSubmit && choice.focus === 0));
  assert.ok(submitted.every(choice => teammateStatus(choice)[0] === '队伍已提交'));
  assert.deepEqual(submitted[0].guesses, [3, 0, 4], 'submission does not invent consensus');
  const redacted = { ...state, teammateProgress: {
    '2': { ...state.teammateProgress['2'], guesses: undefined, filled: [true, false, true] },
    '3': { ...state.teammateProgress['3'], guesses: [8, 2.5, 4] },
  } };
  assert.deepEqual(teammateChoices(redacted).map(choice => choice.guesses), [[0, 0, 0], [0, 0, 4]]);
});

test('parallel AI peers expose separate states, focused clues and submit authority', () => {
  const decode = previewState({}, 'decrypt-ai-peers');
  const choices = teammateChoices(decode);
  assert.deepEqual(choices.map(choice => [choice.id, choice.state, choice.guesses, choice.canSubmit]), [
    ['2', 'thinking', [3, 0, 0], false], ['3', 'ready', [1, 3, 4], false],
  ], 'AI encryptor is excluded while both other AI keep independent choices');
  assert.deepEqual(choices.map(teammateStatus), [['正在推敲第 {0} 条', [2]], ['建议已就绪', []]]);
  const intercept = teammateChoices(previewState({}, 'intercept-ai-peers'));
  assert.deepEqual(intercept.map(choice => choice.state), ['retrying', 'ready', 'unavailable']);
  assert.deepEqual(intercept.map(teammateStatus), [['正在重试第 {0} 条', [2]], ['建议已就绪', []], ['建议暂不可用', []]]);
  const selected = { ...decode, teammateProgress: { ...decode.teammateProgress,
    '2': { ...decode.teammateProgress['2'], suggestion: false, can_submit: true, state: 'ready', step: 3, guesses: [3, 1, 4] },
  } };
  assert.equal(teammateChoices(selected)[0].canSubmit, true, 'an all-AI team can designate one submitter');
  assert.deepEqual(teammateStatus(teammateChoices(selected)[0]), ['答案已就绪', []]);
  selected.teammateProgress['2'].state = 'submitted';
  selected.actions = { ...selected.actions, decrypt: { ...selected.actions.decrypt, submitted: true } };
  const finished = teammateChoices(selected);
  assert.deepEqual(finished.map(choice => [choice.submitted, choice.actionClosed, choice.state]), [
    [true, true, 'submitted'], [false, true, 'ready'],
  ], 'only the accepted individual is marked submitted');
  assert.deepEqual(finished.map(teammateStatus), [['已提交', []], ['队伍已提交', []]]);
  assert.ok(transmission({ ...decode, actions: selected.actions }, false, 'decrypt').slots.every(slot => !slot.active),
    'closing the action stops the watching cursor too');
});

test('roster statuses track every stable ID, including same-name AI and encryption focus', () => {
  const state = previewState({}, 'intercept-ai-peers');
  state.teamA = state.teamA.map(person => ({ ...person, nickname: '同名' }));
  const roster = rosterTeams(state, initialLocal)[0];
  assert.deepEqual(roster.seats.map(seat => seat.status), ['尚未开始', '重试中', '建议已就绪', '建议暂不可用']);
  assert.deepEqual(roster.seats.map(seat => seat.progress.step), [0, 1, 3, 0]);
  assert.deepEqual(roster.seats[1].statusLine, ['正在重试第 {0} 条', [2]]);
  assert.deepEqual(rosterTeams(state, { ...initialLocal, guess: [3, 0, 4] })[0].seats[0].statusLine,
    ['已选 {0} / 3', [2]], 'this device reflects local choices before their network echo');
  const closed = rosterTeams({ ...state, actions: { ...state.actions, intercept: { ...state.actions.intercept, submitted: true } } }, initialLocal)[0];
  assert.ok(closed.seats.every(seat => seat.status === '队伍已提交'));
  const encryption = previewState({}, 'waiting');
  encryption.teamA[1].is_ai = true;
  encryption.teammateProgress = { '1': { action: 'encrypt', player_id: '1', player: 'Alice', is_ai: true,
    can_submit: true, state: 'thinking', step: 1, focus: 2, filled: [true, false, false], total: 3 } };
  const encryptor = rosterTeams(encryption, initialLocal)[0].seats[1];
  assert.equal(encryptor.status, '思考中');
  assert.deepEqual(encryptor.statusLine, ['正在推敲第 {0} 条', [2]]);
  assert.equal(encryptor.progress.guesses, undefined, 'drafting clues exposes progress only');
});
