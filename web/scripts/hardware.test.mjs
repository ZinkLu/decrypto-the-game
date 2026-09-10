import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';

const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const modelUrl = url(compile(await readFile(new URL('../src/components/console/model.ts', import.meta.url), 'utf8')));
const { initialLocal, previewState } = await import(modelUrl);
const paintSource = await readFile(new URL('../src/components/console/paint.ts', import.meta.url), 'utf8');
const { paint } = await import(url(compile(paintSource).replace("'./model'", JSON.stringify(modelUrl))));

// These tests validate control routing, not pixel output. Browser checks cover
// the actual WebGL model, controls, text input, and the hinge animation.
const context = new Proxy({
  measureText: text => ({ width: text.length * 12 }),
  createLinearGradient: () => ({ addColorStop() {} }),
  createRadialGradient: () => ({ addColorStop() {} }),
}, { get: (target, key) => key in target ? target[key] : () => {} });
globalThis.document = { createElement: () => ({ getContext: () => context }) };

test('front and rear control targets are disjoint in every game phase', () => {
  for (const phase of ['home', 'room', 'encrypting', 'intercept', 'decrypt', 'waiting', 'round_result', 'game_over']) {
    const state = previewState({}, phase);
    const front = paint(state, { ...initialLocal, backView: false });
    const rear = paint(state, { ...initialLocal, backView: true });
    assert.ok(front.targets.some(t => t.id === 'scope-tune'));
    assert.ok(!front.targets.some(t => t.id === 'battery-toggle'));
    assert.deepEqual(rear.targets.map(t => t.id), ['battery-toggle', 'sound-toggle', 'lamp-test', 'cable-plug-0', 'cable-plug-1', 'cable-plug-2']);
    assert.ok(!rear.targets.some(t => t.id === 'transmit' || t.kind === 'input'));
  }
});

test('hardware exploration preserves clues and guesses and reports toggle state', () => {
  const state = previewState({}, 'encrypting');
  const local = { ...initialLocal, clues: ['花园', '航行', '羽毛'], guess: [3,1,4],
    backView: true, batteryOpen: true, soundOn: true };
  const before = JSON.stringify(local);
  const rear = paint(state, local);
  assert.equal(JSON.stringify(local), before);
  assert.equal(rear.targets.find(t => t.id === 'battery-toggle').label, '合上电池仓盖');
  assert.equal(rear.targets.find(t => t.id === 'sound-toggle').label, '关闭机械音效');
  assert.equal(rear.targets.filter(t => t.id.startsWith('battery-cell-')).length, 4);
  const removed = paint(state, { ...local, removedBatteries: 5, unpluggedCables: 2 });
  assert.equal(removed.targets.find(t => t.id === 'battery-cell-0').label, '装回第 1 节电池');
  assert.equal(removed.targets.find(t => t.id === 'battery-cell-1').label, '取出第 2 节电池');
  assert.equal(removed.targets.find(t => t.id === 'cable-plug-1').label, '插回串口线');
  assert.ok(!paint(state, { ...local, batteryOpen: false }).targets.some(t => t.id.startsWith('battery-cell-')));
  assert.equal(paint(state, { ...local, backView: false }).ready, true);
});

test('reading the roster pauses entry targets and restores the prepared transmission on return', () => {
  const s = previewState({}, 'decrypt');
  const u = { ...initialLocal, guess: [3, 1, 4] };
  const open = paint(s, { ...u, rosterOpen: true });
  assert.equal(open.ready, false);
  assert.ok(open.targets.filter(t => t.id.startsWith('key-')).every(t => t.disabled));
  assert.ok(!open.targets.some(t => t.id.startsWith('slot-')));
  assert.ok(open.targets.some(t => t.id === 'roster-toggle' && t.surface === 'screen'));
  assert.equal(paint(s, u).ready, true);
  assert.deepEqual(u.guess, [3, 1, 4]);
});


test('fixed lettering is separate from push keys and actual game state drives instruments', () => {
  const s = previewState({}, 'encrypting');
  const idle = paint(s, initialLocal);
  assert.ok(!idle.targets.some(t => t.surface === 'brand' || t.surface === 'channel'));
  assert.ok(idle.targets.some(t => t.id === 'copy-code' && t.surface === 'channelCopy'));
  assert.equal(idle.targets.find(t => t.id === 'transmit').surface, 'transmitControl');
  assert.equal(Object.values(idle.lamps).filter(Boolean).length, s.scoreA.interceptions + s.scoreA.decrypt_failures + s.scoreB.interceptions + s.scoreB.decrypt_failures);
  assert.equal(idle.activity, 0);
  assert.equal(paint(s, { ...initialLocal, clues: ['花园', '', ''] }).activity, 1 / 3);
  assert.equal(paint(s, { ...initialLocal, clues: ['花园', '航行', '羽毛'] }).activity, 1);
  const home = paint(previewState({}, 'home'), initialLocal);
  assert.equal(home.activity, 0);
  assert.ok(Object.values(home.lamps).every(value => !value));
  assert.ok(home.targets.find(t => t.surface === 'channelCopy').disabled);
});
