import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';
const moduleUrls = new Map();
async function moduleUrl(name) {
  if (moduleUrls.has(name)) return moduleUrls.get(name);
  const source = await readFile(new URL(`../src/components/console/${name}.ts`, import.meta.url), 'utf8');
  let js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  // Sibling imports resolve to their own data URLs, sharing one instance each.
  for (const dependency of [...js.matchAll(/from '\.\/(\w+)'/g)].map(match => match[1])) {
    js = js.replaceAll(`from './${dependency}'`, `from '${await moduleUrl(dependency)}'`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
  moduleUrls.set(name, url);
  return url;
}
async function moduleFrom(name) { return import(await moduleUrl(name)); }
const { parseNotes, notesKey } = await moduleFrom('notebook');
const { paperPose, receiptVertex, paperSeam, paperFeedDuration, paperCutDuration,
  paperTearDuration, paperExtendedLength, paperTextureLength, paperRestLength, paperRefillDuration, paperLengthForRecords } = await moduleFrom('mechanics');
const { ReceiptTransport, rowFractions, sheetRows, paperStillFrame, defaultPaperStillFrame } = await moduleFrom('tearing');
const { rosterPose } = await moduleFrom('rosterMotion');
const { nextScopeValue } = await moduleFrom('model');
function meanDepth(paper) {
  let total = 0, count = 0;
  for (let i = 0; i <= paper.rows; i++) for (let j = 0; j <= paper.columns; j++) { total += paper.sample(j, i).z; count++; }
  return total / count;
}
test('notes survive serialization, tolerate corrupt storage and separate players and rooms', () => {
  const notes = { general: 'B 队：远行 ≠ 花束\n下一步验证 4 号词。', rounds: { 4: '潮汐可能对应 2 号。' } };
  assert.deepEqual(parseNotes(JSON.stringify(notes)), notes);
  for (const value of [null, 'bad json', 'null', '[]']) assert.deepEqual(parseNotes(value), { general: '', rounds: {} });
  assert.deepEqual(parseNotes('{"general":12,"rounds":{"4":5,"__proto__":"bad","3":"有效"}}'), { general: '', rounds: { 3: '有效' } });
  assert.equal(parseNotes(JSON.stringify({ general: '字'.repeat(11000) })).general.length, 10000);
  assert.equal(new Set([notesKey('5821', 'a', false), notesKey('5821', 'b', false), notesKey('5822', 'a', false), notesKey('5821', 'a', true)]).size, 4);
});
test('stepped selectors wrap in both directions', () => {
  assert.equal(nextScopeValue(4, 5), 0);
  assert.equal(nextScopeValue(0, 4, -1), 3);
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
  const waveParts = node('ScopeWave').children.map(i => gltf.nodes[i].name);
  for (const name of ['ScopeDetail_wave knob body', 'ScopeDetail_wave knob cap', 'ScopeDetail_wave pointer'])
    assert.ok(waveParts.includes(name), `${name} must rotate with ScopeWave`);
  assert.equal(waveParts.filter(name => name.startsWith('ScopeDetail_wave knurl ')).length, 12);
  for (let mark = 0; mark < 5; mark++) for (const fixed of [`ScopeDetail_wave index ${mark}`, `ScopeDetail_wave glyph ${mark}`])
    assert.ok(node(fixed) && !waveParts.includes(fixed), `${fixed} stays engraved on the panel`);
  for (const name of ['ScopeRate', 'ScopePersistence', 'Instrument_signal', 'SignalNeedle', 'SignalGlass',
    'SignalTuning', 'SignalGain', 'SignalSweep']) assert.ok(node(name), name);
  assert.ok(!gltf.nodes.some(n => /^(ConsoleDetail_(monitor toggle|sync toggle|sync lamp)|Archive scroll wheel|Wheel knurl)/.test(n.name)));
  assert.ok(!gltf.nodes.some(n => /screw|bolt|rivet|fastener|washer|ConsoleDetail_decoder lower|Instrument_filter retainer/i.test(n.name) && (n.translation?.[2] ?? 0) > .3), 'front fasteners are removed completely');
  assert.ok(!gltf.nodes.some(n => n.name.endsWith(' head') && node(n.name.slice(0, -5) + ' slot') && (n.translation?.[2] ?? 0) > .3), 'slotted screws are removed even when named after their mounting function');
  assert.ok(node('Instrument_rear captive screw 0 head'), 'rear service screws stay intact');
  const surfaces = JSON.parse(await readFile(new URL('../public/models/console-surfaces.json', import.meta.url), 'utf8'));
  assert.ok(!surfaces.wheel, 'removed wheel must not leave an invisible click surface');
  assert.ok(surfaces.disk.y < -4.3, 'drive stays on the bottom rail');
  assert.ok(!surfaces.power, 'I/O marks are modeled on the fixed legend plate, not a painted plane');
  const power = node('PowerSwitch');
  for (const name of ['PanelRefine_power pivot ball', 'PanelRefine_power bat', 'PanelRefine_power tip', 'PanelRefine_power tip cap'])
    assert.ok(power.children.includes(gltf.nodes.indexOf(node(name))), `${name} swings with the toggle`);
  for (const name of ['Power socket', 'PanelRefine_power hex nut', 'PanelRefine_power collar', 'PanelRefine_power legend plate',
    'PanelRefine_power mark I', 'PanelRefine_power mark O'])
    assert.ok(node(name) && !power.children.includes(gltf.nodes.indexOf(node(name))), `${name} stays fixed`);
  assert.equal(power.extras.throw_degrees, 32);
  const bat = node('PanelRefine_power bat');
  assert.ok(power.translation[1] + bat.translation[1] > node('Power socket').translation[1] + .14, 'bat rises from inside the bushing');
  assert.ok(bat.translation[0] < 0, 'bat rests tipped toward the I mark');
  const tip = gltf.materials[gltf.meshes[node('PanelRefine_power tip').mesh].primitives[0].material];
  assert.equal(tip.name, 'Launch worn red resin');
  assert.ok(surfaces.powerControl.y > 5.37, 'toggle stays on the top side of the sleeve');
  assert.ok(surfaces.powerControl.h >= .8 && surfaces.powerControl.w >= 1.4, 'stable target covers both switch positions');
  assert.ok(surfaces.channel.y - surfaces.channel.h / 2 - (surfaces.score.y + surfaces.score.h / 2) > .3, 'code and score have separate readable areas');
  const dials = ['scopeKnob', 'scopeWaveKnob', 'scopeRateKnob', 'scopePersistenceKnob'];
  for (const key of dials) {
    assert.ok(surfaces[key].y + surfaces[key].h / 2 < surfaces.scope.y - surfaces.scope.h / 2 - .15, 'all scope controls clear the CRT hood');
  }
  dials.slice(1).forEach((key, n) => assert.ok(surfaces[key].x - surfaces[dials[n]].x >= (surfaces[key].w + surfaces[dials[n]].w) / 2 - 1e-9,
    `${key} keeps its own grip beside ${dials[n]}`));
  for (const [key, part] of [['scopeWaveKnob', 'ScopeWave'], ['scopeRateKnob', 'ScopeRate'], ['scopePersistenceKnob', 'ScopePersistence']])
    assert.ok(Math.abs(surfaces[key].x - node(part).translation[0]) < 1e-6, `${key} is registered to ${part}`);
  assert.ok(!surfaces.scopeModeControl, 'the tube is a display, not a push button');
  assert.ok(!gltf.nodes.some(n => n.name.startsWith('Vent slot') || n.name.startsWith('PanelRefine_vent cutter')), 'old fake slots and Boolean cutters never render');
  assert.ok(node('PanelRefine_vent plenum'), 'real openings have a recessed plenum');
  const diskY = node('FloppyTransport').translation[1] + node('Floppy paper label').translation[1];
  assert.ok(Math.abs(diskY - surfaces.disklabel.y) < .03, 'disk print travels with the relocated assembly');
  assert.ok(surfaces.transmitControl.y + surfaces.transmitControl.h / 2 < -3.32, 'launch key clears the receiver panel edge');
  const red = gltf.materials[gltf.meshes[node('Tactile_transmit red key').mesh].primitives[0].material];
  assert.equal(red.name, 'Launch worn red resin');
  assert.equal(red.pbrMetallicRoughness.metallicFactor, 0);
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
  assert.ok(!gltf.nodes.some(n => n.name.startsWith('Speaker perforation')));
  const cap = node('ManualDetail_graphite cap');
  assert.ok(node('ManualKey').children.includes(gltf.nodes.indexOf(cap)));
  const resin = gltf.materials[gltf.meshes[cap.mesh].primitives[0].material];
  assert.equal(resin.pbrMetallicRoughness.metallicFactor, 0);
  assert.ok(!resin.emissiveFactor?.some(n => n > 0));
  assert.ok(!gltf.nodes.some(n => n.name.startsWith('Tactile_manual lamp')));
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
    assert.ok(node(`Tactile_cell positive leaf ${i}`));
  }
  assert.ok(!gltf.nodes.some(n => n.name.startsWith('Tactile_series bridge')), 'series bridges were removed from the tray');
  assert.ok(!node('Tactile_battery red feed') && !node('Tactile_battery return'), 'feed cables were removed from the tray');
  for (const plug of ['RJ45', 'Serial', 'DC']) {
    const assembly = node('CablePlug_' + plug);
    assert.ok(assembly.children.length > 5);
    const leadName = `Tactile_${plug} flexible lead`;
    const lead = node(leadName);
    assert.ok(lead, `${leadName} exists as a separate anchored mesh`);
    assert.ok(!assembly.children.some(i => gltf.nodes[i].name === leadName), `${leadName} must not translate with its plug`);
    const primitive = gltf.meshes[lead.mesh].primitives[0];
    const targets = primitive.targets ?? primitive.extensions?.KHR_draco_mesh_compression?.targets;
    assert.ok(targets?.length >= 1, `${leadName} keeps its morph target through Draco compression`);
    assert.ok(gltf.meshes[lead.mesh].extras?.targetNames?.includes('unplugged'), 'the bending morph is named unplugged');
  }
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
      const assembly = node(`RosterCard_${team}${i}`);
      assert.ok(assembly, 'each card is a removable assembly');
      assert.equal(assembly.extras.removal_axis, 'up');
      assert.ok(assembly.extras.travel > print.h, 'travel clears the full card height from the open-top channel');
      assert.deepEqual(new Set(assembly.children.map(c => gltf.nodes[c].name)),
        new Set([`Front_roster card ${team}${i + 1}`, `Front_roster card edge ${team}${i + 1}`]),
        'only the card and its cut edge slide; clips, channels and wells stay on the rack');
      const well = surfaces[`rosterWell${team}${i}`];
      assert.ok(well, 'empty seats need a stamped well surface');
      assert.ok(well.z < print.z && well.z >= 1.03, 'well print sits on the slot floor, covered by an inserted card');
      assert.ok(Math.abs(well.x - print.x) < .001 && Math.abs(well.w - print.w) < .001, 'well print matches the card rect');
      assert.equal(well.lit, true);
    }
    for (const category of ['intercept', 'failure']) {
      for (let i = 0; i < 2; i++) {
        const name = `${team}_${category}_${i}`;
        const indicator = node('ScoreFlag_' + name);
        assert.equal(indicator.extras.score_flag, name, 'each flag can turn independently with its score');
        assert.ok(!surfaces['scoreToken' + name], 'no flat tokens cover the actual flags');
        assert.ok(node(`ScoreRegister_rim ${team}_${category}`));
      }
    }
  }
  assert.equal(gltf.nodes.filter(n => /^Front_roster card [AB][1-4]$/.test(n.name)).length, 8);
  assert.equal(gltf.nodes.filter(n => n.name.startsWith('Interaction_tear edge tooth ')).length, 35);
  assert.ok(surfaces.paper.z > node('PaperFeed').translation[2]);
  const bezel = gltf.materials[gltf.meshes[node('Score bezel').mesh].primitives[0].material];
  assert.equal(bezel.name, 'Score bezel satin black');
  assert.ok(!bezel.pbrMetallicRoughness.baseColorTexture && !bezel.normalTexture, 'the dark outer bezel stays quiet');
  const plate = gltf.materials[gltf.meshes[node('Front_score enamel bed').mesh].primitives[0].material];
  assert.equal(plate.name, 'Score register faceplate');
  assert.ok(plate.pbrMetallicRoughness.roughnessFactor >= .8, 'the inset score plate keeps a quiet satin finish');
  for (const name of ['Archive column', 'Control deck', 'Power rail', 'Receiver column', 'Scope panel']) {
    const body = gltf.materials[gltf.meshes[node(name).mesh].primitives[0].material];
    assert.equal(body.name, 'Front uniform satin alloy');
    assert.ok(!body.normalTexture && !body.pbrMetallicRoughness.baseColorTexture, 'large body faces have no grain maps');
  }
});

