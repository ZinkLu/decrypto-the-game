import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/components/console/model.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { themeChoices, teamPalette, readTheme, saveTheme, roleState, phaseSignal, rosterTeams, archiveRows, archiveStart, resultTint, previewState, initialLocal } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

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

test('roster follows public phase progress and does not attribute stale or ambiguous reports', () => {
  const s = previewState({}, 'waiting');
  const team = rosterTeams(s, initialLocal)[0];
  assert.equal(team.seats[1].status, '加密中');
  assert.equal(team.seats[1].progress.step, 2);
  assert.equal(team.seats[0].progress, null);
  const stale = rosterTeams({ ...s, phase: 'decrypt' }, initialLocal)[0];
  assert.equal(stale.seats[1].acting, false, 'encryptor cannot decrypt');
  assert.equal(stale.seats[1].progress, null, 'previous phase progress is hidden');
  const duplicate = { ...s, teamB: s.teamB.map((p, i) => i ? p : { ...p, nickname: s.encryptor }) };
  assert.ok(rosterTeams(duplicate, initialLocal).flatMap(t => t.seats).every(p => !p.progress));
  const intercept = rosterTeams(previewState({}, 'intercept'), initialLocal);
  assert.ok(intercept[0].seats.every(p => p.acting), 'opponents act during interception');
  assert.ok(intercept[1].seats.every(p => !p.acting));
});

test('roster distinguishes vacant seats, owner, self, AI and local completion', () => {
  const lobby = rosterTeams(previewState({}, 'room-partial'), initialLocal);
  assert.equal(lobby[0].summary, '还需 1 人');
  assert.equal(lobby[0].seats[0].owner, true);
  assert.equal(lobby[0].seats[0].self, true);
  assert.equal(lobby[0].seats[1].player, undefined);
  assert.equal(lobby[0].seats[1].status, '邀请好友 / AI');
  const local = { ...initialLocal, clues: ['玫瑰', ' ', '飞鸟'], submitted: true };
  const active = rosterTeams(previewState({}, 'encrypting'), local)[0];
  assert.deepEqual(active.seats[0].progress, { step: 2, total: 3 });
  assert.equal(active.seats[0].status, '已提交');
  assert.equal(active.seats[3].player.is_ai, true);
});

test('settled final round is archived and recovered submissions cannot act twice', () => {
  const s = previewState({}, 'game_over');
  s.history = [{round:s.round,team:'A',clues:['a','b','c'],secret:[1,2,3]}];
  assert.equal(archiveRows(s,'all').length, 1);
  s.phase='encrypting'; assert.equal(archiveRows(s,'all').length, 0);
  s.myRole='encryptor'; s.waiting=false; s.connected=true; s.secretDigits=[1,2,3];
  const u={...initialLocal,clues:['a','b','c']};
  s.recovering=true; assert.equal(roleState(s,u).active,false);
  s.recovering=false; s.submitted=true; assert.equal(roleState(s,u).active,false);
  s.submitted=false; s.deadline=Date.now()-1; assert.equal(roleState(s,u).active,false);
});


test('phase lights identify the acting team for both sides of alternating rounds', () => {
  for (const myTeam of ['A', 'B']) for (const myRole of ['encryptor', 'teammate', 'opponent']) {
    const sendingTeam = myRole === 'opponent' ? myTeam === 'A' ? 'B' : 'A' : myTeam;
    for (const phase of ['encrypting', 'intercept', 'decrypt']) {
      const state = { ...previewState({}, phase), myTeam, myRole };
      const expected = phase === 'intercept' ? sendingTeam === 'A' ? 'B' : 'A' : sendingTeam;
      const signal = phaseSignal(state);
      assert.equal(signal.actingTeam, expected);
      assert.equal(signal.color, expected === myTeam ? '#e9dfc7' : '#afc2cc');
      // Waiting, submitting early or timing out never changes whose team is acting.
      assert.deepEqual(phaseSignal({ ...state, waiting: true, submitted: true, deadline: 1 }), signal);
      assert.equal(rosterTeams(state, initialLocal).find(t => t.team === expected).summary,
        phase === 'encrypting' ? '正在加密' : phase === 'intercept' ? '正在拦截' : '正在解码');
    }
  }
  for (const phase of ['home', 'room', 'round_result', 'game_over']) {
    assert.equal(phaseSignal(previewState({}, phase)).actingTeam, '');
  }
  assert.equal(phaseSignal({ phase: 'intercept', myTeam: '', myRole: '' }).color, '#a2a492');
  assert.equal(phaseSignal({ phase: 'decrypt', myTeam: 'A', myRole: 'observer' }).actingTeam, '');
});


