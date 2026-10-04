import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './load.mjs';

const { shortcutAction, isEditingTarget, isNativeKeyTarget, controlShortcut, shortcutLabel } =
  await import(await moduleUrl('shortcuts'));

const consoleContext = { editing: false, nativeControl: false, submitInput: false, manual: false, briefing: false };
function press(key, context = {}, event = {}) {
  return shortcutAction({
    key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
    repeat: false, isComposing: false, keyCode: 0, defaultPrevented: false,
    ...event,
  }, { ...consoleContext, ...context });
}

test('the four digits enter a code and Backspace removes its last digit', () => {
  assert.deepEqual(['1', '2', '3', '4', 'Backspace'].map(key => press(key)),
    ['key-0', 'key-1', 'key-2', 'key-3', 'key-4']);
  for (const key of ['0', '5', 'Delete', ' ', 'ArrowLeft']) assert.equal(press(key), null, key);
});

test('plain Enter submits from the console while focused controls retain native activation', () => {
  assert.equal(press('Enter'), 'transmit');
  assert.equal(press('Enter', { nativeControl: true }), null);
  assert.equal(press('Enter', { editing: true, submitInput: true }), null);
  assert.equal(press('Enter', {}, { shiftKey: true }), null);
});

test('Ctrl or Command Enter may submit terminal fields, but cannot submit other text editors', () => {
  for (const modifier of ['ctrlKey', 'metaKey']) {
    const event = { [modifier]: true };
    assert.equal(press('Enter', {}, event), 'transmit');
    assert.equal(press('Enter', { editing: true, nativeControl: true, submitInput: true }, event), 'transmit');
    assert.equal(press('Enter', { editing: true, nativeControl: true }, event), null);
    assert.equal(press('Enter', { manual: true }, event), null);
    assert.equal(press('Enter', {}, { ...event, shiftKey: true }), null);
    assert.equal(press('Enter', {}, { ...event, altKey: true }), null);
  }
});

test('text entry owns navigation, digits and ordinary shortcuts, with Escape available to dismiss', () => {
  for (const key of ['1', '4', 'Backspace', 'h', 'H', 'g', 'G', '?', 'ArrowLeft', 'Enter'])
    assert.equal(press(key, { editing: true }), null, key);
  assert.equal(press('Escape', { editing: true }), 'dismiss');
});

test('IME composition, already handled events and held keys never trigger a console action', () => {
  for (const event of [{ isComposing: true }, { keyCode: 229 }, { defaultPrevented: true }, { repeat: true }]) {
    for (const key of ['1', 'Backspace', 'Enter', 'Escape', '?', 'h', 'g', 'ArrowRight']) {
      assert.equal(press(key, {}, event), null, `${key}: ${JSON.stringify(event)}`);
      assert.equal(press(key, { manual: true }, event), null);
    }
    assert.equal(press('Enter', { editing: true, submitInput: true }, { ...event, ctrlKey: true }), null);
  }
});

test('browser and operating-system modifier combinations do not become console commands', () => {
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
    for (const key of ['1', '4', 'Backspace', 'Escape', '?', 'h', 'g', 'ArrowRight'])
      assert.equal(press(key, {}, { [modifier]: true }), null, `${modifier} + ${key}`);
  }
  assert.equal(press('Enter', {}, { altKey: true }), null);
});

test('history, manual and shortcut help are reachable with letter keys and question mark', () => {
  assert.equal(press('h'), 'archive-toggle');
  assert.equal(press('H', {}, { shiftKey: true }), 'archive-toggle');
  assert.equal(press('g'), 'manual');
  assert.equal(press('G', {}, { shiftKey: true }), 'manual');
  assert.equal(press('?', {}, { shiftKey: true }), 'shortcuts');
  assert.equal(press('Escape'), 'dismiss');
  assert.equal(press('/'), null);
});

test('an open manual uses arrows and page numbers without entering or transmitting a game code', () => {
  const manual = { manual: true };
  assert.equal(press('ArrowLeft', manual), 'guide-prev');
  assert.equal(press('Backspace', manual), 'guide-prev');
  assert.equal(press('ArrowRight', manual), 'guide-next');
  assert.deepEqual(['1', '2', '3', '4'].map(key => press(key, manual)),
    ['guide-page-0', 'guide-page-1', 'guide-page-2', 'guide-page-3']);
  for (const key of ['Enter', ' ', '5']) assert.equal(press(key, manual), null, key);
  assert.equal(press('h', manual), 'archive-toggle');
  assert.equal(press('?', manual, { shiftKey: true }), 'shortcuts');
  assert.equal(press('Escape', manual), 'dismiss');
});

test('briefing continuation takes precedence over game input but not focused controls or editors', () => {
  for (const key of ['Enter', ' ', 'Backspace', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
    assert.equal(press(key, { briefing: true }), 'brief-skip', key);
    assert.notEqual(press(key, { briefing: true, nativeControl: true }), 'brief-skip', key);
    assert.equal(press(key, { briefing: true, editing: true }), null, key);
  }
  assert.equal(press('ArrowRight', { briefing: true, manual: true }), 'guide-next');
  assert.equal(press('h', { briefing: true }), 'archive-toggle');
});

test('visible hints and accessible shortcuts identify the same console controls', () => {
  assert.deepEqual(['key-0', 'key-1', 'key-2', 'key-3', 'key-4'].map(controlShortcut),
    ['1', '2', '3', '4', 'Backspace']);
  assert.equal(controlShortcut('transmit'), 'Control+Enter Meta+Enter');
  assert.equal(shortcutLabel('transmit'), 'Ctrl / ⌘ + Enter');
  assert.equal(controlShortcut('archive-toggle'), 'H');
  assert.equal(controlShortcut('manual'), 'G');
  assert.equal(controlShortcut('voice-talk'), '`');
  assert.equal(controlShortcut('voice-line'), 'V');
  assert.equal(shortcutLabel('unbound-control'), undefined);
});

test('target classification protects nested editor content and native control children', t => {
  class FakeElement {
    constructor(selectors = [], parent = null) {
      this.selectors = selectors;
      this.parent = parent;
    }
    closest(query) {
      return query.split(', ').some(selector => this.selectors.includes(selector))
        ? this : this.parent?.closest(query) ?? null;
    }
  }
  class FakeHTMLElement extends FakeElement {
    get isContentEditable() { return this.editable || this.parent?.isContentEditable || false; }
  }
  for (const [name, value] of [['Element', FakeElement], ['HTMLElement', FakeHTMLElement]]) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else delete globalThis[name];
    });
  }

  for (const selector of ['input', 'textarea', 'select']) {
    const element = new FakeHTMLElement([selector]);
    assert.equal(isEditingTarget(element), true, selector);
    assert.equal(isNativeKeyTarget(element), true, selector);
  }
  const textbox = new FakeHTMLElement(['[role="textbox"]']);
  assert.equal(isEditingTarget(new FakeHTMLElement([], textbox)), true);
  const editor = new FakeHTMLElement();
  editor.editable = true;
  assert.equal(isEditingTarget(new FakeHTMLElement([], editor)), true);
  for (const selector of ['button', 'a[href]', 'summary', '[role="button"]', '[role="slider"]']) {
    const child = new FakeHTMLElement([], new FakeHTMLElement([selector]));
    assert.equal(isNativeKeyTarget(child), true, selector);
    assert.equal(isEditingTarget(child), false, selector);
  }
  for (const target of [null, {}, new FakeHTMLElement()]) {
    assert.equal(isEditingTarget(target), false);
    assert.equal(isNativeKeyTarget(target), false);
  }
});