test('the full card path clears fixed retainers and the row above in both directions', async () => {
  const bytes = await readFile(new URL('../public/models/decrypto-console.glb', import.meta.url));
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const node = name => gltf.nodes.find(n => n.name === name);
  const bounds = name => {
    const part = node(name);
    const position = gltf.accessors[gltf.meshes[part.mesh].primitives[0].attributes.POSITION];
    const translation = part.translation ?? [0, 0, 0];
    return { min: position.min.map((v, i) => v + translation[i]), max: position.max.map((v, i) => v + translation[i]) };
  };
  const overlaps = (a, b) => [0, 1, 2].every(i => Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i]) > .00001);
  for (const team of ['A', 'B']) for (let i = 0; i < 4; i++) {
    const assembly = node(`RosterCard_${team}${i}`);
    const fixtures = [`RosterGuide_floor ${team}${i}`, `Front_roster channel ${team}${i + 1}`,
      ...[-1, 1].map(side => `Tactile_card clip ${team}${i} ${side}`)];
    assert.ok(fixtures.every(name => !assembly.children.includes(gltf.nodes.indexOf(node(name)))), 'retainers never belong to a moving card');
    if (i) fixtures.push(`Front_roster card edge ${team}${i}`, `Front_roster channel ${team}${i}`,
      ...[-1, 1].map(side => `Tactile_card clip ${team}${i - 1} ${side}`));
    else fixtures.push(`Front_roster team plaque ${team}`);
    const fixed = fixtures.map(name => ({ name, box: bounds(name) }));
    for (const part of [`Front_roster card ${team}${i + 1}`, `Front_roster card edge ${team}${i + 1}`]) {
      const rest = bounds(part);
      for (let step = 0; step <= 200; step++) {
        const pose = rosterPose(step / 200, assembly.extras.travel);
        const offset = [0, pose.y, pose.z];
        const moving = { min: rest.min.map((v, a) => v + offset[a]), max: rest.max.map((v, a) => v + offset[a]) };
        for (const fixture of fixed) assert.ok(!overlaps(moving, fixture.box), `${part} intersects ${fixture.name} at ${step / 200}`);
      }
    }
  }
});


