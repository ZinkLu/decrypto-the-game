import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';

const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const modelUrl = url(compile(await readFile(new URL('../src/components/console/model.ts', import.meta.url), 'utf8')));
const mechanicsUrl = url(compile(await readFile(new URL('../src/components/console/mechanics.ts', import.meta.url), 'utf8')));
const { initialLocal, previewState } = await import(modelUrl);
const paintSource = await readFile(new URL('../src/components/console/paint.ts', import.meta.url), 'utf8');
const { paint } = await import(url(compile(paintSource).replace("'./model'", JSON.stringify(modelUrl)).replace("'./mechanics'", JSON.stringify(mechanicsUrl))));

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
  assert.deepEqual(idle.targets.filter(t => t.id === 'archive-toggle').map(t => t.surface), ['paper']);
  assert.deepEqual(idle.targets.filter(t => t.id.startsWith('meter-')).map(t => t.surface), ['MeterAmplitudeControl', 'MeterRateControl']);
  assert.equal(Object.values(idle.lamps).filter(Boolean).length, s.scoreA.interceptions + s.scoreA.decrypt_failures + s.scoreB.interceptions + s.scoreB.decrypt_failures);
  assert.equal(idle.activity, 0);
  assert.equal(paint(s, { ...initialLocal, clues: ['花园', '', ''] }).activity, 1 / 3);
  assert.equal(paint(s, { ...initialLocal, clues: ['花园', '航行', '羽毛'] }).activity, 1);
  const home = paint(previewState({}, 'home'), initialLocal);
  assert.equal(home.activity, 0);
  assert.ok(Object.values(home.lamps).every(value => !value));
  assert.ok(home.targets.find(t => t.surface === 'channelCopy').disabled);
});

test('paint carries player identity for occupied-seat exchanges and null for empty slots', () => {
  const s = previewState({}, 'room-partial');
  const before = paint(s, initialLocal);
  assert.equal(before.seats.A0, s.teamA[0].id);
  assert.equal(before.seats.A1, null);
  const replacement = { ...s.teamA[0], id: 'replacement-player' };
  assert.equal(paint({ ...s, teamA: [replacement] }, initialLocal).seats.A0, 'replacement-player');
});

test('power off blocks front input and transmission, and restores the prepared game on power on', () => {
  for (const phase of ['home', 'room', 'encrypting', 'decrypt', 'intercept']) {
    const state = previewState({}, phase);
    const local = { ...initialLocal, name: '测试员', clues: ['花园', '航行', '羽毛'], guess: [3, 1, 4] };
    const before = JSON.stringify({ state, local });
    const on = paint(state, local);
    const off = paint(state, { ...local, powerOn: false });
    assert.equal(off.ready, false);
    assert.equal(off.activity, 0);
    assert.ok(Object.values(off.lamps).every(lit => !lit));
    assert.deepEqual(off.targets.map(t => t.id), ['power-toggle']);
    assert.equal(off.targets[0].surface, 'powerControl');
    assert.equal(off.targets[0].label, '开启终端电源');
    assert.match(off.status, /对局继续进行/);
    const restored = paint(state, { ...local, powerOn: true });
    assert.equal(restored.ready, on.ready);
    assert.deepEqual(restored.lamps, on.lamps);
    assert.deepEqual(restored.targets, on.targets);
    assert.equal(JSON.stringify({ state, local }), before);
  }
});

test('the printed receipt uses the same public archive in preview and live state', () => {
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => {
    const printed = [];
    const localContext = new Proxy({
      measureText: text => ({ width: text.length * 12 }),
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      fillText: text => printed.push(text),
    }, { get: (target, key) => key in target ? target[key] : () => {} });
    return { printed, getContext: () => localContext };
  } };
  try {
    const preview = previewState({}, 'encrypting');
    assert.ok(paint(preview, initialLocal).frames.paper.canvas.printed.includes('远行 / 潮汐 / 花束'));
    const live = { ...preview, history: [{ round: 4, team: 'B', clues: ['真实线索甲', '真实线索乙', '真实线索丙'] },
      { round: 5, team: 'A', clues: ['当前回合不可打印'] }], secretDigits: [2, 3, 4] };
    const content = paint(live, initialLocal);
    assert.equal(content.paperRecords, 1, 'feed length uses only archived rounds, never the current private round');
    assert.equal(paint(preview, initialLocal).paperRecords, 4);
    const printed = content.frames.paper.canvas.printed.join('\n');
    assert.match(printed, /真实线索甲 \/ 真实线索乙 \/ 真实线索丙/);
    assert.match(printed, /密码 未公开/);
    assert.ok(!printed.includes('当前回合不可打印'));
    assert.ok(!printed.includes('2 · 3 · 4'));
  } finally { globalThis.document = originalDocument; }
});
