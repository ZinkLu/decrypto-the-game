import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';
async function moduleFrom(name) {
  const source = await readFile(new URL(`../src/components/console/${name}.ts`, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}
const { parseNotes, notesKey } = await moduleFrom('notebook');
const { waveSample, paperPose } = await moduleFrom('mechanics');
const { nextScopeMode, nextScopeValue } = await moduleFrom('model');
test('notes survive serialization, tolerate corrupt storage and separate players and rooms', () => {
  const notes = { general: 'B 队：远行 ≠ 花束\n下一步验证 4 号词。', rounds: { 4: '潮汐可能对应 2 号。' } };
  assert.deepEqual(parseNotes(JSON.stringify(notes)), notes);
  for (const value of [null, 'bad json', 'null', '[]']) assert.deepEqual(parseNotes(value), { general: '', rounds: {} });
  assert.deepEqual(parseNotes('{"general":12,"rounds":{"4":5,"__proto__":"bad","3":"有效"}}'), { general: '', rounds: { 3: '有效' } });
  assert.equal(parseNotes(JSON.stringify({ general: '字'.repeat(11000) })).general.length, 10000);
  assert.equal(new Set([notesKey('5821', 'a', false), notesKey('5821', 'b', false), notesKey('5822', 'a', false), notesKey('5821', 'a', true)]).size, 4);
});
test('three scope controls wrap and eight signals stay distinct and bounded', () => {
  assert.equal(nextScopeMode(7), 0);
  assert.equal(nextScopeMode(0, -1), 7);
  assert.equal(nextScopeValue(4, 5), 0);
  assert.equal(nextScopeValue(0, 4, -1), 3);
  const waves = Array.from({ length: 8 }, (_, mode) => Array.from({ length: 200 }, (_, i) => waveSample(mode, i * .09)));
  for (const wave of waves) assert.ok(wave.every(n => Number.isFinite(n) && Math.abs(n) <= 1));
  assert.equal(new Set(waves.map(w => JSON.stringify(w))).size, 8);
});

test('exported model keeps housing fixed and paper registered at the feed nip', async () => {
  const bytes = await readFile(new URL('../public/models/decrypto-console.glb', import.meta.url));
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const node = name => gltf.nodes.find(n => n.name === name);
  const diskParts = node('FloppyTransport').children.map(i => gltf.nodes[i].name);
  assert.ok(diskParts.includes('Floppy disk'));
  assert.ok(diskParts.includes('Floppy paper label'));
  assert.ok(!diskParts.includes('Floppy mount'));
  const tuningParts = new Set(node('ScopeTuning').children.map(i => gltf.nodes[i].name));
  for (const name of ['Scope knob', 'Knob pointer', 'ScopeDetail_dial rubber skirt',
    'ScopeDetail_dial knurled rim', 'ScopeDetail_dial ivory cap', 'ScopeDetail_dial hub'])
    assert.ok(tuningParts.has(name), `${name} must rotate with ScopeTuning`);
  assert.equal([...tuningParts].filter(name => name.startsWith('ScopeDetail_dial knurl ')).length, 20);
  for (const name of ['ScopeRate', 'ScopePersistence', 'Tactile_meter scale', 'ReceiverNeedle', 'Tactile_meter bevel glass',
    'ConsoleDetail_monitor toggle stem']) assert.ok(node(name));
  const surfaces = JSON.parse(await readFile(new URL('../public/models/console-surfaces.json', import.meta.url), 'utf8'));
  const feed = node('PaperFeed');
  assert.ok(feed.children.some(i => gltf.nodes[i].name === 'Paper back'));
  assert.ok(!node('Paper curl'), 'the old detached curl must be removed');
  assert.ok(Math.abs(feed.translation[0] - surfaces.paper.x) < .001);
  assert.ok(Math.abs(feed.translation[1] - surfaces.paper.y - surfaces.paper.h / 2) < .001);
  const position = gltf.accessors[gltf.meshes[node('Paper back').mesh].primitives[0].attributes.POSITION];
  assert.ok(Math.abs(position.max[0] - position.min[0] - surfaces.paper.w) < .001);
  assert.ok(position.count >= 160, 'the strip needs subdivisions for its moving curl');
  assert.ok(position.min[2] < 0 && position.max[2] > 0, 'paper has thickness and a curled end');
  assert.ok(!node('Transmit drum'));
  const handle = node('TransmitLever').children.map(i => gltf.nodes[i].name);
  for (const part of ['Tactile_transmit key skirt', 'Tactile_transmit red key']) assert.ok(handle.includes(part));
  assert.equal(node('TransmitLever').extras.mechanism, 'linear_push');
  for (const name of ['TransmitLever', 'Key_0', 'Key_1', 'Key_2', 'Key_3', 'Key_4']) assert.ok(node(name));
});

test('rear model keeps the hinged cover separate from cells and has actual connector contacts', async () => {
  const bytes = await readFile(new URL('../public/models/decrypto-console.glb', import.meta.url));
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const node = name => gltf.nodes.find(n => n.name === name);
  const door = node('BatteryDoor');
  assert.ok(door, 'door needs a hinge node, not only a static mesh');
  const doorParts = door.children.map(i => gltf.nodes[i].name);
  assert.ok(doorParts.includes('Instrument_battery door'));
  assert.ok(doorParts.includes('Instrument_battery latch'));
  assert.ok(doorParts.includes('Instrument_door inner stiffener 0'));
  assert.ok(!doorParts.some(n => n.startsWith('BatteryCell_')));
  for (let i = 0; i < 4; i++) {
    const cell = node(`BatteryCell_${i}`);
    assert.equal(cell.extras.positive_end, i % 2 === 0 ? 'top' : 'bottom');
    assert.ok(cell.children.some(index => gltf.nodes[index].name === `Tactile_positive nipple ${i}`));
    assert.ok(node(`Tactile_cell negative spring ${i}`));
  }
  for (const plug of ['RJ45', 'Serial', 'DC']) assert.ok(node('CablePlug_' + plug).children.length > 5);
  for (let i = 0; i < 8; i++) assert.ok(node(`Instrument_RJ45 contact ${i}`));
  for (const name of ['Instrument_perforated speaker grille', 'RearSoundSwitch', 'RearTestLamp',
    'Instrument_coax lead', 'Instrument_rear service cover']) assert.ok(node(name), name);
  assert.ok(gltf.extensionsRequired.includes('KHR_draco_mesh_compression'));
  assert.ok(bytes.length < 12_000_000, 'keep the geometry plus embedded PBR texture set below 12 MB');
  const alloy = gltf.materials.findIndex(m => m.name === 'Tactile brushed aluminium');
  assert.ok(gltf.materials[alloy].normalTexture);
  assert.ok(gltf.materials[alloy].pbrMetallicRoughness.baseColorTexture);
  assert.ok(gltf.materials[alloy].pbrMetallicRoughness.metallicRoughnessTexture);
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    if (primitive.material === alloy) assert.ok(primitive.attributes.TEXCOORD_0 !== undefined, 'brushed panels retain manufacturing UVs');
  }
});

test('front print surfaces register to eight separate cards and eight physical score indicators', async () => {
  const bytes = await readFile(new URL('../public/models/decrypto-console.glb', import.meta.url));
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const surfaces = JSON.parse(await readFile(new URL('../public/models/console-surfaces.json', import.meta.url), 'utf8'));
  const node = name => gltf.nodes.find(n => n.name === name);
  for (const team of ['A', 'B']) {
    for (let i = 0; i < 4; i++) {
      const card = node(`Front_roster card ${team}${i + 1}`);
      const print = surfaces[`roster${team}${i}`];
      const position = gltf.accessors[gltf.meshes[card.mesh].primitives[0].attributes.POSITION];
      assert.ok(Math.abs(card.translation[0] - print.x) < .001);
      assert.ok(Math.abs(card.translation[1] - print.y) < .001);
      const clearance = print.z - card.translation[2] - position.max[2];
      assert.ok(clearance > 0 && clearance < .008, 'print sits just above the actual cardstock');
      assert.ok(print.z > surfaces.roster.z, 'the card protrudes from the carrier');
      assert.equal(print.lit, true, 'paper print responds to scene lighting');
    }
    for (const category of ['intercept', 'failure']) {
      for (let i = 0; i < 2; i++) {
        const name = `${team}_${category}_${i}`;
        const indicator = node('ScoreLamp_' + name);
        const material = gltf.materials[gltf.meshes[indicator.mesh].primitives[0].material];
        assert.ok(material.name.includes(name), 'each lens can respond independently to its score');
        assert.ok(!surfaces['scoreToken' + name], 'no flat tokens cover the actual lenses');
        assert.ok(node('Interaction_lamp retaining collar ' + name));
      }
    }
  }
  assert.equal(gltf.nodes.filter(n => /^Front_roster card [AB][1-4]$/.test(n.name)).length, 8);
  assert.equal(gltf.nodes.filter(n => n.name.startsWith('Interaction_tear edge tooth ')).length, 35);
  assert.ok(surfaces.paper.z > node('PaperFeed').translation[2]);
});


test('paper feeds continuously from a fixed nip and retracts without shifting sideways', () => {
  let previousLength = 0;
  for (const extension of [0, .1, .3, .5, .8, 1]) {
    const top = paperPose(0, extension), end = paperPose(1, extension);
    assert.equal(top.y, -0); assert.equal(top.z, 0);
    assert.ok(end.length >= previousLength);
    assert.ok(Math.abs(end.y + end.length) < 1e-8);
    assert.ok(Math.abs(end.z - .035) < 1e-8);
    let previousY = 0;
    for (let i = 0; i <= 40; i++) {
      const vertex = paperPose(i / 40, extension);
      assert.ok(vertex.y <= previousY); assert.ok(vertex.z >= 0 && vertex.z <= .0350001);
      previousY = vertex.y;
    }
    previousLength = end.length;
  }
  assert.equal(paperPose(1, -10).length, .43);
  assert.equal(paperPose(1, 10).length, 1.3);
});
