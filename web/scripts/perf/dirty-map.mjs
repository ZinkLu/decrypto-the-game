// Which pixels an ambient frame really changes: frames 50 ms apart while only the ambient motion runs.
// Writes <out>/dirty-<preview>.png, the console with every 32 px tile that changed within a second in red.
//
//   node dirty-map.mjs --size 1440x900@2 --preview late-game --out /tmp
import { writeFile } from 'node:fs/promises';
import { connect, openConsole, sleep, args, ENGINE } from './cdp.mjs';

const o = args({ url: 'http://127.0.0.1:3000', preview: 'late-game', out: '/tmp', size: '1440x900@2' });
const browser = await connect();
const page = await openConsole(browser, `${o.url}/?preview=${o.preview}&brief=off&quality=high`, { width: o.width, height: o.height, scale: o.scale });
await sleep(12000); // past the idle threshold, so only ambient frames run
const result = await page.evaluate(`(async () => {
  const e = ${ENGINE}, r = e.renderer, gl = r.getContext(), w = r.domElement.width, h = r.domElement.height;
  const grab = () => { r.render(e.scene, e.view.camera); const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
  const tile = 32, tw = Math.ceil(w / tile), th = Math.ceil(h / tile), touched = new Uint8Array(tw * th);
  let changed = 0, a = grab();
  for (let k = 0; k < 20; k++) {
    await new Promise(done => setTimeout(done, 50));
    const b = grab();
    for (let i = 0, p = 0; p < w * h; p++, i += 4)
      if (Math.abs(a[i] - b[i]) > 2 || Math.abs(a[i + 1] - b[i + 1]) > 2 || Math.abs(a[i + 2] - b[i + 2]) > 2) {
        changed++; touched[(((p / w) | 0) / tile | 0) * tw + ((p % w) / tile | 0)] = 1; }
    a = b;
  }
  // The frame, flipped upright, with the touched tiles over it.
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const c = out.getContext('2d'), image = c.createImageData(w, h);
  for (let y = 0; y < h; y++) image.data.set(a.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  c.putImageData(image, 0, 0); c.fillStyle = 'rgba(255, 40, 30, .55)';
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) if (touched[ty * tw + tx]) c.fillRect(tx * tile, h - (ty + 1) * tile, tile, tile);
  let tiles = 0; for (const t of touched) tiles += t;
  return { perFrame: changed / 20 / (w * h), tiles: tiles / (tw * th), png: out.toDataURL('image/png') };
})()`);
const file = `${o.out}/dirty-${o.preview}.png`;
await writeFile(file, Buffer.from(result.png.split(',')[1], 'base64'));
console.log(`preview=${o.preview}: ${(result.perFrame * 100).toFixed(2)}% of pixels change per ambient frame; ` +
  `${(result.tiles * 100).toFixed(1)}% of 32 px tiles change within a second -> ${file}`);
await page.close(); browser.close();
