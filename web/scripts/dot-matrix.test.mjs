import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/components/console/dotMatrix.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { DotDriver, dotGrid, dotText, dotTextWidth, dotWordLayout, dotTuning } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

/** Steps a driver at 120 Hz and samples it. */
const record = (driver, seconds) => {
    const samples = [];
    for (let time = 0; time < seconds; time += 1 / 120) {
        driver.step(1 / 120);
        samples.push({ time: time + 1 / 120, brightness: driver.brightness, reveal: driver.reveal, test: driver.test, moving: driver.moving });
    }
    return samples;
};
const cold = seed => { const driver = new DotDriver(seed); driver.settle(false); driver.power(true); return driver; };
const packed = driver => { const out = []; const vector = () => ({ set: (...values) => out.push(values) }); driver.pack(vector(), vector()); return out; };

test('the sign font plots whole letters on a six-dot pitch', () => {
    const dots = [];
    dotText('I1', 3, 2, (x, y, w, h) => dots.push([x, y, w, h]));
    assert.equal(dots.filter(([x]) => x < 9).length, 11, 'I is a stem between two bars');
    assert.ok(dots.every(([x, y, w, h]) => x >= 3 && x < 3 + 11 && y >= 2 && y < 9 && w === 1 && h === 1));
    assert.equal(dotTextWidth('KEY'), 17);
    assert.equal(dotTextWidth('ACE', 2), 34);
    const doubled = [];
    dotText('a', 0, 0, (x, y, w, h) => doubled.push([x, y, w, h]), 2, 2);
    assert.ok(doubled.length > 10 && doubled.every(([x, y, w, h]) => x % 2 === 0 && y % 2 === 0 && w === 2 && h === 2), 'lower case uses the capitals, scaled dot for dot');
    const unknown = [];
    dotText('é', 0, 0, (x, y) => unknown.push([x, y]));
    assert.ok(unknown.length > 5, 'an unknown letter still shows as a question mark');
});

test('every keyword in the bank has a place in the band, most of them without moving', () => {
    assert.deepEqual([1, 2, 3, 4, 5].map(n => dotWordLayout('龙'.repeat(n)).size), [16, 16, 16, 16, 12]);
    for (let n = 1; n <= 5; n++) assert.ok(dotWordLayout('龙'.repeat(n)).width <= dotGrid.cols);
    assert.deepEqual([dotWordLayout('ace').scaleX, dotWordLayout('coast').scaleX, dotWordLayout('lighthouse').scaleX], [2, 2, 1]);
    assert.equal(dotWordLayout('lighthouse').scaleY, 2, 'long words stand tall rather than small');
    assert.deepEqual(dotWordLayout('migratory bird').lines, ['MIGRATORY', 'BIRD']);
    assert.deepEqual(dotWordLayout('scuba diver').lines, ['SCUBA', 'DIVER']);
    for (const word of ['ace', 'coast', 'lighthouse', 'washington', 'migratory bird', 'notre dame'])
        assert.ok(dotWordLayout(word).width <= dotGrid.cols, word);
    const long = dotWordLayout('shakespeare');
    assert.ok(long.width > dotGrid.cols && long.lines.length === 1, 'eleven letters crawl past as a marquee');
    assert.ok(dotGrid.bandBottom - dotGrid.bandTop + 1 >= 16);
});

test('a diode panel proves its dots, clears, clocks its columns in, and dies with its supply', () => {
    const driver = cold(2);
    const samples = record(driver, 1.2);
    const tested = samples.filter(s => s.test === 1);
    assert.ok(tested.length > 10 && tested.at(-1).time < .4, 'lamp test');
    assert.ok(tested.every(s => s.reveal === 0), 'nothing is loaded while every dot is lit');
    const loading = samples.filter(s => s.reveal > 0 && s.reveal < 1);
    assert.ok(loading[0].time > tested.at(-1).time + dotTuning.clear * .8, 'a dark beat before the message');
    for (let i = 1; i < loading.length; i++) assert.ok(loading[i].reveal > loading[i - 1].reveal);
    assert.ok(loading.at(-1).time - loading[0].time > .18 && loading.at(-1).time - loading[0].time < .3);
    assert.equal(driver.resting, true);
    assert.deepEqual(packed(driver), [[1, 1, 0, 0], [0, dotGrid.cols, 2, 0]], 'rest is exact');
    driver.power(false);
    const dying = record(driver, .6);
    const dark = dying.find(s => s.brightness === 0);
    assert.ok(dark.time > .05 && dark.time < .16, `dark after ${dark.time.toFixed(3)} s, with no afterglow`);
    for (let i = 1; i < dying.length; i++) assert.ok(dying[i].brightness <= dying[i - 1].brightness);
    assert.equal(driver.moving, false);
});

test('a new message is clocked in again without another lamp test', () => {
    const driver = new DotDriver(1);
    driver.load();
    assert.equal(driver.reveal, 0);
    const samples = record(driver, .6);
    assert.ok(samples.every(s => s.test === 0 && s.brightness === 1));
    assert.ok(samples.find(s => s.reveal === 1).time < .3);
    assert.equal(driver.resting, true);
    const off = new DotDriver(1);
    off.settle(false);
    off.load();
    assert.equal(off.resting, true, 'a dark panel has nothing to reload');
});

test('modules of one batch start at their own moments, the same way every time', () => {
    const first = () => [1, 2, 3, 4].map(seed => record(cold(seed), 1).find(s => s.test).time);
    const times = first();
    assert.ok(Math.max(...times) - Math.min(...times) > .04, times.map(t => t.toFixed(3)).join(', '));
    assert.deepEqual(first(), times, 'seeded, so repeatable');
});

test('only a keyword wider than the module crawls, pausing at the start of each lap', () => {
    const still = new DotDriver(1);
    for (let i = 0; i < 300; i++) still.step(1 / 60);
    assert.equal(still.scroll, 0);
    const crawling = new DotDriver(1);
    crawling.strip = 65;
    for (let i = 0; i < 60; i++) crawling.step(1 / 60);
    assert.equal(crawling.scroll, 0, 'the first second holds still so the word can be read');
    for (let i = 0; i < 60; i++) crawling.step(1 / 60);
    assert.ok(crawling.scroll > 10 && crawling.scroll < 65 + dotGrid.gap);
    assert.equal(packed(crawling)[1][0], Math.floor(crawling.scroll), 'the message moves in whole dots');
    crawling.power(false);
    crawling.step(1 / 60);
    assert.equal(crawling.scroll, 0);
});
