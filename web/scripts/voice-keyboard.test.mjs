import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { moduleUrl } from './load.mjs';

const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

test('voice shortcuts safely switch channels and release a held microphone after focus or state changes', async t => {
  const globals = ['window', 'navigator', 'AudioContext', 'Element', 'HTMLElement', 'localStorage'];
  const before = new Map(globals.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const listeners = new Map();
  class Element {
    constructor(tagName = 'DIV', editable = false) { this.tagName = tagName; this.isContentEditable = editable; }
    closest() { return /^(INPUT|TEXTAREA|SELECT)$/.test(this.tagName) ? this : null; }
  }
  const track = () => ({ enabled: true, stop() {}, clone: track });
  const microphone = { getAudioTracks: () => [track()], getTracks: () => [] };
  class AudioContext {
    currentTime = 0;
    destination = {};
    async resume() {}
    async close() {}
    createGain() { return { gain: {}, connect() {} }; }
    createAnalyser() { return { getFloatTimeDomainData(samples) { samples.fill(0); } }; }
    createMediaStreamSource() { return { connect() {} }; }
  }
  const browser = {
    addEventListener(name, handler) { listeners.set(name, handler); },
    removeEventListener(name, handler) { if (listeners.get(name) === handler) listeners.delete(name); },
  };
  for (const [name, value] of Object.entries({
    window: browser, navigator: { mediaDevices: { getUserMedia: async () => microphone } }, AudioContext, Element, HTMLElement: Element,
    localStorage: { getItem: () => null, setItem() {} },
  })) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });

  let voice;
  try {
    const require = createRequire(import.meta.url);
    const imports = {
      zustand: pathToFileURL(require.resolve('zustand')).href,
      '@/console/shortcuts': await moduleUrl('shortcuts'),
      '@/console/voice': await moduleUrl('voice'),
      '@/store/gameStore': dataUrl(`
        export const state = {
          voice: 'cloudflare', roomCode: 'ROOM', connected: true, recovering: false,
          phase: 'room', myRole: 'teammate', myPlayerID: 'me', teamA: [{ id: 'me' }], teamB: [],
        };
        export const useGameStore = { subscribe() {}, getState: () => state };
        export function listenVoice() {}
      `),
      './cloudflareVoice': dataUrl(`
        export let outgoing;
        export function cloudflareLink(out, host) { outgoing = out; host.connected(); return { close() {} }; }
      `),
    };
    let source = await readFile(new URL('../src/services/voice.ts', import.meta.url), 'utf8');
    for (const [name, url] of Object.entries(imports)) source = source.replace(JSON.stringify(name), JSON.stringify(url));
    voice = await import(dataUrl(ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    }).outputText));
    const { state: game } = await import(imports['@/store/gameStore']);
    const media = await import(imports['./cloudflareVoice']);
    await voice.startVoice();
    const dispatch = (name, extra = {}) => {
      const event = {
        code: 'Backquote', key: '`', target: new Element(), defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }, ...extra,
      };
      listeners.get(name)?.(event);
      return event;
    };
    const state = () => voice.useVoice.getState();
    const channelKey = extra => dispatch('keydown', { code: 'KeyV', key: 'v', ...extra });
    const activeTracks = () => [media.outgoing.table.enabled, media.outgoing.team.enabled];
    const microphoneState = () => ({ micOn: state().micOn, holding: state().holding, mode: state().mode });

    await t.test('a normal press toggles once; a repeat or other key does nothing', () => {
      assert.equal(state().micOn, true);
      assert.equal(dispatch('keydown').defaultPrevented, true);
      assert.equal(state().micOn, false);
      assert.equal(dispatch('keydown', { repeat: true }).defaultPrevented, false);
      assert.equal(dispatch('keydown', { code: 'KeyX', key: 'x' }).defaultPrevented, false);
      assert.equal(state().micOn, false);
      dispatch('keyup');
      dispatch('keydown');
      assert.equal(state().micOn, true);
    });

    await t.test('typing, composing and browser commands never change the microphone', () => {
      for (const extra of [
        ...['INPUT', 'TEXTAREA', 'SELECT'].map(tag => ({ target: new Element(tag) })),
        { target: new Element('SPAN', true) }, { isComposing: true }, { keyCode: 229 },
        { ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true },
      ]) {
        assert.equal(dispatch('keydown', extra).defaultPrevented, false);
        assert.equal(state().micOn, true);
      }
      dispatch('keydown', { defaultPrevented: true });
      assert.equal(state().micOn, true, 'a control that handled the key keeps it');
    });

    await t.test('unavailable hardware and listening-only mode do not consume the shortcut', () => {
      voice.setMachine(false);
      assert.equal(dispatch('keydown').defaultPrevented, false);
      assert.equal(state().micOn, true);
      voice.setMachine(true);
      voice.useVoice.setState({ listenOnly: 'unavailable' });
      assert.equal(dispatch('keydown').defaultPrevented, false);
      assert.equal(state().micOn, true);
      voice.useVoice.setState({ listenOnly: '' });
    });

    await t.test('V switches both ways and only the selected channel carries the microphone', () => {
      const mic = microphoneState();
      assert.deepEqual(activeTracks(), [true, false]);
      voice.useVoice.setState({ notice: 'a previous phase notice' });
      assert.equal(channelKey().defaultPrevented, true);
      assert.equal(state().whisper, true);
      assert.equal(state().notice, '');
      assert.deepEqual(activeTracks(), [false, true]);
      assert.deepEqual(microphoneState(), mic);
      assert.equal(channelKey({ key: 'V' }).defaultPrevented, true, 'Caps Lock uses the same shortcut');
      assert.equal(state().whisper, false);
      assert.deepEqual(activeTracks(), [true, false]);
      assert.deepEqual(microphoneState(), mic);
      assert.equal(channelKey({ code: 'KeyV', key: 'b' }).defaultPrevented, false, 'the displayed letter follows the keyboard layout');
      assert.equal(channelKey({ code: 'KeyB', key: 'v' }).defaultPrevented, true);
      assert.equal(state().whisper, true);
      assert.equal(voice.toggleVoiceChannel(), true, 'the UI uses the same operation');
      assert.equal(state().whisper, false);
    });

    await t.test('V respects editing, composition, browser shortcuts and repeats', () => {
      for (const extra of [
        ...['INPUT', 'TEXTAREA', 'SELECT'].map(tag => ({ target: new Element(tag) })),
        { target: new Element('SPAN', true) }, { isComposing: true }, { keyCode: 229 },
        { ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { repeat: true },
      ]) {
        assert.equal(channelKey(extra).defaultPrevented, false);
        assert.equal(state().whisper, false);
      }
      channelKey({ defaultPrevented: true });
      assert.equal(state().whisper, false);
    });

    await t.test('channel switching is unavailable during guessing or without a team or a usable joined line', () => {
      const unavailable = () => {
        const voiceBefore = { ...state() };
        assert.equal(channelKey().defaultPrevented, false);
        assert.equal(voice.toggleVoiceChannel(), false);
        assert.deepEqual(state(), voiceBefore, 'a rejected switch changes no voice state');
      };
      game.phase = 'guess';
      unavailable();
      game.phase = 'room';
      game.teamA = [];
      unavailable();
      game.teamA = [{ id: 'me' }];
      voice.setMachine(false);
      unavailable();
      voice.setMachine(true);
      voice.useVoice.setState({ listenOnly: 'unavailable' });
      unavailable();
      voice.useVoice.setState({ listenOnly: '' });
      for (const status of ['off', 'starting', 'reconnecting']) {
        voice.useVoice.setState({ status });
        unavailable();
      }
      voice.useVoice.setState({ status: 'on' });
    });

    await t.test('changing channel preserves a muted or held microphone and the speaking mode', () => {
      voice.setMic(false);
      let mic = microphoneState();
      channelKey();
      assert.deepEqual(microphoneState(), mic);
      assert.deepEqual(activeTracks(), [false, false]);
      voice.setMode('hold');
      voice.hold(true);
      mic = microphoneState();
      assert.deepEqual(activeTracks(), [false, true]);
      channelKey();
      assert.deepEqual(microphoneState(), mic);
      assert.deepEqual(activeTracks(), [true, false]);
      voice.hold(false);
      voice.setMode('toggle');
      voice.setMic(true);
    });

    await t.test('keyup releases even while editing, composing or holding a modifier', () => {
      voice.setMode('hold');
      dispatch('keydown');
      assert.equal(state().holding, true);
      dispatch('keyup', { target: new Element('INPUT'), isComposing: true, ctrlKey: true, defaultPrevented: true });
      assert.equal(state().holding, false);
      dispatch('keydown');
      dispatch('blur');
      assert.equal(state().holding, false, 'switching away cannot leave the microphone held');
    });

    await t.test('power loss clears a held key, and restoring power cannot reopen it', () => {
      dispatch('keydown');
      assert.equal(state().holding, true);
      voice.setMachine(false);
      assert.equal(state().holding, false);
      dispatch('keydown', { repeat: true });
      voice.setMachine(true);
      assert.equal(state().holding, false);
      dispatch('keyup', { target: new Element('TEXTAREA') });
      assert.equal(state().holding, false);
    });

    voice.stopVoice();
    assert.equal(listeners.size, 0, 'leaving voice removes every keyboard listener');
  } finally {
    voice?.stopVoice();
    for (const [name, descriptor] of before) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});
