import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const compile = async name => ts.transpileModule(await readFile(new URL(`../src/components/console/${name}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText.replace("'three'", JSON.stringify(import.meta.resolve('three')));
const dependencies = Object.fromEntries(await Promise.all(['crt', 'dotMatrix', 'dotFiltering'].map(async name => [name, moduleUrl(await compile(name))])));
const shaderModule = (await compile('crtShader')).replace(/'\.\/(crt|dotMatrix|dotFiltering)'/g, (_, name) => JSON.stringify(dependencies[name]));
const { shadeCrt, crtUniforms, dotUniforms, dotInks, terminalUniforms, terminalRows } = await import(moduleUrl(shaderModule));

test('cached LED and CRT programs retain live palette and drive bindings after hardware swaps', () => {
    const material = new THREE.MeshBasicMaterial(), tube = crtUniforms('word'), dots = dotUniforms();
    let display = 'led';
    shadeCrt(material, {
        kind: 'word', seed: 1, lite: () => false, time: { value: 0 }, eye: { value: new THREE.Vector3() },
        tube, dots, display: () => display, size: new THREE.Vector2(4, 2),
        curvature: { warp: .055, rise: .035, innerRise: .03, depth: .012 }, spot: .01,
    });
    const compileProgram = () => {
        const shader = { uniforms: {}, fragmentShader: '#include <map_fragment>\n#include <dithering_fragment>' };
        material.onBeforeCompile(shader, {});
        return shader;
    };
    const led = compileProgram();
    display = 'crt';
    const crt = compileProgram();
    // Three keeps the most recently compiled uniform table when it returns to
    // an already-cached program. That table must serve either fitted display.
    for (const name of Object.keys(led.uniforms)) {
        assert.ok(name in crt.uniforms, `cached LED program still receives ${name}`);
        assert.deepEqual(crt.uniforms[name], led.uniforms[name]);
    }
    assert.equal(crt.uniforms.dotInkWord, dotInks.word);
    assert.equal(crt.uniforms.dotDrive, dots.drive);
    assert.equal(led.uniforms.crtHot, tube.hot);
    const previous = dotInks.word.value.clone();
    try {
        dotInks.word.value.set('#e5c28b');
        assert.equal(crt.uniforms.dotInkWord.value.getHexString(), 'e5c28b', 'returning to LED uses the new theme');
        tube.hot.value.set('#cdb6cd');
        assert.equal(led.uniforms.crtHot.value.getHexString(), 'cdb6cd', 'returning to CRT uses the new phosphor');
    } finally { dotInks.word.value.copy(previous); material.dispose(); }
});

test('only the main screen is a terminal: blink cells and page writes bind to its program', () => {
    const compileProgram = (material) => {
        const shader = { uniforms: {}, fragmentShader: '#include <map_fragment>\n#include <dithering_fragment>' };
        material.onBeforeCompile(shader, {});
        return shader;
    };
    const options = kind => ({ kind, seed: 0, lite: () => false, time: { value: 0 }, eye: { value: new THREE.Vector3() }, tube: crtUniforms(kind),
        size: new THREE.Vector2(4, 2), curvature: { warp: .055, rise: .035, innerRise: .03, depth: .012 }, spot: .004 });
    const screen = new THREE.MeshBasicMaterial(), scope = new THREE.MeshBasicMaterial(), terminal = terminalUniforms('#111e24', 830 / 1400);
    shadeCrt(screen, { ...options('screen'), terminal });
    shadeCrt(scope, options('scope'));
    try {
        const program = compileProgram(screen), plain = compileProgram(scope);
        assert.ok(program.fragmentShader.includes('#define CRT_TERMINAL') && program.fragmentShader.includes('crtAttribute('));
        for (const [name, uniform] of Object.entries({ crtBlink: terminal.blink, crtBlinkKind: terminal.blinkKind, crtWrite: terminal.write, crtBlank: terminal.blank, crtPage: terminal.page }))
            assert.equal(program.uniforms[name], uniform, name);
        assert.ok(!plain.fragmentShader.includes('#define CRT_TERMINAL') && !plain.fragmentShader.includes('uniform vec4 crtBlink') && !('crtBlink' in plain.uniforms), 'the scope stays a plain tube');
        assert.notEqual(screen.customProgramCacheKey(), scope.customProgramCacheKey());
        assert.match(screen.customProgramCacheKey(), /-terminal$/);
        assert.equal(terminal.blank.value.getHexString(), '111e24', 'a cleared cell shows the page colour');
        assert.equal(terminal.write.value.x, terminalRows, 'a page starts fully written');
        assert.equal(terminal.blinkKind.value.lengthSq(), 0, 'nothing blinks until a page asks');
    } finally { screen.dispose(); scope.dispose(); }
});
