// GPU power of the console as players meet it: the engine's own frame loop, idle, with the mouse moving, while a knob
// turns (every frame a full one) and in a background window. When the DEV engine has a `partialRedraw` switch, both
// settings are measured interleaved.
//
//   ./chrome.sh && node power.mjs --size 2560x1300@2 --preview late-game --quality high --rounds 3
//
// Watts are system-wide (other apps included); "+W" subtracts a baseline in which the page draws nothing, measured
// in the same run. Busy % is the browser GPU process's share of time: it hardly moves, because the governor trades clock for it.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { connect, openConsole, sleep, args, ENGINE } from './cdp.mjs';
import { gpuTimes, gpuPids, sumFor } from './gpu.mjs';

const o = args({ url: 'http://127.0.0.1:3000', preview: 'late-game', quality: 'high', rounds: 3, window: 6, locale: '' });
const iowin = fileURLToPath(new URL('./iowin.py', import.meta.url));
const browser = await connect();
const page = await openConsole(browser, `${o.url}/?preview=${o.preview}&brief=off&quality=${o.quality}`,
  { width: o.width, height: o.height, scale: o.scale, storage: o.locale ? { 'decrypto-locale': o.locale } : {} });
const pids = await gpuPids(browser);
const modes = await page.evaluate(`'partialRedraw' in ${ENGINE} ? [true, false] : [null]`);
await page.evaluate(`(() => {
  const e = ${ENGINE}, canvas = e.renderer.domElement, render = e.renderer.render.bind(e.renderer);
  // Frames the engine drew: its own counters when it has them, otherwise scene renders.
  window.__renders = 0;
  e.renderer.render = (scene, camera) => { if (scene === e.scene) window.__renders++; return render(scene, camera); };
  window.__frames = () => canvas.dataset.fullFrames !== undefined ? Number(canvas.dataset.fullFrames) + Number(canvas.dataset.partialFrames) : window.__renders;
  const tick = e.tick;
  window.__still = still => { if (still) { e.tick = () => {}; cancelAnimationFrame(e.raf); clearTimeout(e.sleep); e.raf = 0; } else { e.tick = tick; e.wake(); } };
  return true;
})()`);
const idleFor = () => page.evaluate(`performance.now() - ${ENGINE}.lastInput`);
let mouse = null;
const moveMouse = () => { let stop = false, x = 400, dx = 7; const run = (async () => { while (!stop) {
  x += dx; if (x > o.width - 400 || x < 400) dx = -dx;
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: Math.round(o.height / 2) }); await sleep(33); } })();
  return async () => { stop = true; await run; }; };

// A knob kept turning by keyboard notches, the way a player tunes the scope: its frames carry motion, not just ambience.
const turnKnob = () => { let stop = false, sign = 1; const run = (async () => { while (!stop) {
  sign = -sign;
  const key = sign > 0 ? 'ArrowRight' : 'ArrowLeft';
  await page.evaluate(`(() => { const knob = document.querySelector('.station-controls [data-control="scope-tune"]');
    knob?.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', shiftKey: true, bubbles: true })); return !!knob; })()`);
  await sleep(120); } })();
  return async () => { stop = true; await run; }; };

async function measure() {
  const f0 = await page.evaluate('window.__frames()'), g0 = sumFor(gpuTimes(), pids), t0 = Date.now();
  const p = JSON.parse(execFileSync('python3', [iowin, String(o.window)], { encoding: 'utf8' }));
  const f1 = await page.evaluate('window.__frames()'), g1 = sumFor(gpuTimes(), pids), dt = (Date.now() - t0) / 1000;
  return { fps: (f1 - f0) / dt, busy: (g1 - g0) / 1e6 / dt / 10, ...p };
}
const results = new Map();
const record = (name, r) => results.set(name, [...(results.get(name) ?? []), r]);
const label = mode => mode === null ? 'current' : mode ? 'partial on' : 'partial off';
const shuffled = list => [...list].sort(() => Math.random() - .5);

for (let round = 0; round < Number(o.rounds); round++) {
  await page.evaluate('(window.__still(true), true)'); await sleep(1500); record('baseline (nothing drawn)', await measure());
  await page.evaluate('(window.__still(false), true)');
  // Idle: more than ten seconds without pointer, key or wheel input.
  const wait = 11000 - await idleFor(); if (wait > 0) await sleep(wait);
  for (const mode of shuffled(modes)) {
    if (mode !== null) await page.evaluate(`(${ENGINE}.partialRedraw = ${mode}, true)`);
    await sleep(2000); record(`idle, ${label(mode)}`, await measure());
  }
  for (const mode of shuffled(modes)) {
    if (mode !== null) await page.evaluate(`(${ENGINE}.partialRedraw = ${mode}, true)`);
    mouse = moveMouse(); await sleep(2000); record(`mouse moving, ${label(mode)}`, await measure()); await mouse();
  }
  for (const mode of shuffled(modes)) {
    if (mode !== null) await page.evaluate(`(${ENGINE}.partialRedraw = ${mode}, true)`);
    const stop = turnKnob(); await sleep(2000); record(`knob turning, ${label(mode)}`, await measure()); await stop();
  }
  await page.evaluate(`(window.dispatchEvent(new Event('blur')), true)`);
  for (const mode of shuffled(modes)) {
    if (mode !== null) await page.evaluate(`(${ENGINE}.partialRedraw = ${mode}, true)`);
    await sleep(2000); record(`background, ${label(mode)}`, await measure());
  }
  await page.evaluate(`(window.dispatchEvent(new Event('focus')), true)`);
  process.stderr.write(`round ${round + 1}/${o.rounds}\n`);
}
if (modes[0] !== null) await page.evaluate(`(${ENGINE}.partialRedraw = true, true)`);
const med = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const base = med(results.get('baseline (nothing drawn)').map(r => r.gpu_w));
console.log(`${o.width}x${o.height}@${o.scale} preview=${o.preview} quality=${o.quality}${o.locale ? ' locale=' + o.locale : ''}, ${o.rounds} rounds, medians; baseline ${base.toFixed(2)} W`);
for (const [name, rs] of results) {
  const m = k => med(rs.map(r => r[k]));
  console.log(`${name.padEnd(26)} ${m('fps').toFixed(1).padStart(5)} fps  busy ${m('busy').toFixed(1).padStart(5)}%  GPU +${(m('gpu_w') - base).toFixed(2).padStart(5)} W  ` +
    `clock ${m('gpu_mhz').toFixed(0).padStart(4)} MHz  [${rs.map(r => (r.gpu_w - base).toFixed(1)).join(' ')}]`);
}
if (page.problems.length) console.log('page problems:', page.problems.slice(0, 5));
await page.close(); browser.close();
