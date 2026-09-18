import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import ts from 'typescript';

const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const modelUrl = dataUrl(compile(await readFile(new URL('../src/components/console/model.ts', import.meta.url), 'utf8')));
const { initialLocal } = await import(modelUrl);
const source = compile(await readFile(new URL('../src/components/console/instruments.ts', import.meta.url), 'utf8'))
  .replace("'three'", JSON.stringify(import.meta.resolve('three')))
  .replace("'three/addons/utils/BufferGeometryUtils.js'", JSON.stringify(import.meta.resolve('three/addons/utils/BufferGeometryUtils.js')))
  .replace("'./model'", JSON.stringify(modelUrl));
const { ConsoleInstruments } = await import(dataUrl(source));

// Exercise runtime transforms against the exported hierarchy without a GPU.
// Mesh buffers are unnecessary for checking which physical assemblies move.
async function assemblyScene() {
  const bytes = await readFile(new URL('../public/models/decrypto-console.glb', import.meta.url));
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const nodes = gltf.nodes.map(node => {
    const group = new THREE.Group();
    group.name = node.name || '';
    if (node.matrix) group.applyMatrix4(new THREE.Matrix4().fromArray(node.matrix));
    else {
      if (node.translation) group.position.fromArray(node.translation);
      if (node.rotation) group.quaternion.fromArray(node.rotation);
      if (node.scale) group.scale.fromArray(node.scale);
    }
    return group;
  });
  gltf.nodes.forEach((node, index) => node.children?.forEach(child => nodes[index].add(nodes[child])));
  const scene = new THREE.Group();
  for (const root of gltf.scenes[gltf.scene ?? 0].nodes) scene.add(nodes[root]);
  return scene;
}

test('AUTO changes the pointer while tuning, gain and switch assemblies remain stationary', async () => {
  const scene = await assemblyScene();
  let seed = 293;
  const studies = new ConsoleInstruments(scene, undefined, () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296));
  const local = { ...initialLocal };
  studies.update(local);
  // Settle the switch into AUTO and both knobs into their manually selected positions.
  for (let i = 0; i < 180; i++) studies.tick(i * 1000 / 60, 1 / 60, false);
  const tuning = scene.getObjectByName('SignalTuning');
  const gain = scene.getObjectByName('SignalGain');
  const toggle = scene.getObjectByName('SignalSweep');
  const needle = scene.getObjectByName('SignalNeedle');
  const rest = [tuning.rotation.z, gain.rotation.z, toggle.rotation.x];
  const angles = [];
  for (let i = 180; i < 600; i++) {
    studies.tick(i * 1000 / 60, 1 / 60, false);
    angles.push(needle.rotation.z);
    [tuning.rotation.z, gain.rotation.z, toggle.rotation.x].forEach((value, index) => assert.ok(Math.abs(value - rest[index]) < 1e-9));
  }
  assert.ok(Math.max(...angles) - Math.min(...angles) > .4);
  studies.update({ ...local, instrumentDemo: false });
  for (let i = 0; i < 120; i++) studies.tick(10000 + i * 1000 / 60, 1 / 60, false);
  assert.ok(Math.abs(tuning.rotation.z - rest[0]) < 1e-9, 'returning to MAN keeps the manual tuning setting');
  studies.update(local);
  studies.tick(20000, 1 / 60, true);
  const held = needle.rotation.z;
  studies.tick(40000, 1, true);
  assert.equal(needle.rotation.z, held, 'reduced motion freezes the automatic signal');
});

test('the shipped console includes the default receiver and its physical switch without study assets', async () => {
  assert.equal(initialLocal.instrumentVariant, 'signal');
  assert.equal(initialLocal.instrumentDemo, true);
  const scene = await assemblyScene();
  const receiver = scene.getObjectByName('Instrument_signal');
  assert.ok(receiver);
  assert.ok(receiver.position.distanceTo(new THREE.Vector3(5.83, -1.4, 0)) < 1e-5);
  for (const name of ['SignalNeedle', 'SignalTuning', 'SignalGain', 'SignalSweep']) assert.ok(receiver.getObjectByName(name));
  for (const name of ['ReceiverNeedle', 'MeterAmplitude', 'MeterRate', 'Instrument_tuning', 'Instrument_status']) assert.equal(scene.getObjectByName(name), undefined);
  const surfaces = JSON.parse(await readFile(new URL('../public/models/console-surfaces.json', import.meta.url), 'utf8'));
  assert.deepEqual(surfaces.receiverSweepControl, { x: 5.83, y: -2.50, z: .755, w: .42, h: .56 });
  const instruments = new ConsoleInstruments(scene);
  instruments.update(initialLocal);
  assert.equal(receiver.visible, true);
});
