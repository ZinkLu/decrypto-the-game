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
const { shadeCrt, crtUniforms, dotUniforms, dotInks } = await import(moduleUrl(shaderModule));

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