test('paper feeds continuously from a fixed nip even when extended over the instruments', () => {
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
  assert.equal(paperPose(1, -10).length, paperRestLength);
  assert.equal(paperPose(1, 10).length, paperExtendedLength);
});

test('opening feeds an attached sheet, holds it for reading, and closing alone tears it', () => {
  const paper = new ReceiptTransport();
  paper.sync(true);
  assert.equal(paper.phase, 'feeding');
  assert.equal(paper.advance(paperFeedDuration / 2), false, 'feed is still running while the reader enters');
  assert.ok(paper.pose.extension > 0 && paper.pose.extension < 1);
  assert.equal(paper.pose.tear, 0);
  assert.equal(paper.pose.fold, 0);
  assert.equal(paper.advance(paperFeedDuration / 2), true);
  assert.equal(paper.phase, 'reading');
  assert.equal(paper.pose.extension, 1);
  assert.equal(paper.opacity, 1);
  const held = { ...paper.pose };
  const heldLength = paper.length;
  paper.sync(true);
  assert.equal(paper.advance(60_000), false, 'no duplicate feed completion while reading');
  assert.deepEqual(paper.pose, held, 'the attached sheet remains extended behind the reader');
  paper.sync(false);
  assert.equal(paper.phase, 'tearing');
  assert.deepEqual(paper.pose, held, 'closing does not snap back to the short leader');
  paper.advance(paperTearDuration / 4);
  assert.ok(paper.pose.tear > 0 && paper.pose.tear < 1);
  assert.equal(paper.pose.extension, 1);
  paper.advance(paperTearDuration / 4);
  assert.equal(paper.pose.tear, 1, 'the cut finishes before the extended disappearance');
  assert.ok(paper.opacity > .9 && paper.opacity < 1, 'detached stock remains visible as its slower fade begins');
  paper.advance(paperTearDuration / 4);
  assert.equal(paper.length, heldLength, 'outward disposal moves the sheet without feeding extra stock');
  assert.ok(paper.opacity > .25, 'the sheet stays visible during the outward pull');
  assert.ok(meanDepth(paper) > .4, 'detached stock travels beyond the old disposal distance');
  paper.advance(paperTearDuration / 4);
  assert.equal(paper.opacity, 0, 'old stock clears before a fresh leader appears');
  paper.advance(1000);
  assert.equal(paper.phase, 'idle');
  assert.equal(paper.pose.extension, 0);
  assert.equal(paper.opacity, 1);
});

