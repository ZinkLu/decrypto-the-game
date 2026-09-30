// GPU time of one frame under variants of the level, rendered back to back so the GPU runs at full clock.
// Shows what each switch costs as a share of the frame; it is not what a player's frame costs (see power.mjs).
//
//   node frame-cost.mjs --size 2560x1300@2 --rounds 5 [--only high,area-lights-off,flat-shading]
import { connect, openConsole, sleep, args, ENGINE } from './cdp.mjs';
import { gpuTimes, gpuPids, sumFor } from './gpu.mjs';

const o = args({ url: 'http://127.0.0.1:3000', preview: 'late-game', rounds: 5, only: '' });
const browser = await connect();
const page = await openConsole(browser, `${o.url}/?preview=${o.preview}&brief=off&quality=high`, { width: o.width, height: o.height, scale: o.scale });
await sleep(4000);
const pids = await gpuPids(browser);
await page.evaluate(`(async () => {
  const e = ${ENGINE}, cam = e.view.camera, high = e.quality;
  const threeUrl = performance.getEntriesByType('resource').map(r => r.name).find(n => /\\/deps\\/three\\.js/.test(n));
  const T = await import(threeUrl);
  e.tick = () => {}; cancelAnimationFrame(e.raf); clearTimeout(e.sleep); e.raf = 0;
  const meshes = []; e.scene.traverse(m => { if (m.isMesh) meshes.push(m); });
  const shown = new Map(meshes.map(m => [m, m.visible])), environment = e.scene.environment;
  // An opaque card just in front of the lens, drawn first: whatever it hides should cost no shading.
  const card = new T.Mesh(new T.PlaneGeometry(1000, 1000), new T.MeshBasicMaterial({ color: 0x404040 }));
  card.renderOrder = -1000; card.frustumCulled = false; card.visible = false; cam.add(card); card.position.set(0, 0, -cam.near * 2);
  if (!cam.parent) e.scene.add(cam);
  const flat = new T.MeshBasicMaterial({ color: 0x888888 });
  const tubes = [...e.chassis.planes.entries()].filter(([n]) => e.displays.has(n)).map(([, p]) => p);
  const medium = { pixelRatio: 1.5, areaLights: false, shadows: true, screenGlass: true, nixieCover: true, crtOptics: 'full', ambientFps: 30, backdropBlur: true };
  const low = { pixelRatio: 1, areaLights: false, shadows: false, screenGlass: false, nixieCover: false, crtOptics: 'lite', ambientFps: 30, backdropBlur: false };
  window.__reset = () => { e.scene.overrideMaterial = null; e.scene.environment = environment; card.visible = false;
    for (const [m, v] of shown) m.visible = v; e.setQuality({ ...high }); e.setQuality(high); };
  window.__variants = {
    high: () => {},
    'area-lights-off': () => e.setQuality({ ...high, areaLights: false }),
    'shadows-off': () => e.setQuality({ ...high, shadows: false }),
    'screen-glass-off': () => e.setQuality({ ...high, screenGlass: false }),
    'nixie-cover-off': () => e.setQuality({ ...high, nixieCover: false }),
    'crt-lite': () => e.setQuality({ ...high, crtOptics: 'lite' }),
    'ibl-off': () => { e.scene.environment = null; },
    'backdrop-off': () => { e.studio.backdrop.visible = false; },
    'tubes-hidden': () => tubes.forEach(p => p.visible = false),
    'transparent-hidden': () => meshes.forEach(m => { if ([m.material].flat().some(x => x.transparent)) m.visible = false; }),
    'flat-shading': () => { e.scene.overrideMaterial = flat; },
    occluded: () => { card.visible = true; },
    'pr-1.5': () => e.setQuality({ ...high, pixelRatio: 1.5 }),
    medium: () => e.setQuality(medium),
    low: () => e.setQuality(low),
    empty: () => meshes.forEach(m => m.visible = false),
  };
  window.__cost = ms => {
    const r = e.renderer, gl = r.getContext(), px = new Uint8Array(4), costs = [];
    const deadline = performance.now() + ms;
    do { const t = performance.now(); r.render(e.scene, cam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); costs.push(performance.now() - t); }
    while (costs.length < 4 || performance.now() < deadline);
    const c = r.domElement;
    return { n: costs.length, calls: r.info.render.calls, tris: r.info.render.triangles, px: c.width + 'x' + c.height };
  };
  return true;
})()`);
const names = o.only ? o.only.split(',') : await page.evaluate('Object.keys(window.__variants)');
const results = Object.fromEntries(names.map(n => [n, []]));
for (let round = 0; round < Number(o.rounds); round++) {
  for (const name of [...names].sort(() => Math.random() - .5)) {
    await page.evaluate(`(window.__reset(), window.__variants[${JSON.stringify(name)}](), true)`);
    await page.evaluate('(window.__cost(600), true)'); // compile, and let an idle GPU clock up
    const g0 = sumFor(gpuTimes(), pids);
    const r = await page.evaluate('window.__cost(700)');
    results[name].push({ ...r, gpu: (sumFor(gpuTimes(), pids) - g0) / 1e6 / r.n });
  }
  process.stderr.write(`round ${round + 1}/${o.rounds}\n`);
}
const med = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const high = results.high ? med(results.high.map(r => r.gpu)) : null;
console.log(`${o.width}x${o.height}@${o.scale} preview=${o.preview}: GPU ms per frame, back to back (median / min of ${o.rounds})`);
for (const name of names) {
  const rs = results[name], gpu = med(rs.map(r => r.gpu));
  console.log(`${name.padEnd(20)} ${rs[0].px.padEnd(10)} ${gpu.toFixed(2).padStart(6)} / ${Math.min(...rs.map(r => r.gpu)).toFixed(2).padStart(5)} ms` +
    `${high && name !== 'high' ? `  ${((gpu / high - 1) * 100).toFixed(0).padStart(4)}%` : '      '}  ${String(rs[0].calls).padStart(4)} calls  ${rs[0].tris} tris`);
}
await page.close(); browser.close();
