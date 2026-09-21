import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const load = async name => compile(await readFile(new URL(`../src/components/console/${name}.ts`, import.meta.url), 'utf8'));
const modelUrl = url(await load('model')), mechanicsUrl = url(await load('mechanics')), i18nUrl = url(await load('i18n'));
const { initialLocal, previewState, scopeTimebase, scopeRatio, stepInstrumentValue, receiverSignal, word } = await import(modelUrl);
const { messages, translate, readLocale, saveLocale } = await import(i18nUrl);
const { paint } = await import(url((await load('paint')).replace("'./model'", JSON.stringify(modelUrl)).replace("'./mechanics'", JSON.stringify(mechanicsUrl)).replace("'./i18n'", JSON.stringify(i18nUrl))));
globalThis.document = { createElement: () => {
  const ink = [], draws = [];
  const canvas = { ink, draws, getContext: () => context };
  const context = new Proxy({ canvas, fillText: value => { ink.push(value); draws.push({ value, size: parseFloat(context.font.match(/([\d.]+)px/)[1]) }); },
    measureText: value => ({ width: [...value].reduce((sum, ch) => sum + (/[^\u0000-\u00ff]/.test(ch) ? 1 : .52), 0) * parseFloat(context.font.match(/([\d.]+)px/)?.[1] || '20') }),
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  return canvas;
} };
const ink = content => Object.values(content.frames).flatMap(f => f.canvas.ink);
const phases = ['home', 'room-empty', 'room-partial', 'encrypting', 'waiting', 'intercept', 'decrypt', 'round_result', 'game_over', 'late-game'];
function fixture(phase) {
  const s = previewState({}, phase);
  for (const player of s.players) player.nickname = `Operator ${player.id}`;
  s.encryptor = 'Operator 0'; s.clues = ['Harbor', 'Time', 'Snow'];
  s.myWords = ['灯塔[lighthouse]', '海岸[coast]', '玫瑰[rose]', '候鸟[migratory bird]'];
  s.history = s.history.map(row => ({ ...row, clues: ['Harbor', 'Time', 'Snow'] }));
  return s;
}
test('both locales cover every public game phase, roster, manual and printed display', () => {
  for (const phase of phases) for (const extra of [{}, { manual: true }, { submitted: true }]) {
    const s = fixture(phase), zh = paint(s, { ...initialLocal, ...extra }), en = paint(s, { ...initialLocal, ...extra, locale: 'en' });
    assert.ok(ink(zh).some(value => /[\u3400-\u9fff]/.test(value)), `${phase}: Chinese is rendered`);
    assert.deepEqual([...ink(en), ...en.targets.map(t => t.label)].filter(value => /[\u3400-\u9fff]/.test(value)), [], `${phase}: no untranslated UI`);
    assert.deepEqual(en.lamps, zh.lamps); assert.deepEqual(en.seats, zh.seats); assert.equal(en.ready, zh.ready);
  }
});
test('language switching preserves user text and fixed legends while localizing active displays', () => {
  const s = fixture('encrypting'); s.teamA[0].nickname = '手册';
  const u = { ...initialLocal, clues: ['等待线索…', 'Harbor', '玫瑰'], name: 'Agent' };
  const zh = paint(s, u), en = paint(s, { ...u, locale: 'en' });
  assert.ok(en.frames.rosterA0.canvas.ink.includes('手册'));
  assert.ok(en.frames.screen.canvas.ink.includes('等待线索…'));
  assert.ok(en.frames.word0.canvas.ink.includes('lighthouse'));
  for (const phase of phases) {
    const output = paint(fixture(phase), { ...u, locale: 'en', powerOn: phase !== 'home' });
    assert.deepEqual(output.frames.transmitLabel.canvas.ink, en.frames.transmitLabel.canvas.ink);
    assert.deepEqual(output.frames.footer.canvas.ink, en.frames.footer.canvas.ink);
  }
  assert.ok(zh.frames.phase.canvas.ink.includes('加密'));
  assert.ok(en.frames.phase.canvas.ink.includes('ENCODE'));
  assert.ok(en.frames.footer.canvas.ink.includes('NETWORK'));
  assert.ok(en.frames.transmitLabel.canvas.ink.includes('ACTION'));
  assert.equal(word('未翻译'), '未翻译'); assert.equal(word('未翻译', 'en'), '未翻译');
});
test('translation parameters preserve braces and placeholders in player text', () => {
  assert.equal(translate('en', '本轮加密者：{0}', ['{1}']), 'Encryptor: {1}');
  for (const [zh, en] of Object.entries(messages)) {
    const fields = value => [...value.matchAll(/\{\d+\}/g)].map(m => m[0]).sort();
    assert.deepEqual(fields(zh), fields(en), zh);
  }
});
test('language preferences survive reloads and blocked local storage', () => {
  let saved; globalThis.localStorage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
  saveLocale('en'); assert.equal(readLocale(), 'en'); saveLocale('zh'); assert.equal(readLocale(), 'zh');
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.doesNotThrow(() => saveLocale('en')); assert.ok(['zh', 'en'].includes(readLocale()));
});
test('analog controls retain fractional changes, physical end stops and finite signal values', () => {
  for (let value = 0; value < 1; value += .001) {
    assert.ok(scopeTimebase(value + .001) < scopeTimebase(value));
    assert.ok(scopeRatio(value + .001) > scopeRatio(value));
    assert.ok(Number.isFinite(receiverSignal(value * 40, value * 4)));
  }
  assert.equal(scopeTimebase(-1), scopeTimebase(0)); assert.equal(scopeTimebase(2), scopeTimebase(1));
  assert.equal(stepInstrumentValue('signal', 'amplitude', 14, .123), 14.123);
  assert.equal(stepInstrumentValue('signal', 'rate', 3.999, .123), 4);
});

test('real preview fixtures print the selected language on the receipt', () => {
  for (const phase of phases) {
    const s = previewState({}, phase, 'en');
    const en = paint(s, { ...initialLocal, locale: 'en' });
    assert.deepEqual(en.frames.paper.canvas.ink.filter(value => /[\u3400-\u9fff]/.test(value)), [], `${phase}: English paper`);
    const zh = paint(previewState({}, phase, 'zh'), initialLocal);
    assert.deepEqual(en.frames.score.canvas.ink, zh.frames.score.canvas.ink, 'scoreboard legends are fixed English');
  }
  const s = previewState({}, 'encrypting', 'en');
  s.history[0].clues = ['自定义中文线索', 'second', 'third'];
  assert.ok(paint(s, { ...initialLocal, locale: 'en' }).frames.paper.canvas.ink.some(value => value.includes('自定义中文线索')), 'actual player clues are not rewritten');
});
test('keywords share one type scale, with full long phrases on two lines', () => {
  const s = previewState({}, 'encrypting');
  const zh = paint(s, initialLocal), en = paint(s, { ...initialLocal, locale: 'en' });
  const sizeOf = (frame, value) => frame.canvas.draws.find(draw => draw.value === value)?.size;
  assert.equal(sizeOf(zh.frames.word1, '海岸'), 60);
  assert.equal(sizeOf(en.frames.word1, 'coast'), 60);
  assert.equal(sizeOf(zh.frames.word2, '玫瑰'), sizeOf(en.frames.word2, 'rose'));
  assert.ok(sizeOf(en.frames.word3, 'migratory') >= 44);
  assert.ok(sizeOf(en.frames.word3, 'bird') >= 44);
  assert.ok(!en.frames.word3.canvas.ink.some(value => value.includes('…')));
});


test('only the native editor owns focused input text, including long multilingual clues', () => {
  const s = fixture('encrypting');
  const clue = '很长的线索 mixed English 0123456789';
  const u = { ...initialLocal, clues: [clue, 'Second clue', 'Third clue'] };
  const idle = paint(s, u), editing = paint(s, { ...u, focus: 'clue-0' });
  assert.ok(idle.frames.screen.canvas.ink.includes(clue));
  assert.ok(!editing.frames.screen.canvas.ink.includes(clue));
  assert.ok(editing.frames.screen.canvas.ink.includes('Second clue'));
  assert.equal(editing.targets.find(t => t.id === 'clue-0').value, clue);
  assert.ok(paint({ ...s, connected: false }, { ...u, focus: 'clue-0' }).frames.screen.canvas.ink.includes(clue));
  const home = fixture('home');
  assert.ok(!paint(home, { ...initialLocal, name: 'Agent name', focus: 'name' }).frames.screen.canvas.ink.includes('Agent name'));
  assert.ok(paint(home, { ...initialLocal, name: 'Agent name' }).frames.screen.canvas.ink.includes('Agent name'));
});