test('closing during entry tears the partially fed sheet without snapping to full length', () => {
  const paper = new ReceiptTransport();
  paper.sync(true); paper.advance(paperFeedDuration * .4);
  const extension = paper.pose.extension;
  const length = paper.length;
  paper.sync(false);
  assert.equal(paper.pose.extension, extension, 'cancellation starts at the visible length');
  assert.equal(paper.phase, 'tearing');
  assert.equal(paper.advance(paperTearDuration / 2), false);
  assert.equal(paper.pose.extension, extension);
  assert.equal(paper.length, length);
  assert.ok(paper.pose.tear > 0);
  assert.equal(paper.advance(paperTearDuration / 2), false);
  assert.equal(paper.advance(paperRefillDuration), false);
  assert.equal(paper.phase, 'idle');
  assert.equal(paper.pose.extension, 0);
});

test('rapid reopening waits for disposal and never reattaches the torn sheet', () => {
  const paper = new ReceiptTransport();
  paper.sync(true); paper.advance(paperFeedDuration);
  paper.sync(false); paper.advance(paperTearDuration * .5);
  const tear = paper.pose.tear;
  paper.sync(true);
  assert.equal(paper.phase, 'tearing');
  assert.equal(paper.pose.tear, tear);
  assert.equal(paper.advance(paperTearDuration), false);
  assert.equal(paper.advance(1000), false);
  assert.equal(paper.phase, 'feeding');
  assert.equal(paper.advance(paperFeedDuration), true);
  assert.equal(paper.phase, 'reading');
  assert.equal(paper.pose.tear, 0);
  paper.sync(false); paper.advance(100);
  paper.sync(true); paper.sync(false);
  paper.advance(1000); paper.advance(1000);
  assert.equal(paper.phase, 'idle', 'cancelling a queued opening does not show the reader later');
});

