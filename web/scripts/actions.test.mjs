import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './load.mjs';

const { reachable } = await import(await moduleUrl('actions'));
const { handleSurfaces } = await import(await moduleUrl('view'));

const machine = { powered: true, online: true, rear: false, batteryOpen: false, pending: false, briefing: false };
const handles = Object.keys(handleSurfaces);
const mains = ['restore-power', 'restore-link', 'power-toggle', 'restore-switch', 'sound-toggle', 'music-toggle'];
const service = ['battery-toggle', 'battery-cell-0', 'battery-cell-3', 'cable-plug-0', 'cable-plug-2', 'lamp-test'];
const panel = ['receiver-sweep', 'meter-amplitude', 'meter-rate-prev', 'brief-skip', 'manual', 'about', 'screen-close', 'guide-done',
  'guide-prev', 'guide-next', 'guide-page-2', 'words', 'mode-create', 'mode-join', 'archive-toggle', 'disk-toggle', 'disk-eject',
  'scope-tune', 'scope-xy-prev', 'slot-1', 'key-0', 'key-4'];
const link = ['leave-room', 'copy-code'];
const server = ['transmit', 'team-A', 'team-B', 'ai-A', 'remove-B-2'];
const every = [...handles, ...mains, ...service, ...panel, ...link, ...server];

test('turning the machine, its mains and its speaker work in every state', () => {
  for (const powered of [true, false]) for (const online of [true, false]) for (const pending of [true, false]) {
    for (const id of [...handles, ...mains]) assert.equal(reachable(id, { ...machine, powered, online, pending }), true, id);
    // The mains switch is on the front; the recovery button beside the machine is not.
    for (const id of [...handles, ...mains])
      assert.equal(reachable(id, { ...machine, powered, online, pending, rear: true }), id !== 'power-toggle', id);
  }
});

test('a dead machine on its front only gives up its disk', () => {
  for (const id of [...service, ...panel, ...link, ...server])
    assert.equal(reachable(id, { ...machine, powered: false, online: false }), id === 'disk-toggle' || id === 'disk-eject', id);
});

test('the service side works without power, except for the lamp test', () => {
  const dead = { ...machine, powered: false, online: false, rear: true, batteryOpen: true };
  for (const id of service) assert.equal(reachable(id, dead), id !== 'lamp-test', id);
  assert.equal(reachable('lamp-test', { ...dead, powered: true }), true);
  // Cells can only be taken out of an open bay, and plugs only pulled from behind.
  assert.equal(reachable('battery-cell-0', { ...machine, rear: true }), false);
  assert.equal(reachable('battery-cell-0', { ...machine, batteryOpen: true }), false);
  assert.equal(reachable('cable-plug-0', machine), false);
  assert.equal(reachable('cable-plug-0', { ...machine, rear: true }), true);
});

test('nothing on the front can be reached from behind', () => {
  for (const id of [...panel, ...link, ...server])
    for (const powered of [true, false]) assert.equal(reachable(id, { ...machine, powered, rear: true, briefing: true }), false, id);
});

test('what the terminal does by itself needs neither the link nor a free line', () => {
  for (const id of panel) assert.equal(reachable(id, { ...machine, online: false, pending: true }), true, id);
});

test('the server is only asked over a live link, one request at a time', () => {
  for (const id of server) {
    assert.equal(reachable(id, machine), true, id);
    assert.equal(reachable(id, { ...machine, online: false }), false, id);
    assert.equal(reachable(id, { ...machine, pending: true }), false, id);
  }
  // Leaving and copying the room code do not wait for a reply.
  for (const id of link) {
    assert.equal(reachable(id, { ...machine, pending: true }), true, id);
    assert.equal(reachable(id, { ...machine, online: false }), false, id);
  }
});

test('ACTION puts a briefing away even without the link', () => {
  assert.equal(reachable('transmit', { ...machine, online: false, pending: true, briefing: true }), true);
  assert.equal(reachable('transmit', { ...machine, online: false, briefing: false }), false);
  assert.equal(reachable('transmit', { ...machine, powered: false, online: false, briefing: true }), false);
});

// The gates in the order the console applied them before they became one function.
function gates(id, m) {
  if (id in handleSurfaces || id === 'restore-power' || id === 'restore-link') return true;
  if (id === 'power-toggle' || id === 'restore-switch') return !(m.rear && id === 'power-toggle');
  if (id === 'sound-toggle' || id === 'music-toggle') return true;
  if (!m.powered && !m.rear && !['disk-toggle', 'disk-eject'].includes(id)) return false;
  if (id === 'battery-toggle') return true;
  if (id.startsWith('battery-cell-')) return m.rear && m.batteryOpen;
  if (id.startsWith('cable-plug-')) return m.rear;
  if (id === 'lamp-test') return m.powered;
  if (m.rear) return false;
  if (id === 'transmit' && m.briefing) return true;
  if (id === 'receiver-sweep' || id.startsWith('meter-amplitude') || id.startsWith('meter-rate') || id === 'brief-skip') return true;
  if (['manual', 'about', 'screen-close', 'guide-done', 'guide-prev', 'guide-next', 'words', 'archive-toggle', 'disk-toggle', 'disk-eject'].includes(id)) return true;
  if (id.startsWith('guide-page-') || id.startsWith('mode-') || id.startsWith('scope-') || id.startsWith('slot-') || id.startsWith('key-')) return true;
  if (id === 'leave-room' || id === 'copy-code') return m.online;
  return m.online && !m.pending;
}

test('every control in every state of the machine passes the same gates as before', () => {
  const flags = ['powered', 'online', 'rear', 'batteryOpen', 'pending', 'briefing'];
  for (let bits = 0; bits < 1 << flags.length; bits++) {
    const state = Object.fromEntries(flags.map((flag, i) => [flag, !!(bits & 1 << i)]));
    for (const id of [...every, 'unknown-control'])
      assert.equal(reachable(id, state), gates(id, state), `${id} in ${JSON.stringify(state)}`);
  }
});
