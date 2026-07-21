// Browser-level E2E for the canvas (ui3d) UI: drives a real headless Chrome
// through a full game via CDP, while a scripted WS client plays as the
// second human. Interactions go through the shell's __ui3d hook (hit-area
// clicks, IME input), plus real CDP mouse events for raycast verification.
// Captures screenshots into /tmp/decrypto-shots/.
//
// Usage: node webgl/scripts/browser-e2e.mjs
// Requires: ./server running on :8080, Google Chrome installed (macOS path).

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = '/tmp/decrypto-shots';
const APP = 'http://localhost:8080/';
const WS = 'ws://localhost:8080/ws';
const CDP_PORT = 9333;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};

mkdirSync(SHOTS, { recursive: true });

// ---------- scripted second player ----------
const bot = { ws: new WebSocket(WS), roomCode: null };
bot.ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  const d = msg.data ?? {};
  if (msg.type === 'phase_change') {
    setTimeout(() => {
      if (d.phase === 'encrypting' && d.your_role === 'encryptor') {
        bot.ws.send(JSON.stringify({ type: 'submit_clues', data: { clues: ['烽火', '候鸟', '灯塔'] } }));
      } else if (d.phase === 'intercept' && d.your_role === 'opponent') {
        bot.ws.send(JSON.stringify({ type: 'submit_intercept', data: { guess: [2, 3, 1] } }));
      } else if (d.phase === 'decrypt' && d.your_role === 'teammate') {
        bot.ws.send(JSON.stringify({ type: 'submit_decrypt', data: { guess: [1, 2, 3] } }));
      }
    }, 400);
  }
};
await new Promise((r) => (bot.ws.onopen = r));
log('bot connected');

// ---------- chrome via CDP ----------
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${CDP_PORT}`,
  '--user-data-dir=/tmp/decrypto-cdp-profile',
  '--use-angle=swiftshader',
  '--window-size=1440,900',
  '--hide-scrollbars',
  'about:blank',
]);
process.on('exit', () => chrome.kill());

let version = null;
for (let i = 0; i < 40; i++) {
  try {
    version = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
    break;
  } catch {
    await sleep(250);
  }
}
if (!version) fail('chrome CDP did not come up');

const target = await (
  await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(APP)}`, { method: 'PUT' })
).json();
const cdp = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (cdp.onopen = r));