test('reduced motion completes opening, closing and an interrupted feed immediately', () => {
  const paper = new ReceiptTransport();
  paper.sync(true); paper.advance(100);
  assert.equal(paper.advance(0, true), true);
  assert.equal(paper.phase, 'reading');
  assert.equal(paper.pose.extension, 1);
  paper.sync(false);
  assert.equal(paper.advance(0, true), false);
  assert.equal(paper.phase, 'idle');
  assert.equal(paper.pose.extension, 0);
  assert.equal(paper.length, paperRestLength);
  assert.equal(paper.opacity, 1);
  paper.sync(true); paper.advance(100); paper.sync(false);
  assert.equal(paper.advance(0, true), false);
  assert.equal(paper.phase, 'idle');
  paper.sync(true); paper.advance(0, true);
  paper.sync(false); paper.advance(50); paper.sync(true);
  assert.equal(paper.advance(0, true), true, 'queued reopening also completes in one reduced-motion frame');
  assert.equal(paper.phase, 'reading');
});

test('a fresh opaque tip feeds continuously from the nip and drives the roller forward', () => {
  const paper = new ReceiptTransport();
  paper.sync(true, 4); paper.advance(paperFeedDuration);
  const fed = paper.feedTravel;
  paper.sync(false); paper.advance(paperTearDuration);
  assert.equal(paper.phase, 'refilling');
  assert.equal(paper.length, 0, 'the old full-size leader never flashes back');
  assert.equal(paper.feedTravel, fed, 'detaching paper must not rewind the feed roller');
  let previousLength = 0;
  for (let step = 1; step <= 52; step++) {
    paper.advance(paperRefillDuration / 52);
    assert.equal(paper.opacity, 1, 'new stock is revealed geometrically, not faded in');
    assert.ok(paper.length > previousLength && paper.length <= paperRestLength);
    for (const across of [0, .5, 1]) for (const fraction of [0, .5, 1]) {
      const vertex = receiptVertex(across, fraction, paper.pose, 2.24, paper.length);
      assert.ok(Object.values(vertex).every(Number.isFinite), 'tiny stock has finite coordinates');
      assert.ok(vertex.y <= -paperSeam, 'new stock emerges only below the nip');
    }
    assert.ok(Math.abs(paper.feedTravel - fed - paper.length) < 1e-9, 'roller travel follows the growing stock');
    previousLength = paper.length;
  }
  assert.equal(paper.phase, 'idle');
  assert.equal(paper.length, paperRestLength);
});