test('every theme keeps relative team colors consistent as sides and actions switch', () => {
  for (const theme of themeChoices) for (const myTeam of ['A', 'B']) {
    const other = myTeam === 'A' ? 'B' : 'A';
    assert.notEqual(theme.own.light, theme.opponent.light);
    assert.notEqual(theme.own.ink, theme.opponent.ink);
    assert.equal(teamPalette(myTeam, myTeam, theme.id), theme.own);
    assert.equal(teamPalette(other, myTeam, theme.id), theme.opponent);
    const state = { ...previewState({}, 'encrypting'), myTeam, myRole: 'teammate' };
    assert.equal(phaseSignal(state, theme.id).color, theme.own.light);
    assert.equal(phaseSignal({ ...state, phase: 'intercept' }, theme.id).color, theme.opponent.light);
    assert.equal(phaseSignal({ ...state, phase: 'decrypt' }, theme.id).color, theme.own.light);
    assert.equal(teamPalette('A', '', theme.id), theme.own, 'A stays colored before joining');
    assert.equal(teamPalette('B', '', theme.id), theme.opponent, 'B stays colored before joining');
    assert.deepEqual(teamPalette('', '', theme.id), { light: '#a2a492', ink: '#596457', plate: '#596457', onPlate: '#f2e8d3' }, 'idle stage has no acting team');
  }
});

test('theme choice persists, with a safe default for obsolete preferences or blocked storage', () => {
  const original = globalThis.localStorage;
  let saved;
  try {
    globalThis.localStorage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
    assert.equal(readTheme(), 'classic');
    for (const theme of themeChoices) { saveTheme(theme.id); assert.equal(readTheme(), theme.id); }
    saved = 'rose'; assert.equal(readTheme(), 'radio', 'previous rose preference migrates to radio');
    saved = 'old-theme'; assert.equal(readTheme(), 'classic');
    globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    assert.doesNotThrow(() => saveTheme('amber'));
    assert.equal(readTheme(), 'classic');
  } finally { globalThis.localStorage = original; }
});


test('theme text stays readable on paper, enamel, CRT glass and unlit LED panels', () => {
  const luminance = hex => {
    const rgb = hex.slice(1).match(/../g).map(n => parseInt(n, 16) / 255)
      .map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
    return rgb.reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
  };
  const readable = (ink, surface, label) => {
    const [low, high] = [luminance(ink), luminance(surface)].sort((a, b) => a - b);
    assert.ok((high + .05) / (low + .05) >= 4.5, label);
  };
  for (const theme of themeChoices) {
    for (const team of [theme.own, theme.opponent]) {
      readable(team.ink, '#e6dec9', `${theme.id}: ink on ivory`);
      readable(team.onPlate, team.plate, `${theme.id}: enamel lettering`);
      readable(team.light, '#111e24', `${theme.id}: screen text`);
    }
    readable(theme.crt.light, theme.crt.background, `${theme.id}: CRT keyword`);
    for (const color of Object.values(theme.led)) readable(color, '#080a09', `${theme.id}: LED die`);
    assert.notEqual(theme.led.word, theme.led.legend, `${theme.id}: two distinct LED colours`);
    assert.equal(theme.led.word, theme.crt.light, `${theme.id}: both hardware options share the device colour`);
    for (const team of [theme.own, theme.opponent])
      assert.notEqual(theme.led.word, team.light, `${theme.id}: device colour is independent of either team`);
  }
});
