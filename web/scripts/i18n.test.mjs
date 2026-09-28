import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const load = async name => compile(await readFile(new URL(`../src/console/${name}.ts`, import.meta.url), 'utf8'));
const modelUrl = url(await load('model')), mechanicsUrl = url(await load('mechanics')), i18nUrl = url(await load('i18n')), dotMatrixUrl = url(await load('dotMatrix'));
const { initialLocal, previewState, keyDiskIdentity, scopeTimebase, scopeRatio, stepInstrumentValue, receiverSignal, word } = await import(modelUrl);
const { messages, translate, readLocale, saveLocale } = await import(i18nUrl);
const guideUrl = url(compile(await readFile(new URL('../src/console/guide.ts', import.meta.url), 'utf8')));
const { paint } = await import(url((await load('paint')).replace("'./model'", JSON.stringify(modelUrl)).replace("'./mechanics'", JSON.stringify(mechanicsUrl)).replace("'./i18n'", JSON.stringify(i18nUrl)).replace("'./dotMatrix'", JSON.stringify(dotMatrixUrl)).replace("'./guide'", JSON.stringify(guideUrl))));
globalThis.document = { createElement: () => {
  const ink = [], draws = [];
  const canvas = { ink, draws, getContext: () => context };
  const context = new Proxy({ canvas, fillText: value => { ink.push(value); draws.push({ value, color: context.fillStyle, size: parseFloat(context.font.match(/([\d.]+)px/)[1]) }); },
    fillRect: (x, y, w, h) => { if (canvas.background === undefined && x === 0 && y === 0 && w === canvas.width && h === canvas.height) canvas.background = context.fillStyle; },
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
  for (const phase of phases) for (const extra of [{}, { manual: true }, { about: true }, { submitted: true }]) {
    const s = fixture(phase), zh = paint(s, { ...initialLocal, ...extra }), en = paint(s, { ...initialLocal, ...extra, locale: 'en' });
    assert.ok(ink(zh).some(value => /[\u3400-\u9fff]/.test(value)), `${phase}: Chinese is rendered`);
    assert.deepEqual([...ink(en), ...en.targets.map(t => t.label)].filter(value => /[\u3400-\u9fff]/.test(value)), [], `${phase}: no untranslated UI`);
    assert.deepEqual(en.scoreFlags, zh.scoreFlags); assert.deepEqual(en.seats, zh.seats); assert.equal(en.ready, zh.ready);
  }
});
test('language switching preserves user text and fixed legends while localizing active displays', () => {
  const s = fixture('encrypting'); s.teamA[0].nickname = '手册';
  const u = { ...initialLocal, clues: ['等待线索…', 'Harbor', '玫瑰'], name: 'Agent' };
  const zh = paint(s, u), en = paint(s, { ...u, locale: 'en' });
  assert.ok(en.frames.rosterA0.canvas.ink.includes('手册'));
  assert.ok(en.frames.screen.canvas.ink.includes('等待线索…'));
  // Both scripts now use measured glyph coverage on the fine LED grid.
  assert.ok(en.frames.word0.canvas.ink.includes('lighthouse'));
  assert.ok(zh.frames.word0.canvas.ink.includes('灯塔'));
  assert.ok(paint(s, { ...u, locale: 'en', wordDisplay: 'crt' }).frames.word0.canvas.ink.includes('lighthouse'));
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
  assert.equal(translate('en', '加密者 {0}', ['{1}']), 'Encryptor {1}');
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
test('fine LED windows fit one-to-five-character words consistently and retain overflow in a strip', () => {
  const s = previewState({}, 'encrypting');
  const zh = paint(s, initialLocal), en = paint(s, { ...initialLocal, locale: 'en' });
  assert.equal(zh.frames.word1.canvas.draws.find(draw => draw.value === '海岸').size, 20);
  assert.equal(en.frames.word1.canvas.draws.find(draw => draw.value === 'coast').size, 20);
  assert.deepEqual([zh.frames.word1.canvas.width, zh.frames.word1.canvas.height], [120, 70]);
  assert.equal(en.frames.word3.canvas.width, 120);
  s.myWords = ['莎士比亚[shakespeare]', '海岸[coast]', '玫瑰[rose]', '亚特兰蒂斯[atlantis]'];
  assert.equal(paint(s, { ...initialLocal, locale: 'en' }).frames.word0.canvas.width, 120);
  assert.equal(paint(s, initialLocal).frames.word3.canvas.draws.find(draw => draw.value === '亚特兰蒂斯').size, 20);
  s.myWords[0] = 'supercalifragilisticexpialidocious';
  const long = paint(s, initialLocal).frames.word0;
  assert.ok(long.canvas.width > 120);
  assert.ok(long.canvas.ink.includes(s.myWords[0]));
  assert.deepEqual(zh.targets.find(target => target.surface === 'word1'), { ...zh.targets.find(target => target.surface === 'word1'), x: 0, y: 0, w: 120, h: 70 });
});

test('LED privacy travels with the frame while two die colours stay independent of player side', async () => {
  const { themeChoices } = await import(modelUrl);
  const s = previewState({}, 'encrypting');
  for (const theme of themeChoices) for (const myTeam of ['A', 'B']) {
    const out = paint({ ...s, myTeam }, { ...initialLocal, theme: theme.id });
    assert.equal(out.wordInks.word, theme.led.word);
    assert.equal(out.wordInks.legend, theme.led.legend);
    assert.notEqual(out.wordInks.legend, theme.opponent.light);
    assert.equal(out.wordInks.warning, theme.led.legend);
    assert.equal(new Set(Object.values(out.wordInks)).size, 2, 'offline warnings reuse an existing die');
    assert.equal(out.frames.word0.canvas.background, '#000', 'LEDs never receive the CRT background');
    const hidden = paint({ ...s, myTeam }, { ...initialLocal, theme: theme.id, hiddenWords: true });
    assert.notEqual(hidden.wordPrivacyKey, out.wordPrivacyKey);
    assert.ok(!hidden.frames.word0.canvas.ink.includes('灯塔'));
    assert.ok(hidden.frames.word0.canvas.ink.includes('已遮住'));
    const otherTeam = paint({ ...s, myTeam: myTeam === 'A' ? 'B' : 'A' }, { ...initialLocal, theme: theme.id });
    assert.notEqual(otherTeam.wordPrivacyKey, out.wordPrivacyKey);
    assert.deepEqual(otherTeam.wordInks, out.wordInks, 'changing teams keeps the same device colours');
  }
});
test('the earlier tube windows share one type scale, with full long phrases on two lines', () => {
  const s = previewState({}, 'encrypting');
  const zh = paint(s, { ...initialLocal, wordDisplay: 'crt' }), en = paint(s, { ...initialLocal, wordDisplay: 'crt', locale: 'en' });
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


test('private code targets never reach the display until read, or after eject and seat changes', () => {
  const s = fixture('encrypting');
  const id = keyDiskIdentity(s);
  for (const phase of ['absent', 'queued', 'arriving', 'inserting', 'reading', 'ejecting', 'ejected', 'removed', 'returning', 'pulling', 'settling']) {
    for (const locale of ['zh', 'en']) {
      const content = paint(s, { ...initialLocal, locale, keyDisk: { id, phase, startedAt: 0 } });
      const screen = content.frames.screen.canvas.ink;
      for (const digit of s.secretDigits) {
        assert.ok(!screen.includes(String(digit)), `${phase}: private digit is not painted`);
        assert.ok(!screen.includes(word(s.myWords[digit - 1], locale)), `${phase}: private target is not painted`);
      }
      if (locale === 'en') assert.deepEqual(ink(content).filter(value => /[\u3400-\u9fff]/.test(value)), []);
    }
  }
  const local = { ...initialLocal, keyDisk: { id, phase: 'ready', startedAt: 0 } };
  assert.ok(paint(s, local).frames.screen.canvas.ink.includes('玫瑰'));
  assert.ok(!paint({ ...s, round: s.round + 1 }, local).frames.screen.canvas.ink.includes('玫瑰'));
  assert.ok(!paint({ ...s, myRole: 'teammate' }, local).frames.screen.canvas.ink.includes('玫瑰'));
  const ejected = paint(s, { ...local, keyDisk: { ...local.keyDisk, phase: 'ejected' }, diskOut: true, clues: ['保留草稿', '', ''] });
  assert.ok(ejected.frames.screen.canvas.ink.includes('保留草稿'));
  assert.ok(!ejected.frames.screen.canvas.ink.includes('玫瑰'));
  assert.notEqual(ejected.screenPrivacyKey, paint(s, local).screenPrivacyKey, 'CRT outgoing image is revoked');
});


test('CRT palettes reach word textures and white enamel uses dark lettering on either player side', async () => {
  const { themeChoices, teamPalette, wordDisplayOptions } = await import(modelUrl);
  for (const option of wordDisplayOptions) {
    assert.ok(!/[\u3400-\u9fff]/.test(translate('en', option.label)));
    assert.ok(!/[\u3400-\u9fff]/.test(translate('en', option.description)));
  }
  for (const theme of themeChoices) for (const myTeam of ['A', 'B']) {
    assert.ok(!/[\u3400-\u9fff]/.test(translate('en', theme.label)));
    const s = { ...previewState({}, 'encrypting'), myTeam };
    const out = paint(s, { ...initialLocal, theme: theme.id, wordDisplay: 'crt' });
    assert.equal(out.frames.word0.canvas.background, theme.crt.background);
    assert.equal(out.frames.word0.canvas.draws.find(d => d.value === '灯塔').color, theme.crt.light);
    assert.deepEqual(out.wordTube, theme.crt);
    for (const team of ['A', 'B']) {
      const palette = teamPalette(team, myTeam, theme.id);
      assert.equal(out.teamPlates[team], palette.plate);
      assert.ok(out.frames['roster' + team].canvas.draws.every(d => d.color === palette.onPlate));
    }
  }
});

test('guide and original-game pages suspend submission without changing the draft', () => {
  const s = fixture('encrypting');
  const u = { ...initialLocal, clues: ['Garden', 'Sailing', 'Feather'] };
  assert.equal(paint(s, u).ready, true);
  for (const page of ['manual', 'about']) {
    const output = paint(s, { ...u, [page]: true });
    assert.equal(output.ready, false);
    assert.ok(output.targets.find(t => t.id === 'transmit').disabled);
    assert.ok(!output.targets.some(t => t.kind === 'input'));
    assert.ok(output.targets.find(t => t.id === 'screen-close'));
    assert.deepEqual(u.clues, ['Garden', 'Sailing', 'Feather']);
  }
  assert.equal(paint(s, u).ready, true);
});

test('original-game links are native external links and the physical badge opens that page', () => {
  const s = fixture('home');
  const normal = paint(s, initialLocal);
  assert.equal(normal.targets.find(t => t.surface === 'badge').id, 'about');
  const output = paint(s, { ...initialLocal, about: true });
  assert.deepEqual(output.targets.filter(t => t.href).map(t => t.href), [
    'https://www.scorpionmasque.com/en/decrypto',
    'https://boardgamegeek.com/boardgame/225694/decrypto',
    'https://shop.scorpionmasque.com/products/decrypto',
  ]);
});

test('results reveal only the current public history code, never private encryptor state', () => {
  const s = fixture('round_result');
  s.secretDigits = [4, 3, 2];
  s.history = [{ round: s.round - 1, team: 'A', clues: ['Past'], secret: [2, 4, 3] }];
  assert.ok(!paint(s, initialLocal).frames.screen.canvas.ink.includes('本轮密码'));
  s.history.push({ round: s.round, team: 'A', clues: ['One', 'Two', 'Three'], secret: [3, 1, 4] });
  const output = paint(s, initialLocal).frames.screen.canvas.ink;
  assert.ok(output.includes('本轮密码'));
  assert.deepEqual(output.filter(text => /^[1-4]$/.test(text)), ['3', '1', '4']);
});

test('illustrated guide turns through four pages and keeps every worked example', () => {
  for (const theme of ['classic', 'radio', 'amber', 'violet']) {
    const pages = [0, 1, 2, 3].map(guidePage => paint(fixture('home'), { ...initialLocal, theme, manual: true, guidePage }));
    const text = pages.flatMap(output => output.frames.screen.canvas.ink);
    for (const label of ['加密者抽到的密码', '公开线索 · 只说词，不说编号', '前几轮的线索与答案',
      '微光 · 沙滩 · 花束', '港口 · 潮汐 · 迁徙', '刺 · 光束 · 远行', '1·2·3', '1·2·4', '3·1·4']) assert.ok(text.includes(label), `${theme}: ${label}`);
    assert.ok(!text.includes('仅加密者可见'), 'the redundant private-code block is removed');
    assert.ok(pages[3].targets.some(t => t.href?.includes('boardgamegeek.com')), 'the last page links to the original game');
    pages.forEach((output, page) => {
      // One dot per page: the lit one is where you are, the others turn straight to theirs.
      const dots = output.targets.filter(t => t.id.startsWith('guide-page-'));
      assert.deepEqual(dots.map(t => !!t.disabled), [0, 1, 2, 3].map(i => i === page));
      assert.equal(!!output.targets.find(t => t.id === 'guide-prev'), page > 0);
      assert.ok(output.targets.find(t => t.id === (page < 3 ? 'guide-next' : 'guide-done')));
      assert.ok(output.frames.screen.canvas.ink.some(value => value.includes(`${page + 1} / 4`)), `page ${page + 1} names its place`);
      assert.deepEqual(output.targets.filter(t => t.id.startsWith('key-')).map(t => !t.disabled), [true, true, true, true, page > 0], 'the keypad turns pages');
    });
    const first = pages[0].frames.screen.canvas.ink, last = pages[3].frames.screen.canvas.ink;
    assert.ok(!first.includes('3·1·4 ✓') && last.includes('3·1·4 ✓'), 'each page carries its own step');
  }
});

test('a briefing takes the glass before each beat, then hands over to the working page', async () => {
  const { briefingKey } = await import(modelUrl);
  const s = previewState({}, 'encrypting');
  const brief = briefingKey(s);
  const briefed = paint(s, { ...initialLocal, brief }), working = paint(s, initialLocal);
  assert.ok(!briefed.targets.some(t => t.kind === 'input'), 'no clue can be typed under the briefing');
  assert.equal(briefed.targets.find(t => t.surface === 'screen').id, 'brief-skip', 'the whole glass skips ahead');
  assert.ok(briefed.targets.find(t => t.id === 'manual'), 'the guide key stays reachable');
  assert.equal(briefed.screenSignal, brief);
  assert.equal(working.screenSignal, '');
  assert.notEqual(briefed.screenPage, working.screenPage, 'the working page is written out anew');
  assert.ok(working.targets.some(t => t.id === 'clue-0' && t.kind === 'input'));
  assert.ok(paint({ ...s, phase: 'intercept' }, { ...initialLocal, brief }).targets.every(t => t.id !== 'brief-skip'), 'a stale briefing never covers another beat');
  const ink = briefed.frames.screen.canvas.ink;
  for (const text of ['加密', '拦截', '解码', '进行中', '稍后', 'B 队']) assert.ok(ink.includes(text), text);
  assert.ok(ink.some(value => value.startsWith('你来加密')), 'the encryptor learns their task');
  assert.deepEqual(briefed.screenBlink.map(cell => cell.kind), ['cursor'], 'the station in progress blinks');
  const early = paint({ ...previewState({}, 'decrypt'), round: 2 }, { ...initialLocal, brief: briefingKey({ ...s, round: 2, phase: 'decrypt' }) }).frames.screen.canvas.ink;
  assert.ok(early.includes('本轮跳过') && early.some(value => value.startsWith('前两次发报不拦截')), 'early rounds say why nobody intercepts');
});

test('watching screens blink the slot being worked on and keep the round in the header', () => {
  const s = previewState({}, 'waiting');
  const out = paint(s, initialLocal), ink = out.frames.screen.canvas.ink;
  assert.ok(ink.includes('正在写这一条…'));
  assert.equal(ink.filter(value => value === '已写好').length, 2);
  assert.ok(ink.some(value => value.includes('A 队发报')) && ink.some(value => value.includes('加密者 Alice')), 'the header names the round');
  assert.deepEqual(out.screenBlink.map(cell => cell.kind).sort(), ['cursor', 'live']);
  const cursor = out.screenBlink.find(cell => cell.kind === 'cursor');
  assert.ok(cursor.y > 239 + 2 * 92 - 30 && cursor.y < 239 + 2 * 92 + 60, 'the third line blinks');
  const quiet = paint({ ...s, playerProgress: null }, initialLocal);
  assert.deepEqual(quiet.screenBlink.map(cell => cell.kind), ['live'], 'before any progress only the link lamp breathes');
  assert.ok(quiet.frames.screen.canvas.ink.some(value => value.startsWith('链路已接通')));
  assert.deepEqual(paint(s, { ...initialLocal, unpluggedCables: 1 }).screenBlink, [], 'nothing blinks offline');
  const guessing = paint(previewState({}, 'decrypt'), initialLocal);
  assert.deepEqual(guessing.screenBlink.map(cell => cell.kind), ['cursor'], 'the keypad cursor marks the empty slot');
  const intercepting = paint(previewState({}, 'watch-intercept'), initialLocal).frames.screen.canvas.ink;
  assert.ok(intercepting.includes('推敲中') && intercepting.includes('2') && intercepting.includes('1'), 'the encryptor watches the rivals pick');
});

test('results show both answers beside the revealed code', () => {
  const s = fixture('round_result');
  s.history = [...s.history, { round: s.round, team: 'A', clues: ['One', 'Two', 'Three'], secret: [3, 1, 4], intercept: [2, 1, 4], decrypt: [3, 1, 4] }];
  assert.ok(paint(s, initialLocal).frames.screen.canvas.ink.some(value => value.includes('拦截 2·1·4 ✗') && value.includes('解码 3·1·4 ✓')));
  assert.ok(paint(s, { ...initialLocal, locale: 'en' }).frames.screen.canvas.ink.some(value => value.includes('Intercept 2·1·4 ✗')));
});

test('briefings, watching screens and every guide page are fully localized', async () => {
  const { briefingKey } = await import(modelUrl);
  for (const name of ['encrypting', 'waiting', 'listening', 'intercept', 'watch-intercept', 'decrypt', 'watch-decrypt', 'late-game']) {
    const s = previewState({}, name, 'en');
    for (const extra of [{}, { brief: briefingKey(s) }]) {
      const en = paint(s, { ...initialLocal, ...extra, locale: 'en' });
      assert.deepEqual([...en.frames.screen.canvas.ink, ...en.targets.map(t => t.label)].filter(value => /[\u3400-\u9fff]/.test(value)), [], `${name}${extra.brief ? ' briefing' : ''}`);
    }
  }
  for (let guidePage = 0; guidePage < 4; guidePage++) {
    const en = paint(fixture('home'), { ...initialLocal, manual: true, guidePage, locale: 'en' });
    assert.deepEqual([...en.frames.screen.canvas.ink, ...en.targets.map(t => t.label)].filter(value => /[\u3400-\u9fff]/.test(value)), [], `guide page ${guidePage + 1}`);
  }
});