test('archive length grows with completed rounds and is held until the next sheet', () => {
  assert.ok(paperRestLength < .4, 'resting stock is less than half the old 0.8-unit leader');
  let previous = paperRestLength;
  for (let count = 0; count <= 16; count++) {
    const length = paperLengthForRecords(count);
    assert.ok(length > previous && length <= paperExtendedLength);
    previous = length;
  }
  assert.equal(paperLengthForRecords(999), paperExtendedLength);
  for (const count of [-3, NaN, Infinity]) assert.equal(paperLengthForRecords(count), paperLengthForRecords(0));
  const paper = new ReceiptTransport();
  paper.sync(true, 2); paper.advance(paperFeedDuration);
  const length = paper.length;
  paper.sync(true, 8); paper.advance(60_000);
  assert.equal(paper.length, length, 'a live archive update never resizes the sheet being read');
  paper.sync(false, 10); paper.advance(paperTearDuration / 2);
  assert.equal(paper.length, length, 'tearing keeps the same physical stock');
  paper.sync(true, 12); paper.advance(paperTearDuration); paper.advance(paperRefillDuration);
  paper.advance(paperFeedDuration);
  assert.equal(paper.length, paperLengthForRecords(12), 'queued reopening captures the latest completed rounds');
});

test('ink travels with the paper at a constant physical scale during feed and refill', () => {
  const pose = { extension: 0, corner: 0, tear: 0, fold: 0, release: 0 };
  for (const length of [.01, .08, paperRestLength, paperLengthForRecords(0), paperLengthForRecords(16)]) {
    const a = receiptVertex(.5, .6, pose, 2.24, length);
    const distance = length * .6;
    const fed = .05;
    const b = receiptVertex(.5, (distance + fed) / (length + fed), pose, 2.24, length + fed);
    assert.ok(Math.abs(a.v - b.v) < 1e-9, 'a printed mark moves down with the fed stock');
    const c = receiptVertex(.5, .4, pose, 2.24, length);
    assert.ok(Math.abs((c.v - a.v) / (.2 * length) - 1 / paperTextureLength) < 1e-9, 'glyph size stays fixed');
  }
  const collapsed = receiptVertex(.5, 1, pose, 2.24, 0);
  assert.ok(Object.values(collapsed).every(Number.isFinite));
  assert.equal(collapsed.y, -paperSeam);
  assert.equal(collapsed.z, 0);
});

test('the pinch bends the sheet before any fiber parts, then the crack runs from that corner to the far edge', () => {
  const paper = new ReceiptTransport();
  paper.sync(true, 4); paper.advance(paperFeedDuration); paper.sync(false);
  const sheet = paper.sheet;
  assert.ok(sheet, 'closing creates a physical sheet');
  const columns = sheet.columns + 1;
  let breakSteps = 0;
  for (let ms = 0; ms < paperCutDuration; ms += 5) {
    const before = sheet.brokenCount;
    paper.advance(5);
    if (ms + 5 <= 60) assert.equal(sheet.brokenCount, 0, 'fibers hold while the hand only bends the stock over the teeth');
    if (ms + 5 === 60) assert.ok(paper.sample(sheet.columns, 12).z > .03, 'the pinched side has swung toward the viewer');
    if (sheet.brokenCount > before) breakSteps++;
    if (before === 0 && sheet.brokenCount > 0) {
      for (let j = 0; j < columns; j++) if (sheet.broken[j]) assert.ok(j >= columns * .75, 'the cut starts at the pinched corner');
    }
  }
  assert.ok(sheet.detached && sheet.detachedAt < paperCutDuration - 10, 'the last fiber parts on its own inside the cut budget');
  assert.ok(breakSteps >= 12, `fibers part progressively, not in one burst (${breakSteps} steps)`);
  assert.equal(paper.pose.tear, 1);
  assert.ok(paper.pose.release > 0, 'unloading starts once nothing holds the sheet');
});

