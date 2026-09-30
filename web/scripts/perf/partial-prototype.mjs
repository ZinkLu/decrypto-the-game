// The prototype behind HANDOFF_RENDER_POWER.md, run against the engine as it is today: ambient frames redraw
// only the rectangles of what moves, over a copy of the last full frame, in one pass. It stops the engine's own
// loop and drives the ambient motion itself. Prints the rectangles, a pixel comparison with full frames,
// and GPU power of full against partial frames at 30 and 60 fps.
//
//   node partial-prototype.mjs --size 2560x1300@2 --rounds 3
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { connect, openConsole, sleep, args, ENGINE } from './cdp.mjs';
import { gpuTimes, gpuPids, sumFor } from './gpu.mjs';

const o = args({ url: 'http://127.0.0.1:3000', preview: 'late-game', rounds: 3, window: 6 });
const iowin = fileURLToPath(new URL('./iowin.py', import.meta.url));
const browser = await connect();
const page = await openConsole(browser, `${o.url}/?preview=${o.preview}&brief=off&quality=high`, { width: o.width, height: o.height, scale: o.scale });
await sleep(3000);
const pids = await gpuPids(browser);
const setup = await page.evaluate(`(async () => {
  const e = ${ENGINE}, r = e.renderer, cam = e.view.camera, gl = r.getContext();
  const T = await import(performance.getEntriesByType('resource').map(x => x.name).find(n => /\\/deps\\/three\\.js/.test(n)));
  e.tick = () => {}; cancelAnimationFrame(e.raf); clearTimeout(e.sleep); e.raf = 0;

  // What an ambient frame changes: every tube, the Nixie glows and their spill, the LOCK lamp, and the needle,
  // whose rectangle is its whole dial so that the pose it leaves is redrawn as well.
  const moving = [];
  for (const [name, plane] of e.chassis.planes) if (e.displays.has(name)) moving.push(plane);
  e.scene.traverse(m => { if (m.isMesh && m.material?.blending === T.AdditiveBlending) moving.push(m); });
  const lock = e.lamps.scope?.material; if (lock) e.scene.traverse(m => { if (m.isMesh && m.material === lock) moving.push(m); });
  const dial = e.chassis.part('SignalGlass'); if (dial) moving.push(dial);
  const w = e.view.width, h = e.view.height, pad = 6, corner = new T.Vector3();
  const rectOf = object => { object.updateWorldMatrix(true, true); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    object.traverse(m => { if (!m.isMesh) return; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox;
      for (let i = 0; i < 8; i++) { corner.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(m.matrixWorld).project(cam);
        const x = (corner.x + 1) / 2 * w, y = (corner.y + 1) / 2 * h; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } });
    return [Math.max(0, Math.floor(x0 - pad)), Math.max(0, Math.floor(y0 - pad)), Math.min(w, Math.ceil(x1 + pad)), Math.min(h, Math.ceil(y1 + pad))]; };
  const rects = moving.map(rectOf);
  const overlap = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
  for (let merged = true; merged;) { merged = false;
    for (let i = 0; i < rects.length && !merged; i++) for (let j = i + 1; j < rects.length && !merged; j++) if (overlap(rects[i], rects[j])) {
      const a = rects[i], b = rects[j]; rects[i] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]; rects.splice(j, 1); merged = true; } }

  // The last full frame, copied as the frame is drawn, and put back unchanged by a raw quad.
  const size = r.getDrawingBufferSize(new T.Vector2());
  const still = new T.FramebufferTexture(size.x, size.y);
  const quad = new T.Mesh(new T.PlaneGeometry(2, 2), new T.ShaderMaterial({ uniforms: { map: { value: still } }, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main() { gl_FragColor = texture2D(map, vUv); }' }));
  quad.frustumCulled = false; const stillScene = new T.Scene(); stillScene.add(quad); const flat = new T.OrthographicCamera();

  window.__full = () => { r.render(e.scene, cam); r.copyFramebufferToTexture(still); };
  window.__partial = () => {
    const depth = r.state.buffers.depth;
    r.autoClear = false; r.setScissorTest(false);
    // Depth 0 everywhere as the pass begins: no fragment outside the rectangles gets as far as shading.
    depth.setClear(0); r.clear(true, true, true); depth.setClear(1);
    r.render(stillScene, flat);
    r.setScissorTest(true);
    for (const [x0, y0, x1, y1] of rects) { r.setScissor(x0, y0, x1 - x0, y1 - y0); r.clear(false, true, false); }
    r.setScissorTest(false);
    // A colour background makes three clear before every render; the pass must keep the frame and the mask.
    r.autoClearColor = r.autoClearDepth = r.autoClearStencil = false;
    r.render(e.scene, cam);
    r.autoClearColor = r.autoClearDepth = r.autoClearStencil = true; r.autoClear = true;
  };
  const advance = (now, dt) => { e.scope.draw(dt, false); e.displays.tick(now, dt, false); e.nixies.breathe(now, false);
    e.instruments?.tick(now, dt, false); e.lamps.lock(e.scope.coherence, dt, false); };
  window.__loop = (mode, fps) => { window.__stop?.(); let last = 0, stop = false, n = 0; window.__stop = () => { stop = true; }; window.__count = () => n;
    if (!fps) return; window.__full();
    const step = now => { if (stop) return; requestAnimationFrame(step);
      if (now - last < 1000 / fps - 2) return; last = now; n++; advance(now, 1 / fps);
      mode === 'partial' ? window.__partial() : window.__full(); };
    requestAnimationFrame(step); };

  // Exactness: full, advance, partial, compared with a full frame of the same state; several cycles.
  const bw = size.x, bh = size.y;
  const read = () => { const px = new Uint8Array(bw * bh * 4); gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
  const differ = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++; return n; };
  const cycles = [];
  for (let k = 0; k < 4; k++) { window.__full(); advance(performance.now() + 300 * (k + 1), .3); window.__partial(); const a = read(); r.render(e.scene, cam); cycles.push(differ(a, read())); }
  const area = rects.reduce((s, [x0, y0, x1, y1]) => s + (x1 - x0) * (y1 - y0), 0) / (w * h);
  return { objects: moving.length, rects, area, cycles, pixels: bw * bh };
})()`);
console.log(`${o.width}x${o.height}@${o.scale}: ${setup.objects} moving objects in ${setup.rects.length} rectangles, ${(setup.area * 100).toFixed(1)}% of the canvas`);
console.log(`partial vs full frame, 4 cycles: ${setup.cycles.join(', ')} of ${setup.pixels} pixels differ (cycle 1 is the first partial frame after load)`);
const variants = { baseline: ['full', 0], 'full @30': ['full', 30], 'partial @30': ['partial', 30], 'full @60': ['full', 60], 'partial @60': ['partial', 60] };
const results = Object.fromEntries(Object.keys(variants).map(n => [n, []]));
for (let round = 0; round < Number(o.rounds); round++) {
  for (const name of Object.keys(variants).sort(() => Math.random() - .5)) {
    const [mode, fps] = variants[name];
    await page.evaluate(`(window.__loop(${JSON.stringify(mode)}, ${fps}), true)`);
    await sleep(2000);
    const n0 = await page.evaluate('window.__count()'), g0 = sumFor(gpuTimes(), pids), t0 = Date.now();
    const p = JSON.parse(execFileSync('python3', [iowin, String(o.window)], { encoding: 'utf8' }));
    const n1 = await page.evaluate('window.__count()'), g1 = sumFor(gpuTimes(), pids), dt = (Date.now() - t0) / 1000;
    results[name].push({ fps: (n1 - n0) / dt, busy: (g1 - g0) / 1e6 / dt / 10, ...p });
  }
  process.stderr.write(`round ${round + 1}/${o.rounds}\n`);
}
const med = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const base = med(results.baseline.map(r => r.gpu_w));
for (const name of Object.keys(variants)) {
  const rs = results[name], m = k => med(rs.map(r => r[k]));
  console.log(`${name.padEnd(12)} ${m('fps').toFixed(0).padStart(3)} fps  busy ${m('busy').toFixed(1).padStart(5)}%  GPU +${(m('gpu_w') - base).toFixed(2).padStart(5)} W  clock ${m('gpu_mhz').toFixed(0).padStart(4)} MHz`);
}
await page.close(); browser.close();
