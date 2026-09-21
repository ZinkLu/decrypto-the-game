import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';
const moduleUrls = new Map();
async function moduleUrl(name) {
  if (moduleUrls.has(name)) return moduleUrls.get(name);
  const source = await readFile(new URL(`../src/components/console/${name}.ts`, import.meta.url), 'utf8');
  let js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  for (const dependency of [...js.matchAll(/from '\.\/(\w+)'/g)].map(match => match[1])) {
    js = js.replaceAll(`from './${dependency}'`, `from '${await moduleUrl(dependency)}'`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
  moduleUrls.set(name, url);
  return url;
}
const { initialLocal, scopeModes, scopeWaveBlend, scopeMarks, scopeRatio, scopeSweepHz, scopeTimebase, scopeAxisAngle } = await import(await moduleUrl('model'));
const { scopeTuning, scopeWaveforms, waveSample, scopeResonance, ScopeSignal, Phosphor, VectorMonitor } = await import(await moduleUrl('scope'));

const rest = { freq: initialLocal.scopeFreq, wave: initialLocal.scopeWave, rate: initialLocal.scopeRate, axis: initialLocal.scopeAxis };
const frame = 1 / 60;
/** Slip between the oscillators around a p:q tongue, as a fraction of a cycle in [-.5, .5). */
const slip = (signal, p, q) => { const phase = q * signal.signal - p * signal.reference; return phase - Math.round(phase); };
/** The FREQ position whose ratio sits `detune` half-widths from its nearest tongue. */
function tuned(from, to, detune) {
  for (let n = 0; n < 60; n++) {
    const middle = (from + to) / 2, found = scopeResonance(scopeRatio(middle));
    if ((found ? found.detune : Infinity) < detune) from = middle; else to = middle;
  }
  return from;
}
function strokes(trace) {
  return Array.from({ length: trace.count }, (_, n) => Array.from(trace.segments.subarray(n * 5, n * 5 + 5)));
}

test('FREQ marks are calibrated whole-number ratios on a monotonic vernier law', () => {
  scopeMarks.forEach(([p, q], mark) => assert.ok(Math.abs(scopeRatio(mark / 7) - p / q) < 1e-12, `${p}:${q}`));
  for (let value = 0; value < 1; value += .0005) assert.ok(scopeRatio(value + .0005) > scopeRatio(value));
  assert.equal(scopeRatio(-1), 1); assert.equal(scopeRatio(2), 5);
  // The drive is geared down around every engraved mark and quicker between marks.
  const travel = value => scopeRatio(value + .002) / scopeRatio(value - .002);
  for (let mark = 1; mark < 7; mark++) assert.ok(travel(mark / 7) < travel((mark + .5) / 7) && travel(mark / 7) < travel((mark - .5) / 7));
  const resting = scopeResonance(scopeRatio(initialLocal.scopeFreq));
  assert.deepEqual([resting.p, resting.q, resting.locked], [2, 1, true]);
  assert.ok(Math.abs(resting.detune) < 1e-9);
  assert.equal(scopeModes.length, scopeWaveforms);
});

test('TIME/DIV speeds the sweep clockwise and X-Y turns a quarter of a revolution, with end stops', () => {
  for (let value = 0; value < 1; value += .001) {
    assert.ok(scopeSweepHz(value + .001) > scopeSweepHz(value));
    assert.ok(scopeTimebase(value + .001) < scopeTimebase(value));
    assert.ok(scopeAxisAngle(value + .001) > scopeAxisAngle(value));
  }
  assert.equal(scopeSweepHz(-1), scopeSweepHz(0)); assert.equal(scopeSweepHz(2), scopeSweepHz(1));
  assert.ok(Math.abs(scopeTimebase(0) - .2) < 1e-12 && Math.abs(scopeTimebase(1) - .00125) < 1e-12);
  assert.equal(scopeAxisAngle(-1), 0); assert.equal(scopeAxisAngle(2), Math.PI / 2);
});

test('the five engraved waveforms are periodic, bounded and distinct, with sine at rest', () => {
  const cycle = shape => Array.from({ length: 200 }, (_, n) => waveSample(shape, n / 200));
  const waves = Array.from({ length: scopeWaveforms }, (_, mark) => cycle(mark));
  for (const [mark, wave] of waves.entries()) {
    assert.ok(wave.every(level => Number.isFinite(level) && Math.abs(level) <= 1));
    for (const phase of [0, .13, .5, .77]) assert.ok(Math.abs(waveSample(mark, phase) - waveSample(mark, phase + 3)) < 1e-9);
    assert.ok(Math.max(...wave) - Math.min(...wave) > 1.3, 'fills the deflection');
  }
  assert.equal(new Set(waves.map(wave => JSON.stringify(wave))).size, scopeWaveforms);
  assert.equal(scopeModes[Math.round(initialLocal.scopeWave * 4)], '正弦');
  cycle(initialLocal.scopeWave * 4).forEach((level, n) => assert.ok(Math.abs(level - Math.sin(n / 200 * Math.PI * 2)) < 1e-12));
  // A sawtooth is a long rise and a short fall; a pulse is high a fifth of the time.
  assert.ok(Math.abs(waves[0].filter((level, n) => level > waves[0][(n + 199) % 200]).length / 200 - .97) < .02);
  assert.ok(Math.abs(waves[4].filter(level => level > .3).length / 200 - .2) < .03);
});

test('WAVE blends steplessly: no position of the dial jumps, including across the engraved marks', () => {
  for (let shape = 0; shape < 4; shape += .02) {
    let change = 0;
    for (let n = 0; n < 400; n++) change += Math.abs(waveSample(shape + .02, n / 400) - waveSample(shape, n / 400)) / 400;
    assert.ok(change < .03, `shape ${shape.toFixed(2)} moves ${change}`);
  }
  assert.deepEqual(scopeWaveBlend(.5), { from: 2, to: 2, mix: 0 });
  assert.deepEqual(scopeWaveBlend(.51), { from: 2, to: 2, mix: 0 });
  assert.deepEqual(scopeWaveBlend(1.4), { from: 4, to: 4, mix: 0 });
  const between = scopeWaveBlend(.6);
  assert.deepEqual([between.from, between.to], [2, 3]); assert.ok(Math.abs(between.mix - .4) < 1e-9);
  // A sudden turn still melts on the tube: the blend settles through its network.
  const { centerY, deflection } = scopeTuning, signal = new ScopeSignal();
  const flat = trace => strokes(trace).filter(([, , , y1]) => Math.abs(y1 - centerY) > deflection * .9).length / trace.count;
  assert.ok(flat(signal.advance(frame, { ...rest, wave: .75 })) < .5, 'the first frame is still mostly sine');
  for (let n = 0; n < 60; n++) signal.advance(frame, { ...rest, wave: .75 });
  assert.ok(flat(signal.advance(frame, { ...rest, wave: .75 })) > .8, 'then the square wave dwells on its rails');
});

test('inside a tongue the oscillators lock and hold the Adler phase for the remaining detune', () => {
  const resting = new ScopeSignal();
  for (let n = 0; n < 180; n++) resting.advance(frame, rest);
  assert.ok(Math.abs(slip(resting, 2, 1)) < 1e-6);
  // Knocked out of step, a locked pair pulls itself back.
  resting.signal = (resting.signal + .2) % 1;
  for (let n = 0; n < 300; n++) resting.advance(frame, rest);
  assert.ok(Math.abs(slip(resting, 2, 1)) < 1e-3);
  for (const detune of [-.8, -.4, .5, .9]) {
    const freq = tuned(initialLocal.scopeFreq - .04, initialLocal.scopeFreq + .04, detune), held = new ScopeSignal();
    for (let n = 0; n < 900; n++) held.advance(frame, { ...rest, freq });
    assert.ok(Math.abs(slip(held, 2, 1) - Math.asin(detune) / (Math.PI * 2)) < 2e-3, `detune ${detune}`);
  }
});

test('just outside a tongue the figure slips at the Adler beat, and far away it runs free', () => {
  for (const detune of [1.2, 2, 4]) {
    const freq = tuned(initialLocal.scopeFreq, initialLocal.scopeFreq + .06, detune), free = new ScopeSignal();
    const found = scopeResonance(scopeRatio(freq));
    assert.deepEqual([found.p, found.q, found.locked], [2, 1, false]);
    let turns = 0, last = 0;
    const seconds = 20;
    for (let n = 0; n < seconds * 60; n++) {
      free.advance(frame, { ...rest, freq });
      const now = slip(free, 2, 1);
      turns += now - last - Math.round(now - last); last = now;
    }
    const beat = scopeSweepHz(rest.rate) * found.strength * Math.sqrt(detune ** 2 - 1);
    assert.ok(Math.abs(turns / seconds - beat) < beat * .05 + .02, `detune ${detune}: ${turns / seconds} vs ${beat}`);
  }
  assert.equal(scopeResonance(1.15), null);
  assert.equal(scopeResonance(2.27), null);
});

test('the lock detector is steady in step, dimmer toward a tongue edge and beats while slipping', () => {
  const detector = (freq, frames) => {
    const signal = new ScopeSignal(), levels = [];
    for (let n = 0; n < 900 + frames; n++) { signal.advance(frame, { ...rest, freq }); levels.push(signal.coherence); }
    return levels.slice(-frames);
  };
  assert.ok(detector(rest.freq, 60).every(level => level > .9999));
  const edge = detector(tuned(rest.freq, rest.freq + .04, .8), 60);
  assert.ok(edge.every(level => Math.abs(level - .6) < .01), 'cos(asin .8)');
  const beating = detector(tuned(rest.freq, rest.freq + .06, 1.5), 600);
  assert.ok(Math.min(...beating) < -.9 && Math.max(...beating) > .9);
  const still = new ScopeSignal();
  still.still(rest); assert.equal(still.coherence, 1);
  still.still({ ...rest, freq: .5 }); assert.equal(still.coherence, 0);
});

test('Y-T writes left to right with a blanked flyback and spends exactly the elapsed sweeps', () => {
  const signal = new ScopeSignal();
  let share = 0;
  const { centerX, centerY, sweepReach, deflection } = scopeTuning;
  for (let n = 0; n < 30; n++) for (const [x0, y0, x1, y1, part] of strokes(signal.advance(frame, rest))) {
    assert.ok(x1 >= x0, 'the beam never writes during flyback');
    assert.ok(x0 >= centerX - sweepReach - 1e-3 && x1 <= centerX + sweepReach + 1e-3);
    assert.ok(Math.abs(y0 - centerY) <= deflection + 1e-3 && Math.abs(y1 - centerY) <= deflection + 1e-3);
    share += part;
  }
  assert.ok(Math.abs(share - scopeSweepHz(rest.rate) * 30 * frame) < 1e-3);
  // Long frames are capped rather than drawn as one enormous stroke burst.
  assert.ok(signal.advance(10, rest).count <= 2 * scopeTuning.maxSubsteps + 2);
  assert.equal(signal.advance(0, rest).count, 0);
});

test('turning X-Y rolls the same locked signal into its Lissajous figure', () => {
  const { centerX, centerY, deflection } = scopeTuning;
  // 1:1 in phase is the diagonal line; the reference sine has replaced the ramp.
  const unison = new ScopeSignal();
  for (let n = 0; n < 20; n++) for (const [x0, y0, x1, y1] of strokes(unison.advance(frame, { ...rest, freq: 0, axis: 1 }))) {
    assert.ok(Math.abs((x0 - centerX) + (y0 - centerY)) < 1e-3 && Math.abs((x1 - centerX) + (y1 - centerY)) < 1e-3);
  }
  // 2:1 in phase is the figure-eight: y = 2x sqrt(1 - x^2) in deflection units.
  const octave = new ScopeSignal();
  for (let n = 0; n < 20; n++) for (const [, , x1, y1] of strokes(octave.advance(frame, { ...rest, axis: 1 }))) {
    const x = (x1 - centerX) / deflection, y = (centerY - y1) / deflection;
    assert.ok(Math.abs(Math.abs(y) - 2 * Math.abs(x) * Math.sqrt(Math.max(0, 1 - x * x))) < 1e-3);
  }
  // Half way, the horizontal plates carry both the ramp and the reference.
  const between = strokes(new ScopeSignal().advance(frame, { ...rest, axis: .5 }));
  assert.ok(between.some(([x0, , x1]) => x1 < x0), 'the rolled view doubles back on itself');
});

test('the phosphor conserves beam energy, decays exponentially and burns brighter under a slow beam', () => {
  const sum = levels => levels.reduce((all, level) => all + level, 0);
  const total = phosphor => sum(phosphor.energy);
  const peak = phosphor => phosphor.energy.reduce((most, level) => Math.max(most, level), 0);
  const tube = new Phosphor();
  tube.deposit(100.3, 80.7, 180.9, 140.2, 5);
  assert.ok(Math.abs(total(tube) - 5) < 1e-3 && Math.abs(sum(tube.exposure) - 5) < 1e-3, 'a long exposure shows a stroke in full');
  tube.age(.1, .085);
  assert.ok(Math.abs(total(tube) - 5 * Math.exp(-.1 / .085)) < 1e-3);
  // The frame shows the glow averaged over its interval, as a shutter would.
  assert.ok(Math.abs(sum(tube.exposure) - 5 * .85 * (1 - Math.exp(-.1 / .085))) < 1e-3);
  tube.age(60, .085);
  assert.equal(total(tube), 0, 'faint glow is flushed to true black');
  // A stroke written late in a frame has faded less by its end, but was exposed for less of it.
  const early = new Phosphor(), late = new Phosphor();
  for (const [screen, moment] of [[early, .1], [late, .9]]) { screen.age(1 / 60, .022); screen.deposit(100, 100, 140, 100, 1, moment); }
  assert.ok(total(late) > total(early) && sum(late.exposure) < sum(early.exposure));
  assert.ok(Math.abs(total(early) - Math.exp(-.9 / 60 / .022)) < 1e-3);
  const slow = new Phosphor(), fast = new Phosphor();
  slow.deposit(100, 100, 110, 100, 1); fast.deposit(100, 100, 300, 100, 1);
  assert.ok(peak(slow) > peak(fast) * 10, 'the same energy over a shorter stroke is brighter');
  const edge = new Phosphor();
  edge.deposit(-50, -50, -10, -10, 3); edge.deposit(500, 400, 900, 400, 3);
  assert.equal(total(edge), 0);
  edge.deposit(-5, 100, 5, 100, 1);
  assert.ok(total(edge) > .3 && total(edge) < .7, 'a stroke crossing the edge keeps only its visible part');
  const pixels = new Uint8ClampedArray(tube.width * tube.height * 4);
  const ramp = new Phosphor();
  for (let column = 0; column < 300; column++) ramp.exposure[column] = column / 25;
  ramp.expose(pixels);
  assert.equal(pixels[3], 0);
  for (let column = 1; column < 300; column++) assert.ok(pixels[column * 4 + 3] >= pixels[(column - 1) * 4 + 3]);
  assert.ok(pixels[299 * 4 + 3] > 250 && pixels[10 * 4 + 3] > 60 && pixels[10 * 4 + 3] < 110);
});

test('a standing figure is equally bright at every TIME/DIV, down to a visible moving spot', () => {
  const brightness = rate => {
    const monitor = new VectorMonitor();
    const seconds = Math.max(2, 4 / scopeSweepHz(rate));
    let most = 0;
    for (let n = 0; n < seconds * 60; n++) {
      monitor.run(frame, { ...rest, rate });
      if (n > seconds * 45) most = Math.max(most, monitor.phosphor.exposure.reduce((peak, level) => Math.max(peak, level), 0));
    }
    const lit = monitor.phosphor.exposure.reduce((count, level) => count + (level > .05 ? 1 : 0), 0);
    return { most, lit };
  };
  const fast = brightness(1), rest90 = brightness(initialLocal.scopeRate), slow = brightness(.2);
  assert.ok(Math.abs(rest90.most / fast.most - 1) < .25 && Math.abs(slow.most / fast.most - 1) < .25,
    `${slow.most} ${rest90.most} ${fast.most}`);
  assert.ok(rest90.most > 2.5 && rest90.most < 8);
  // At 1.4 sweeps a second the glow still reaches back along most of the wave.
  assert.ok(slow.lit > rest90.lit * .5);
});

test('a standing trace holds steady while the afterglow of a departed one is gone within a few frames', () => {
  const monitor = new VectorMonitor(), { width, centerX, centerY, sweepReach, deflection } = scopeTuning;
  const shown = (x, y) => Math.max(...[-2, -1, 0, 1, 2].map(row => monitor.phosphor.exposure[(y + row) * width + x]));
  // The resting 2:1 sine: its first crest, and the steep crossing a quarter of the way along.
  const crest = [Math.round(centerX - sweepReach + sweepReach / 4), centerY - deflection], steep = [Math.round(centerX - sweepReach / 2), centerY];
  for (let n = 0; n < 240; n++) monitor.run(frame, rest);
  const levels = { crest: [], steep: [] };
  for (let n = 0; n < 120; n++) { monitor.run(frame, rest); levels.crest.push(shown(...crest)); levels.steep.push(shown(...steep)); }
  for (const [part, seen] of Object.entries(levels)) {
    const brightness = seen.map(level => 1 - Math.exp(-level));
    assert.ok(Math.max(...brightness) - Math.min(...brightness) < .09, `${part} shimmers by ${Math.max(...brightness) - Math.min(...brightness)}`);
  }
  assert.ok(Math.min(...levels.crest) > 2.5 && Math.min(...levels.steep) > .7, 'and stays bright');
  // The beam moves away: only the glow remains, ageing frame by frame.
  const fading = [];
  for (let n = 0; n < 9; n++) { monitor.phosphor.age(frame, scopeTuning.persistence); fading.push(1 - Math.exp(-shown(...crest))); }
  assert.ok(fading[0] > .5, 'a real afterglow, not a strobe');
  assert.ok(fading[5] < .1 && fading[8] < .03, `ghosts linger: ${fading.map(level => level.toFixed(2))}`);
});

test('reduced motion shows the whole standing figure as one repeatable exposure', () => {
  const monitor = new VectorMonitor();
  monitor.run(0, rest, true);
  const first = Array.from(monitor.phosphor.exposure);
  monitor.run(.5, rest, true);
  assert.deepEqual(Array.from(monitor.phosphor.exposure), first);
  const columns = new Set();
  first.forEach((level, index) => { if (level > .2) columns.add(index % monitor.phosphor.width); });
  assert.ok(columns.size > 330, 'both cycles of the resting 2:1 sine are present');
  // An unlocked setting still resolves to a finite, closed representative.
  monitor.run(0, { ...rest, freq: .5, axis: 1 }, true);
  assert.ok(monitor.phosphor.exposure.every(Number.isFinite) && monitor.phosphor.exposure.some(level => level > .2));
});
