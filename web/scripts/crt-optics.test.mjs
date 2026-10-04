import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Vector3 } from 'three';
import ts from 'typescript';

const source = ts.transpileModule(await readFile(new URL('../src/console/crt.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText.replace("'three'", JSON.stringify(import.meta.resolve('three')));
const { crtProfile, crtHeight, crtGeometry, crtRasterUv, crtDisplayUv } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const surfaces = JSON.parse(await readFile(new URL('../public/models/console-surfaces.json', import.meta.url), 'utf8'));
const displays = ['screen', 'word0', 'scope'];

test('CRT content has depth-dependent parallax beneath the glass', () => {
  for (const name of displays) {
    const { w, h } = surfaces[name], profile = crtProfile(name);
    const leftEye = new Vector3(-12, 0, 26), rightEye = new Vector3(12, 0, 26);
    const left = crtRasterUv(.5, .5, w, h, profile, leftEye);
    const right = crtRasterUv(.5, .5, w, h, profile, rightEye);
    assert.ok(left.u > .5005 && right.u < .4995, `${name}: the image moves under the stationary glass`);
    assert.ok(left.u < .505 && right.u > .495, `${name}: glass thickness must not cause excessive parallax`);
    assert.ok(Math.abs(left.u + right.u - 1) < 1e-8);
    const flush = { ...profile, depth: 0, innerRise: profile.rise };
    assert.deepEqual(crtRasterUv(.5, .5, w, h, flush, leftEye), crtRasterUv(.5, .5, w, h, flush, rightEye));
    for (const u of [0, .1, .5, .9, 1]) for (const v of [0, .1, .5, .9, 1])
      assert.ok(crtHeight(u, v, profile.rise) > crtHeight(u, v, profile.innerRise) - profile.depth);
  }
});

test('CRT faceplates stay gently convex through the corners without steep rolled shoulders', () => {
  for (const name of displays) {
    const { w, h } = surfaces[name], profile = crtProfile(name), step = .001;
    const z = (u, v) => crtHeight(u, v, profile.rise);
    for (const u of [.05, .15, .5, .85, .95]) for (const v of [.05, .15, .5, .85, .95]) {
      const xx = (z(u + step, v) - 2 * z(u, v) + z(u - step, v)) / step ** 2;
      const yy = (z(u, v + step) - 2 * z(u, v) + z(u, v - step)) / step ** 2;
      const xy = (z(u + step, v + step) - z(u + step, v - step)
        - z(u - step, v + step) + z(u - step, v - step)) / (4 * step ** 2);
      assert.ok(xx < 0 && yy < 0 && xx * yy - xy * xy > 0, `${name}: corner pinches into a saddle`);
    }
    const geometry = crtGeometry(w, h, profile), normals = geometry.getAttribute('normal');
    for (let i = 0; i < normals.count; i++)
      assert.ok(normals.getZ(i) > Math.cos(9 * Math.PI / 180), `${name}: rim rolls too steeply`);
    geometry.dispose();
  }
});

test('CRT raster remains close to the faceplate with only slight barrel distortion', () => {
  for (const name of displays) {
    const { w, h } = surfaces[name], profile = crtProfile(name);
    const eye = new Vector3(0, 0, 26);
    for (const u of [.05, .15, .5, .85, .95]) for (const v of [.05, .15, .5, .85, .95]) {
      const ink = crtRasterUv(u, v, w, h, profile, eye);
      assert.ok(Math.max(Math.abs(ink.u - u), Math.abs(ink.v - v)) < .02, `${name}: excessive picture distortion`);
    }
  }
});

test('CRT input regions follow the refracted picture throughout the inspection range', () => {
  for (const name of displays) {
    const { w, h } = surfaces[name], profile = crtProfile(name);
    for (const yaw of [-.7, 0, .7]) for (const pitch of [-.36, 0, .36]) {
      const eye = new Vector3(Math.sin(yaw) * 26, Math.sin(pitch) * 26, Math.cos(yaw) * Math.cos(pitch) * 26);
      for (const u of [0, .06, .28, .5, .78, .94, 1]) for (const v of [0, .07, .35, .5, .75, .93, 1]) {
        const face = crtDisplayUv(u, v, w, h, profile, eye);
        const ink = crtRasterUv(face.u, face.v, w, h, profile, eye);
        assert.ok(Math.hypot(ink.u - u, ink.v - v) < .00001, `${name}: input misses its visible ink`);
      }
    }
  }
});

test('lite CRT optics keep the inputs on a picture that no longer shifts with the eye', () => {
  for (const name of displays) {
    const { w, h } = surfaces[name], profile = crtProfile(name);
    const left = new Vector3(-12, 4, 26), right = new Vector3(12, -4, 26);
    for (const u of [0, .06, .28, .5, .78, .94, 1]) for (const v of [0, .07, .35, .5, .75, .93, 1]) {
      assert.deepEqual(crtRasterUv(u, v, w, h, profile, left, false), crtRasterUv(u, v, w, h, profile, right, false));
      const face = crtDisplayUv(u, v, w, h, profile, left, false);
      const ink = crtRasterUv(face.u, face.v, w, h, profile, left, false);
      assert.ok(Math.hypot(ink.u - u, ink.v - v) < .00001, `${name}: input misses its visible ink`);
    }
    // The barrel warp is shared, so both optics agree where the glass adds nothing: dead centre, seen head-on.
    const ahead = new Vector3(0, 0, 26);
    assert.deepEqual(crtRasterUv(.5, .5, w, h, profile, ahead, false), crtRasterUv(.5, .5, w, h, profile, ahead));
  }
});

test('CRT refraction preserves image orientation without folding the raster', () => {
  for (const name of displays) {
    const { w, h } = surfaces[name], profile = crtProfile(name), step = .0001;
    for (const eye of [new Vector3(-17, 8, 20), new Vector3(0, 0, 26), new Vector3(17, -8, 20)]) {
      for (let u = .05; u < 1; u += .1) for (let v = .05; v < 1; v += .1) {
        const p = crtRasterUv(u, v, w, h, profile, eye);
        const x = crtRasterUv(u + step, v, w, h, profile, eye);
        const y = crtRasterUv(u, v + step, w, h, profile, eye);
        assert.ok((x.u - p.u) * (y.v - p.v) - (x.v - p.v) * (y.u - p.u) > 0, `${name}: folded raster`);
      }
    }
  }
});