test('the crack advances where load concentrates: the fiber at its tip is among the most loaded', () => {
  const paper = new ReceiptTransport();
  paper.sync(true, 0); paper.advance(paperFeedDuration); paper.sync(false);
  const sheet = paper.sheet;
  let steps = 0, concentrated = 0;
  for (let ms = 0; ms < paperCutDuration; ms += 5) {
    paper.advance(5);
    if (sheet.brokenCount === 0 || sheet.detached) continue;
    steps++;
    const tip = [...sheet.broken].lastIndexOf(0);
    const ranked = [...sheet.load]
      .map((load, j) => [sheet.broken[j] ? -Infinity : (load - sheet.baseline[j]) / sheet.strength[j], j])
      .sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, j]) => j);
    if (ranked.some(j => Math.abs(j - tip) <= 2)) concentrated++;
  }
  assert.ok(steps >= 10, 'the crack takes several frames to cross the width');
  assert.ok(concentrated >= steps * .75, `the tip led the load in ${concentrated}/${steps} steps`);
});

test('the same closing tears the same way every time', () => {
  const run = () => {
    const paper = new ReceiptTransport();
    paper.sync(true, 4); paper.advance(paperFeedDuration); paper.sync(false); paper.advance(180);
    return paper;
  };
  const a = run(), b = run();
  assert.equal(a.sheet.brokenCount, b.sheet.brokenCount);
  assert.ok(a.sheet.brokenCount > 0);
  for (let i = 0; i <= a.rows; i += 5) for (let j = 0; j <= a.columns; j += 8) assert.deepEqual(a.sample(j, i), b.sample(j, i));
});

test('short, long and half-fed stock all part inside the cut budget and leave toward the viewer', () => {
  for (const [records, feed] of [[0, paperFeedDuration], [16, paperFeedDuration], [4, paperFeedDuration * .4]]) {
    const paper = new ReceiptTransport();
    paper.sync(true, records); paper.advance(feed); paper.sync(false);
    const sheet = paper.sheet;
    assert.equal(sheet.length, paper.length, 'the sheet keeps the visible length at closing');
    let previousDepth = -1;
    for (let ms = 0; ms < paperTearDuration; ms += 20) {
      paper.advance(20);
      if (paper.phase !== 'tearing') break;
      for (let i = 0; i <= paper.rows; i++) for (let j = 0; j <= paper.columns; j++) {
        const vertex = paper.sample(j, i);
        assert.ok(Object.values(vertex).every(Number.isFinite));
        assert.ok(vertex.z >= -1e-9, 'the stock stays in front of the console face');
      }
      const depth = meanDepth(paper);
      if (ms + 20 <= 60) assert.equal(sheet.brokenCount, 0);
      if (ms + 20 >= paperCutDuration + 100) assert.ok(depth > previousDepth - .01, 'the detached sheet keeps moving out');
      previousDepth = depth;
    }
    assert.ok(sheet.detachedAt > 60 && sheet.detachedAt < paperCutDuration - 10, `${records} records: parted at ${sheet.detachedAt}ms`);
    assert.ok(previousDepth > .4, `${records} records: carried clear of the recorder before fading (${previousDepth.toFixed(2)})`);
  }
});

test('stock of any length tears as a stiff sheet: it bends over the teeth but never furls or drapes', () => {
  // Paper resists bending at a radius set by the stock, not by the mesh. A
  // yield or crease threshold taken as a fraction of a stencil's span makes
  // long stock take a set at a radius as large as the sheet, and the archive
  // then hangs, wrinkles and rolls up across its width like cloth.
  for (const records of [0, 4, 16]) {
    const paper = new ReceiptTransport();
    paper.sync(true, records); paper.advance(paperFeedDuration); paper.sync(false);
    const sheet = paper.sheet;
    let narrowest = 1, sharpest = 0;
    const at = (i, j) => sheet.sample(j, i);
    for (let ms = 20; ms <= paperTearDuration; ms += 20) {
      paper.advance(20);
      if (paper.phase !== 'tearing') break;
      // The free tip carries its thermal curl and the tooth line is serrated;
      // the body between them is what has to stay flat across the web.
      for (let i = 2; i < sheet.rows - 1; i++) {
        const left = at(i, 0), right = at(i, sheet.columns);
        narrowest = Math.min(narrowest, Math.hypot(right.x - left.x, right.y - left.y, right.z - left.z) / paper.width);
        for (let j = 1; j < sheet.columns; j++) {
          const a = at(i, j - 1), m = at(i, j), b = at(i, j + 1);
          const span = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1;
          sharpest = Math.max(sharpest, Math.hypot(m.x - (a.x + b.x) / 2, m.y - (a.y + b.y) / 2, m.z - (a.z + b.z) / 2) / span);
        }
      }
    }
    assert.ok(narrowest > .8, `${records} records: the sheet furled to ${(narrowest * 100).toFixed(0)}% of its width`);
    assert.ok(sharpest < 1, `${records} records: the web kinked at ${sharpest.toFixed(1)} of a stencil span`);
  }
});