let msgId = 0;
const pending = new Map();
cdp.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};
function cdpSend(method, params = {}) {
  const id = ++msgId;
  cdp.send(JSON.stringify({ id, method, params }));
  return new Promise((r) => pending.set(id, r));
}
async function evalJS(expression) {
  const res = await cdpSend('Runtime.evaluate', { expression, returnByValue: true });
  return res.result?.result?.value;
}
async function shot(name) {
  const res = await cdpSend('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(res.result.data, 'base64'));
  log(`shot: ${name}`);
}

await cdpSend('Page.enable');
await cdpSend('Runtime.enable');
await sleep(2500);

// ---------- ui3d helpers ----------
const ui3d = (expr) => evalJS(`window.__ui3d ? window.__ui3d.${expr} : null`);
const typeIme = (text) =>
  evalJS(`(()=>{const i=document.querySelector('#ime-capture'); if(!i) return null; i.value=${JSON.stringify(text)}; i.dispatchEvent(new Event('input',{bubbles:true})); return i.value})()`);
async function realClick(id) {
  const p = await ui3d(`areaClient('${id}')`);
  if (!p) return false;
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  await cdpSend('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await cdpSend('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  return true;
}
const keyEvent = async (key, text) => {
  await cdpSend('Input.dispatchKeyEvent', { type: 'keyDown', key, ...(text ? { text } : {}) });
  await cdpSend('Input.dispatchKeyEvent', { type: 'keyUp', key });
};

// ---------- 0. wait for boot + connection ----------
let ok = false;
for (let i = 0; i < 40; i++) {
  const enabled = await ui3d(`area('submit')?.enabled`);
  if (enabled) {
    ok = true;
    break;
  }
  await sleep(300);
}
if (!ok) fail('ui3d did not boot or never connected');
await shot('01-home');

// ---------- 1. field manual via 怎么玩 ----------
if (!(await ui3d(`click('howto')`))) fail('howto hit-area missing');
await sleep(400);
if (!(await ui3d(`paperOpen()`))) fail('manual paper did not open');
await shot('02-manual');
if (!(await ui3d(`paperClick('paper-close')`))) fail('paper-close hit-area missing');
await sleep(300);
if (await ui3d(`paperOpen()`)) fail('manual paper did not close');

// ---------- 2. archive via H key ----------
await keyEvent('h', 'h');
await sleep(400);
if (!(await ui3d(`paperOpen()`))) fail('archive paper did not open on H');
await shot('03-archive-empty');
await keyEvent('Escape');
await sleep(300);
if (await ui3d(`paperOpen()`)) fail('archive paper did not close on Esc');

// ---------- 3. create room (real mouse clicks — raycast verification) ----------
if (!(await realClick('nick'))) fail('real click on nick field missed (raycast broken?)');
await sleep(200);
if ((await typeIme('指挥官')) !== '指挥官') fail('IME capture not wired');
if (!(await realClick('submit'))) fail('real click on submit missed');
await sleep(900);
if ((await ui3d(`viewId()`)) !== 'lobby') fail('did not reach lobby after create_room');
const roomCode = await ui3d(`roomCode()`);
log(`room: ${roomCode}`);
await shot('04-lobby-empty');

// ---------- 4. bot joins team B, owner adds AI to both teams, start ----------
bot.ws.send(JSON.stringify({ type: 'join_room', data: { room_code: roomCode, nickname: '副官' } }));
await sleep(400);
bot.ws.send(JSON.stringify({ type: 'select_team', data: { team: 'B' } }));
await sleep(400);
await ui3d(`click('ai-a')`);
await sleep(300);
await ui3d(`click('ai-b')`);
await sleep(600);
ok = false;
for (let i = 0; i < 20; i++) {
  const enabled = await ui3d(`area('start')?.enabled`);
  if (enabled) {
    ok = true;
    break;
  }
  await sleep(300);
}
if (!ok) fail('can_start never became true');
await shot('05-lobby-full');
await ui3d(`click('start')`);
log('game started');

// ---------- 5. play loop ----------
const seen = new Set();
let lastView = '';
const deadline = Date.now() + 200_000;
while (Date.now() < deadline) {
  await sleep(700);
  const view = await ui3d(`viewId()`);
  if (!view) continue;

  if (view !== lastView) {
    lastView = view;
    if (!seen.has(view)) {
      seen.add(view);
      await shot(`view-${seen.size}-${view}`);
    }
  }

  if (view === 'gameover') {
    log('game over reached');
    break;
  }
  if (view === 'encrypt') {
    // only act once per round: clue fields are disabled after submitting
    const editable = await ui3d(`area('clue-0')?.enabled`);
    if (editable) {
      await ui3d(`click('clue-0')`);
      await typeIme('北风');
      await ui3d(`click('clue-1')`);
      await typeIme('夜莺');
      await ui3d(`click('clue-2')`);
      await typeIme('钟楼');
      await sleep(150);
      await ui3d(`click('submit')`);
      log('browser submitted clues');
    }
    continue;
  }
  if (view === 'intercept-input') {
    const submittable = await ui3d(`area('submit')?.enabled`);
    const slots = await ui3d(`area('slot-0')?.enabled`);
    if (slots) {
      await ui3d(`click('key-1')`);
      await sleep(120);
      await ui3d(`click('key-2')`);
      await sleep(120);
      await ui3d(`click('key-3')`);
      await sleep(150);
      await ui3d(`click('submit')`);
      log('browser submitted intercept');
    } else if (!submittable) {
      // already submitted — idle
    }
    continue;
  }
  if (view === 'decrypt-input') {
    const rowsEnabled = await ui3d(`area('row-0')?.enabled`);
    if (rowsEnabled) {
      await ui3d(`click('word-0')`);
      await sleep(120);
      await ui3d(`click('word-1')`);
      await sleep(120);
      await ui3d(`click('word-2')`);
      await sleep(150);
      await ui3d(`click('submit')`);
      log('browser submitted decrypt');
    }
    continue;
  }
}

if (!seen.has('gameover')) fail('game_over not reached in time');
await shot('90-gameover');

// ---------- 6. codebook prop opens the archive (real mouse on the 3D book) ----------
const bookPos = await ui3d(`codebookClient()`);
if (!bookPos) fail('codebook prop has no client position');
await cdpSend('Input.dispatchMouseEvent', {
  type: 'mousePressed',
  x: Math.round(bookPos.x),
  y: Math.round(bookPos.y),
  button: 'left',
  clickCount: 1,
});
await cdpSend('Input.dispatchMouseEvent', {
  type: 'mouseReleased',
  x: Math.round(bookPos.x),
  y: Math.round(bookPos.y),
  button: 'left',
  clickCount: 1,
});
await sleep(500);
if (!(await ui3d(`paperOpen()`))) fail('codebook prop click did not open the archive');
await shot('91-archive-history');
await keyEvent('Escape');
await sleep(300);

// ---------- 7. back home ----------
await ui3d(`click('home')`);
await sleep(600);
if ((await ui3d(`phase()`)) !== 'home') fail('reset did not return home');

log(`views captured: ${[...seen].join(', ')}`);
console.log(`PASS: browser played a full game on the canvas UI; screenshots in ${SHOTS}`);
chrome.kill();
process.exit(0);
