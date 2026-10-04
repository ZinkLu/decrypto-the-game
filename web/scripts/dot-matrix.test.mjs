import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/console/dotMatrix.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { DotBank, DotDriver, dotGrid, dotText, dotTextWidth, dotType, dotWordLayout, dotTuning } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

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

test('the type preserves full words and a consistent size for one to five ideographs', () => {
    assert.deepEqual([dotType.word, dotType.legend], [20, 12], 'the classic sign sizes for ideographs');
    assert.ok(dotGrid.cols <= 128, 'coarse enough that lamps show at the ordinary viewing distance');
    assert.deepEqual([1, 2, 3, 4, 5].map(n => dotWordLayout('龙'.repeat(n)).size), [20, 20, 20, 20, 20]);
    assert.equal(dotWordLayout('coast').size, dotWordLayout('海岸').size, 'both scripts start at the same size');
    for (const word of ['龙', '亚特兰蒂斯', '巴黎圣母院', 'lighthouse', 'shakespeare', 'migratory bird', 'notre dame']) {
        const layout = dotWordLayout(word);
        assert.equal(layout.lines.join(word.includes(' ') ? ' ' : ''), word);
        assert.ok(layout.width <= dotGrid.cols - 2 * dotGrid.inset, word);
        assert.ok(layout.size >= dotType.split);
        assert.ok(layout.lines.length === 1 || layout.size * 2 <= dotGrid.bandBottom - dotGrid.bandTop + 1);
    }
    const long = dotWordLayout('supercalifragilisticexpialidocious');
    assert.ok(long.width > dotGrid.cols);
    assert.equal(long.lines[0], 'supercalifragilisticexpialidocious', 'never elide a secret word');
    const measured = dotWordLayout('IIIIIIIIIIII', (_, size) => size * 3);
    assert.equal(measured.size, dotType.word, 'actual font metrics win over character-count guesses');
});

test('a diode panel proves its dots, clears, clocks its columns in, and dies with its supply', () => {
    const driver = cold(2);
    const samples = record(driver, 1.2);
    const tested = samples.filter(s => s.test === 1);
    assert.ok(tested.length >= 8 && tested.at(-1).time < .4, 'lamp test');
    assert.ok(tested.every(s => s.reveal === 0), 'nothing is loaded while every dot is lit');
    const loading = samples.filter(s => s.reveal > 0 && s.reveal < 1);
    assert.ok(loading[0].time > tested.at(-1).time + dotTuning.clear * .8, 'a dark beat before the message');
    for (let i = 1; i < loading.length; i++) assert.ok(loading[i].reveal > loading[i - 1].reveal);
    assert.ok(loading.at(-1).time - loading[0].time > .18 && loading.at(-1).time - loading[0].time < .34);
    assert.equal(driver.resting, true);
    assert.deepEqual(packed(driver), [[1, 1, 0, 1], [0, dotGrid.cols, 2, 0]], 'rest is exact');
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
    crawling.strip = dotGrid.cols + 40;
    for (let i = 0; i < 60; i++) crawling.step(1 / 60);
    assert.equal(crawling.scroll, 0, 'the first second holds still so the word can be read');
    for (let i = 0; i < 60; i++) crawling.step(1 / 60);
    assert.ok(crawling.scroll > 10 && crawling.scroll < crawling.strip + dotGrid.gap);
    assert.equal(packed(crawling)[1][0], Math.floor(crawling.scroll), 'the message moves in whole dots');
    crawling.power(false);
    crawling.step(1 / 60);
    assert.equal(crawling.scroll, 0);
});

const bank = () => new DotBank([0, 1, 2, 3].map(seed => new DotDriver(seed)));
const advanceBank = (b, seconds) => { for (let t = 0; t < seconds; t += 1 / 120) b.advance(1 / 120); };

test('the shared palette changes only after all four modules are dark, then boots in order', () => {
    const b = bank(); b.sync(true, { id: 'classic', message: 'old' });
    b.sync(true, { id: 'amber', message: 'new' });
    assert.equal(b.current.id, 'classic');
    let darkFor = 0, exchanged = false, times = [];
    for (let t = 0; t < 1; t += 1 / 120) {
        const before = b.current.id;
        b.advance(1 / 120);
        if (b.drivers.every(d => !d.lit)) darkFor += 1 / 120;
        if (before !== b.current.id) {
            assert.ok(darkFor >= dotTuning.darkBeat * .8);
            assert.ok(b.drivers.every(d => d.reveal === 0 && !d.lit));
            exchanged = true;
        }
        b.drivers.forEach((d, i) => { if (d.test && times[i] === undefined) times[i] = t; });
    }
    assert.ok(exchanged);
    assert.equal(b.current.message, 'new');
    assert.equal(b.moving, false);
    assert.ok(times.every((time, i) => !i || time > times[i - 1]));
    assert.ok(times[3] - times[0] >= .1);
});

test('rapid selections converge to the latest theme, including a selection during boot', () => {
    const b = bank(); b.sync(true, { id: 'classic' });
    b.sync(true, { id: 'amber' }); b.advance(.04);
    b.sync(true, { id: 'violet' }); b.advance(.04);
    b.sync(true, { id: 'rose' }); advanceBank(b, .25);
    assert.equal(b.current.id, 'rose');
    b.sync(true, { id: 'amber' }); advanceBank(b, 1);
    assert.equal(b.current.id, 'amber'); assert.equal(b.moving, false);
    b.sync(true, { id: 'amber', message: 'updated' });
    assert.equal(b.current.message, 'updated');
    assert.ok(b.drivers.every(d => d.reveal === 1 && d.resting), 'same-theme game updates do not reboot');
});

test('power off during a theme transition stays dark and takes the latest choice for the next boot', () => {
    const b = bank(); b.sync(true, { id: 'classic', frame: 'visible' });
    b.sync(true, { id: 'amber', frame: 'next' }); b.advance(.04);
    b.sync(false, { id: 'rose', frame: 'blank' });
    assert.equal(b.current.frame, 'visible', 'old picture survives the physical supply fall');
    advanceBank(b, .5);
    assert.equal(b.current.id, 'rose'); assert.equal(b.current.frame, 'blank');
    assert.ok(b.drivers.every(d => !d.lit && !d.on));
    assert.equal(b.moving, false);
    b.sync(false, { id: 'violet', frame: 'off' });
    assert.ok(b.drivers.every(d => !d.lit && !d.on));
    b.sync(true, { id: 'violet', frame: 'restored' }); advanceBank(b, 1);
    assert.equal(b.current.frame, 'restored'); assert.ok(b.drivers.every(d => d.reveal === 1));
});

test('reduced motion settles a pending palette and supply immediately', () => {
    const b = bank(); b.sync(true, { id: 'classic' });
    b.sync(true, { id: 'rose' }); b.advance(.04); b.advance(0, true);
    assert.equal(b.current.id, 'rose'); assert.equal(b.moving, false);
    assert.ok(b.drivers.every(d => d.brightness === 1 && d.reveal === 1 && d.test === 0));
    b.sync(false, { id: 'amber' }); b.advance(0, true);
    assert.equal(b.current.id, 'amber'); assert.ok(b.drivers.every(d => !d.lit));
});
