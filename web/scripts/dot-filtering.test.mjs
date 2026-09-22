import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const compile = async name => ts.transpileModule(await readFile(new URL(`../src/components/console/${name}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { dotKernelShader, dotFilterOptions, readDotFilter, readWordScale } = await import(moduleUrl(await compile('dotFiltering')));
const { translate } = await import(moduleUrl(await compile('i18n')));

// Execute the actual scalar shader kernel, not a separately maintained CPU
// version, and compare it with an independent, dense numerical integration.
const scalarJs = dotKernelShader.replace(/float (\w+)\(/g, 'function $1(').replace(/float (\w+)(?=\s*[,\)])/g, '$1').replace(/\bfloat\b/g, 'let');
const { ledIntegral, ledGaussian } = new Function('abs', 'exp', 'sign', 'max', 'clamp', `${scalarJs}; return { ledIntegral, ledGaussian };`)(
    Math.abs, Math.exp, Math.sign, Math.max, (v, a, b) => Math.max(a, Math.min(b, v)),
);
function quadrature(fn, lo, hi, steps = 8192) {
    const width = (hi - lo) / steps;
    let sum = 0;
    for (let i = 0; i < steps; i++) sum += fn(lo + (i + .5) * width) * width;
    return sum;
}

test('the LED area kernel matches independent quadrature across pixel sizes and cell edges', () => {
    for (const sigma of [.225, .12]) {
        const g = x => Math.exp(-.5 * (x / sigma) ** 2);
        const norm = quadrature(g, -.5, .5);
        for (const width of [.005, .08, .3, .8, 1.3, 2.4]) for (const offset of [-1.2, -.51, -.37, 0, .19, .49, .8]) {
            const lo = Math.max(-.5, offset - width / 2), hi = Math.min(.5, offset + width / 2);
            const reference = hi > lo ? quadrature(g, lo, hi) / (width * norm) : 0;
            const actual = ledIntegral(offset, width, sigma);
            assert.ok(Number.isFinite(actual) && actual >= 0);
            assert.ok(Math.abs(actual - reference) < .00015, `${sigma}, ${width}, ${offset}: ${actual} vs ${reference}`);
        }
        assert.ok(Math.abs(quadrature(x => ledGaussian(x, sigma), -.5, .5) - 1) < .00001);
    }
});

test('zoom and subpixel translation preserve the mean light of a powered lattice', () => {
    for (const width of [.08, .3, .8, 1.3, 2.4]) for (const sigma of [.225, .12]) {
        const mean = quadrature(at => {
            let sum = 0;
            for (let lamp = -2; lamp <= 2; lamp++) sum += ledIntegral(at - lamp - .5, width, sigma);
            return sum;
        }, 0, 1, 1024);
        assert.ok(Math.abs(mean - 1) < .0001, `${width}, ${sigma}: ${mean}`);
    }
});

test('four subpixel samples per axis converge toward area integration across lit and dark lamps', () => {
    const duty = cell => [1, 0, .35, 1, 1, 0, .8][((cell % 7) + 7) % 7];
    const point = x => duty(Math.floor(x)) * ledGaussian(x - Math.floor(x) - .5, .225);
    let singleError = 0, sampledError = 0;
    for (const width of [.3, .6, 1, 1.5]) for (let i = 0; i < 256; i++) {
        const at = i / 256 * 7;
        let reference = 0, samples = 0;
        for (let cell = Math.floor(at) - 2; cell <= Math.floor(at) + 2; cell++)
            reference += duty(cell) * ledIntegral(at - cell - .5, width, .225);
        for (let n = 0; n < 4; n++) samples += point(at + ((n + .5) / 4 - .5) * width) / 4;
        singleError += (point(at) - reference) ** 2;
        sampledError += (samples - reference) ** 2;
    }
    assert.ok(sampledError < singleError * .1, `${sampledError} vs unfiltered ${singleError}`);
});

test('review URLs select only known filters and finite zooms, and all choices have English copy', () => {
    for (const option of dotFilterOptions) {
        assert.equal(readDotFilter(option.id), option.id);
        for (const text of [option.label, option.description]) assert.doesNotMatch(translate('en', text), /[\u3400-\u9fff]/);
    }
    for (const value of [null, 'garbage', '__proto__']) assert.equal(readDotFilter(value), 'area');
    assert.equal(readWordScale('2.35', false), 2.35);
    for (const value of [null, '', '0', '-1', '5', 'NaN', 'Infinity']) {
        assert.equal(readWordScale(value, false), 1);
        assert.equal(readWordScale(value, true), 2);
    }
});
