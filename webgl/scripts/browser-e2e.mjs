// Browser-level E2E: drives a real (headless) Chrome through a full game via
// CDP, while a scripted WS client plays as the second human. Captures a
// screenshot of every distinct view into /tmp/decrypto-shots/.
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

// ---------- scenario ----------
const stateExpr = `JSON.stringify({
  conn: !!document.querySelector('.conn-dot.on'),
  home: !!document.querySelector('.home-card'),
  lobby: !!document.querySelector('.lobby-wrap'),
  canStart: !![...document.querySelectorAll('.btn-start')].find(b=>!b.disabled),
  clueInputs: [...document.querySelectorAll('.clue-inputs input')].filter(i=>!i.disabled).length,
  digits: !!document.querySelector('.digit-selector:not(.disabled)'),
  assign: !!document.querySelector('.word-assign:not(.disabled)'),
  actionBtn: (()=>{const b=[...document.querySelectorAll('.action-panel .btn')].find(x=>!x.disabled && !x.textContent.includes('放弃')); return b?b.textContent.trim():null})(),
  title: document.querySelector('.view-title')?.textContent ?? null,
  banner: document.querySelector('.result-banner-title')?.textContent ?? null,
  over: document.querySelector('.result-banner.big .result-banner-title')?.textContent ?? null,
})`;

// 1. home
let st = JSON.parse(await evalJS(stateExpr));
if (!st.home) fail('home view did not render');
for (let i = 0; i < 20 && !st.conn; i++) {
  await sleep(300);
  st = JSON.parse(await evalJS(stateExpr));
}
if (!st.conn) fail('browser did not connect to WS');
await shot('01-home');

// 2. create room as owner
await evalJS(`(()=>{const i=document.querySelector('.home-card input'); i.value='指挥官'; i.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('.btn-primary').click(); return 1})()`);
await sleep(800);
st = JSON.parse(await evalJS(stateExpr));
if (!st.lobby) fail('lobby did not render after create_room');
const roomCode = await evalJS(`document.querySelector('.lobby-code')?.textContent`);
log(`room: ${roomCode}`);
await shot('02-lobby-empty');

// 3. bot joins team B; browser (owner, auto-placed in team A) adds one AI per team
bot.ws.send(JSON.stringify({ type: 'join_room', data: { room_code: roomCode, nickname: '副官' } }));
await sleep(400);
bot.ws.send(JSON.stringify({ type: 'select_team', data: { team: 'B' } }));
await sleep(500);
await evalJS(`[...document.querySelectorAll('.lobby-foot .btn-small')].find(b=>b.textContent.includes('A'))?.click()`);
await sleep(300);
await evalJS(`[...document.querySelectorAll('.lobby-foot .btn-small')].find(b=>b.textContent.includes('B'))?.click()`);
await sleep(600);
st = JSON.parse(await evalJS(stateExpr));
if (!st.canStart) fail('can_start never became true');
await shot('03-lobby-full');

// 4. start game from the browser (owner)
await evalJS(`document.querySelector('.btn-start')?.click()`);
log('game started');

// 5. play loop
const seen = new Set();
let lastSig = '';
const deadline = Date.now() + 150_000;
while (Date.now() < deadline) {
  await sleep(700);
  st = JSON.parse(await evalJS(stateExpr));

  const sig = `${st.title}|${st.banner}|${st.clueInputs}|${st.digits}|${st.assign}|${st.over}`;
  if (sig !== lastSig) {
    lastSig = sig;
    if (st.over && !seen.has('over')) {
      seen.add('over');
      await shot('90-gameover');
      log(`game over: ${st.over}`);
      break;
    }
    if (st.banner && !seen.has(`banner-${st.banner}`)) {
      seen.add(`banner-${st.banner}`);
      await shot(`80-result-${seen.size}`);
    } else if (st.clueInputs > 0 && !seen.has('encrypt')) {
      seen.add('encrypt');
      await shot('10-encrypt');
    } else if ((st.digits || st.assign) && !seen.has(`input-${st.title}`)) {
      seen.add(`input-${st.title}`);
      await shot(`20-input-${st.title?.replace(/\W+/g, '_')}`);
    } else if (st.title && !seen.has(`wait-${st.title}`)) {
      seen.add(`wait-${st.title}`);
      await shot(`30-wait-${st.title?.replace(/\W+/g, '_')}`);
    }
  }

  // act: fill clues
  if (st.clueInputs > 0) {
    await evalJS(`(()=>{const vals=['北风','夜莺','钟楼']; const ins=[...document.querySelectorAll('.clue-inputs input')].filter(i=>!i.disabled); ins.forEach((el,i)=>{el.value=vals[i]??'信号'; el.dispatchEvent(new Event('input',{bubbles:true}))}); const b=[...document.querySelectorAll('.action-panel .btn')].find(x=>x.textContent.includes('密电')); if(b&&!b.disabled) b.click(); return ins.length})()`);
    log('browser submitted clues');
    continue;
  }
  // act: pick digits (intercept — confirm button enables only after 3 picks)
  if (st.digits) {
    await evalJS(`(()=>{const keys=[...document.querySelectorAll('.digit-selector:not(.disabled) .digit-key')].filter(k=>/^\\d$/.test(k.textContent)); keys[0]?.click(); return 1})()`);
    await sleep(150);
    await evalJS(`(()=>{const keys=[...document.querySelectorAll('.digit-selector:not(.disabled) .digit-key')].filter(k=>/^\\d$/.test(k.textContent)); keys[1]?.click(); return 1})()`);
    await sleep(150);
    await evalJS(`(()=>{const keys=[...document.querySelectorAll('.digit-selector:not(.disabled) .digit-key')].filter(k=>/^\\d$/.test(k.textContent)); keys[2]?.click(); return 1})()`);
    await sleep(200);
    await evalJS(`(()=>{const b=[...document.querySelectorAll('.action-panel .btn')].find(x=>!x.disabled && !x.textContent.includes('放弃')); b?.click(); return 1})()`);
    log(`browser submitted guess (${st.actionBtn ?? 'digits'})`);
    continue;
  }
  // act: assign words to clues (decrypt — click 3 chips then confirm)
  if (st.assign) {
    for (let i = 0; i < 3; i++) {
      await evalJS(`(()=>{const chips=[...document.querySelectorAll('.word-assign:not(.disabled) .word-chip')]; chips[${i}]?.click(); return 1})()`);
      await sleep(150);
    }
    await sleep(200);
    await evalJS(`(()=>{const b=[...document.querySelectorAll('.action-panel .btn')].find(x=>!x.disabled); b?.click(); return 1})()`);
    log(`browser assigned words (${st.actionBtn ?? 'assign'})`);
  }
}

if (!seen.has('over')) fail('game_over not reached in time');
log(`views captured: ${[...seen].join(', ')}`);
console.log(`PASS: browser played a full game; screenshots in ${SHOTS}`);
chrome.kill();
process.exit(0);
