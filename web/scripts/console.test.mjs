import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/components/console/model.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { roleState, archiveRows, archiveStart, resultTint, previewState, initialLocal } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('only the current actor can transmit a complete, valid message', () => {
  const encrypt = previewState({}, 'encrypting');
  assert.equal(roleState(encrypt, initialLocal).ready, false);
  const complete = { ...initialLocal, clues: ['花园', '远航', '迁徙'] };
  assert.equal(roleState(encrypt, complete).ready, true);
  assert.equal(roleState({ ...encrypt, connected: false }, complete).ready, false);
  assert.equal(roleState({ ...encrypt, waiting: true }, complete).ready, false);
  assert.equal(roleState(encrypt, { ...complete, submitted: true }).ready, false);
  assert.equal(roleState(encrypt, { ...complete, clues: [' ', '远航', '迁徙'] }).ready, false);
  for (const phase of ['intercept', 'decrypt']) {
    const s = previewState({}, phase);
    assert.equal(roleState(s, { ...initialLocal, guess: [3, 1, 4] }).ready, true);
    assert.equal(roleState(s, { ...initialLocal, guess: [3, 3, 4] }).ready, false);
    assert.equal(roleState(s, { ...initialLocal, guess: [3, 0, 4] }).ready, false);
    assert.equal(roleState(s, { ...initialLocal, guess: [3, 5, 4] }).ready, false);
    assert.equal(roleState({ ...s, myRole: 'encryptor' }, { ...initialLocal, guess: [3, 1, 4] }).ready, false);
  }
});

test('paper archive excludes current/future rounds, filters teams and never synthesizes secrets', () => {
  const s = previewState({}, 'intercept');
  s.history.push({ round: 5, team: 'B', clues: ['private'], secret: [2, 3, 4] });
  s.history.push({ round: 7, team: 'A', clues: ['future'] });
  const original = [...s.history];
  assert.deepEqual(archiveRows(s, 'all').map(r => r.round), [4, 3, 2, 1]);
  assert.deepEqual(archiveRows(s, 'B').map(r => r.round), [4, 2]);
  assert.deepEqual(s.history, original, 'sorting does not mutate shared store');
  s.history = [{ round: 2, team: 'B', clues: ['a', 'b', 'c'] }];
  assert.equal(archiveRows(s, 'all')[0].secret, undefined);
});

test('reading an old paper record stays anchored when a new round is archived', () => {
  const s = previewState({}, 'intercept');
  const u = { ...initialLocal, archivePage: 1, archiveAnchor: 2 };
  assert.equal(archiveStart(s, u), 2);
  s.round = 6;
  s.history.push({ round: 5, team: 'A', clues: ['a', 'b', 'c'] });
  assert.equal(archiveStart(s, u), 3);
  assert.equal(archiveRows(s, 'all')[archiveStart(s, u)].round, 2);
  assert.equal(archiveStart(s, initialLocal), 0, 'latest view follows incoming records');
});

test('an intercepted sender gets a failure cue while the intercepting player gets a success cue', () => {
  const s = { ...previewState({}, 'round_result'), roundResult: { intercept_success: true } };
  assert.equal(resultTint({ ...s, myRole: 'encryptor' }), '#ed9781');
  assert.equal(resultTint({ ...s, myRole: 'opponent' }), '#8bc995');
  const final = previewState({}, 'game_over');
  assert.equal(resultTint(final), '#8bc995');
  assert.equal(resultTint({ ...final, myTeam: 'B' }), '#ed9781');
});