test('paper-frame without a usable number means the torn sheet in flight', () => {
  assert.equal(paperStillFrame(null), null);
  assert.equal(paperStillFrame(''), defaultPaperStillFrame);
  assert.equal(paperStillFrame('  '), defaultPaperStillFrame);
  assert.equal(paperStillFrame('late'), defaultPaperStillFrame);
  assert.equal(paperStillFrame('0.25'), .25);
  assert.equal(paperStillFrame('0'), 0);
  assert.equal(paperStillFrame('2'), 1);
  assert.equal(defaultPaperStillFrame, .6);
});

test('development stills run the real mechanics to a frame and then hold', () => {
  const paper = new ReceiptTransport();
  paper.still('tear', .25, 4);
  assert.equal(paper.phase, 'tearing');
  assert.ok(paper.pose.tear > 0 && paper.pose.tear < 1, 'a quarter through the tear the crack is running');
  const held = paper.sample(10, 10);
  paper.sync(false); paper.advance(500);
  assert.deepEqual(paper.sample(10, 10), held, 'the console loading with the reader closed keeps the still');
  assert.equal(paper.phase, 'tearing');
  paper.sync(true);
  assert.equal(paper.advance(2000), false, 'pulling the paper resumes the frozen tear');
  assert.equal(paper.phase, 'refilling');
  paper.advance(2000);
  assert.equal(paper.advance(2000), true, 'a fresh sheet feeds for the reader');
  assert.equal(paper.phase, 'reading');
  assert.equal(paper.pose.tear, 0);
  assert.notDeepEqual(paper.sample(10, 10), held);
  paper.still('feed', .5, 4);
  assert.equal(paper.phase, 'feeding');
  assert.ok(paper.pose.extension > 0 && paper.pose.extension < 1);
  paper.still('refill', .5, 4);
  assert.equal(paper.phase, 'refilling');
  assert.ok(paper.length > 0 && paper.length < paperRestLength);
});

test('mesh rows crowd toward the tooth line on long stock and stay uniform on short stock', () => {
  const long = rowFractions(paperLengthForRecords(16));
  assert.equal(long.length, sheetRows + 1);
  assert.equal(long[0], 0);
  assert.ok(Math.abs(long.at(-1) - 1) < 1e-12);
  for (let i = 1; i < long.length; i++) assert.ok(long[i] > long[i - 1]);
  assert.ok(Math.abs(long[18] * paperLengthForRecords(16) - .5) < 1e-9, 'eighteen rows cover the top half unit');
  const short = rowFractions(.36);
  for (let i = 0; i < short.length; i++) assert.ok(Math.abs(short[i] - i / sheetRows) < 1e-9);
  const paper = new ReceiptTransport();
  for (let i = 0; i <= paper.rows; i++) assert.equal(paper.rowFraction(i), short[i], 'idle stock uses the same rows');
});

test('room digits are forty individually addressable wire cathodes inside four glass envelopes', async () => {
  const glb = await readFile(new URL('../public/models/decrypto-console.glb', import.meta.url));
  const gltf = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
  for (let slot = 0; slot < 4; slot++) {
    assert.ok(gltf.nodes.some(n => n.name === `Nixie_${slot} glass`));
    assert.ok(gltf.nodes.some(n => n.name === `Nixie_${slot} anode mesh`));
    assert.ok(gltf.nodes.some(n => n.name === `Nixie_${slot} cathode stack`));
    for (let digit = 0; digit < 10; digit++) {
      const node = gltf.nodes.find(n => n.name === `Nixie_Digit_${slot}_${digit}`);
      assert.ok(node && node.mesh !== undefined);
      assert.equal(node.extras.slot, slot);
      assert.equal(node.extras.digit, digit);
      assert.match(node.extras.cathode_path, /^M /);
      const mat = gltf.materials[gltf.meshes[node.mesh].primitives[0].material];
      assert.ok(mat.emissiveFactor[0] > .9);
    }
  }
});
