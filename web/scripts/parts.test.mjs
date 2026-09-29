import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const nodes = async file => {
  const bytes = await readFile(new URL(`../public/models/${file}`, import.meta.url));
  return new Set(JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString()).nodes.map(node => node.name));
};
const sources = async () => {
  const parts = new URL('../src/console/parts/', import.meta.url);
  const files = [new URL('../src/console/engine.ts', import.meta.url), ...(await readdir(parts)).map(name => new URL(name, parts))];
  return Promise.all(files.map(async file => ({ file: file.pathname.split('/src/console/')[1], source: await readFile(file, 'utf8') })));
};
// The first meter lives on the development bench, in a model of its own.
const bench = ['ReceiverNeedle', 'MeterAmplitude', 'MeterRate'];

test('every assembly the engine asks for by name is in the exported model', async () => {
  const model = await nodes('decrypto-console.glb'), vu = await nodes('instrument-vu.glb');
  const asked = [];
  for (const { file, source } of await sources()) {
    for (const [, name] of source.matchAll(/\.(?:moving|part)\(['`]([^'`$]+)['`]\s*[,)]/g)) asked.push([file, name]);
    // Lists of names that are looked up one by one.
    for (const [, list] of source.matchAll(/for \(const (?:name|\[\w+, name\]) of (\[[^\]]*\](?:\])?)\)/g))
      for (const [, name] of list.matchAll(/'([A-Z][\w ]+)'/g)) asked.push([file, name]);
  }
  assert.ok(asked.length >= 20, `found ${asked.length} names`);
  for (const [file, name] of asked) {
    const known = bench.includes(name) ? vu : model;
    assert.ok(known.has(name) || known.has(name.replaceAll(' ', '_')), `${file} asks for "${name}"`);
  }
});

test('assemblies found by a name that is put together are all there', async () => {
  const model = await nodes('decrypto-console.glb');
  const expected = [
    ...[0, 1, 2, 3].map(i => `BatteryCell_${i}`), ...['RJ45', 'Serial', 'DC'].map(name => `CablePlug_${name}`),
    ...['RJ45', 'Serial', 'DC'].map(name => `Tactile_${name} flexible lead`),
    ...['A', 'B'].flatMap(team => [0, 1, 2, 3].map(i => `RosterCard_${team}${i}`)),
    ...['A', 'B'].map(team => `Front_roster team plaque ${team}`),
    ...[0, 1, 2, 3, 4].map(i => `Key_${i}`),
    ...['Tuning', 'Wave', 'Rate', 'Persistence'].map(dial => `Scope${dial}`),
    ...['A', 'B'].flatMap(team => ['intercept', 'failure'].flatMap(kind => [0, 1].map(k => `ScoreFlag_${team}_${kind}_${k}`))),
    ...[0, 1, 2, 3].flatMap(slot => Array.from({ length: 10 }, (_, digit) => `Nixie_Digit_${slot}_${digit}`)),
  ];
  for (const name of expected) assert.ok(model.has(name) || model.has(name.replaceAll(' ', '_')), name);
});

test('no moving assembly contains another, so each can be merged on its own', async () => {
  const bytes = await readFile(new URL('../public/models/decrypto-console.glb', import.meta.url));
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const parent = new Map();
  gltf.nodes.forEach((node, index) => node.children?.forEach(child => parent.set(child, index)));
  const moving = /^(Nixie_Digit_.*|FloppyTransport|FloppyEject|Scope(Tuning|Wave|Rate|Persistence)|TransmitLever|PowerSwitch|Key_[0-4]|BatteryDoor|BatteryCell_[0-3]|CablePlug_.*|RosterCard_[AB][0-3]|Rear(Sound|Music)Switch|RearTestLamp|Connection[ _]lens|Instrument_RJ45[ _]lamp[ _][01]|PaperFeed|Paper[ _]roller|ManualKey|ChannelCopy|ScoreFlag_.*)$/;
  gltf.nodes.forEach((node, index) => {
    if (!moving.test(node.name)) return;
    for (let p = parent.get(index); p !== undefined; p = parent.get(p))
      assert.ok(!moving.test(gltf.nodes[p].name), `${node.name} is inside ${gltf.nodes[p].name}`);
  });
});
