import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const load = async name => import(`data:text/javascript;base64,${Buffer.from(compile(await readFile(new URL(`../src/components/console/${name}.ts`, import.meta.url), 'utf8'))).toString('base64')}`);
const { qualityChoices, qualityProfiles, describeQuality, settleQuality, frameBudget,
  readQuality, saveQuality, readAutoQuality, saveAutoQuality } = await load('quality');
const { translate, messages } = await load('i18n');

test('high is the full console and every lower level only ever gives something up', () => {
  assert.deepEqual(qualityProfiles.high, { pixelRatio: 2, areaLights: true, shadows: true, screenGlass: true,
    nixieCover: true, crtOptics: 'full', ambientFps: 60, backdropBlur: true });
  const cost = profile => Object.values(profile).map(value => value === 'full' ? 1 : value === 'lite' ? 0 : Number(value));
  for (const [upper, lower] of [['high', 'medium'], ['medium', 'low']]) {
    const above = cost(qualityProfiles[upper]), below = cost(qualityProfiles[lower]);
    assert.deepEqual(Object.keys(qualityProfiles[upper]), Object.keys(qualityProfiles[lower]));
    assert.ok(below.every((value, index) => value <= above[index]), `${lower} adds cost over ${upper}`);
    assert.ok(below.some((value, index) => value < above[index]), `${lower} saves nothing over ${upper}`);
  }
  // Interaction stays smooth at every level: only idle frames are paced, never below the scope's 20 fps step.
  for (const profile of Object.values(qualityProfiles)) assert.ok(profile.ambientFps >= 20 && profile.pixelRatio >= 1);
});

test('the settings hint names every switch of a level in both languages', () => {
  for (const locale of ['zh', 'en']) for (const profile of Object.values(qualityProfiles)) {
    const hint = describeQuality(profile, (message, values) => translate(locale, message, values));
    assert.equal(hint.split(' · ').length, Object.keys(profile).length);
    assert.ok(hint.includes(String(profile.pixelRatio)) && hint.includes(String(profile.ambientFps)));
    if (locale === 'en') assert.ok(!/[㐀-鿿]/.test(hint), hint);
  }
  for (const label of ['画质', '自动', '高', '中', '低']) assert.ok(messages[label]);
});

test('auto keeps a level that fits the frame budget and only ever steps down', () => {
  for (const level of ['high', 'medium', 'low']) {
    assert.equal(settleQuality(level, frameBudget), level);
    assert.equal(settleQuality(level, 2), level);
    assert.equal(settleQuality(level, NaN), level, 'an abandoned measurement changes nothing');
  }
  assert.equal(settleQuality('high', frameBudget + .1), 'medium');
  assert.equal(settleQuality('medium', frameBudget + .1), 'low');
  assert.equal(settleQuality('low', 500), 'low');
  assert.equal(settleQuality('high', 120), 'low', 'a frame far over budget skips the level that could not fit either');
  const order = ['high', 'medium', 'low'];
  for (const level of order) for (const cost of [1, 13, 14, 30, 40, 400])
    assert.ok(order.indexOf(settleQuality(level, cost)) >= order.indexOf(level));
});

test('quality choices survive reloads, bad values and blocked local storage', () => {
  const stored = new Map();
  globalThis.localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) };
  assert.equal(readQuality(), 'auto'); assert.equal(readAutoQuality(), 'high');
  for (const choice of qualityChoices) { saveQuality(choice); assert.equal(readQuality(), choice); }
  saveQuality('medium'); saveAutoQuality('low');
  assert.equal(readAutoQuality(), 'low'); assert.equal(readQuality(), 'medium', 'what Auto measured never replaces the choice');
  stored.set('decrypto-quality', 'ultra'); stored.set('decrypto-quality-auto', 'auto');
  assert.equal(readQuality(), 'auto'); assert.equal(readAutoQuality(), 'high');
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.doesNotThrow(() => { saveQuality('low'); saveAutoQuality('low'); });
  assert.equal(readQuality(), 'auto'); assert.equal(readAutoQuality(), 'high');
});
