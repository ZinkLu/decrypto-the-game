import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/components/console/rosterMotion.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { RosterMotion, rosterPose } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const person = (id, name = id) => ({ id, name });
const finish = motion => { for (let i = 0; i < 120; i++) motion.advance(1 / 60); };

test('joining inserts a named card; leaving keeps its ink until it clears the rack', () => {
    const motion = new RosterMotion();
    motion.sync(null);
    motion.sync(person('human', '夜航员'));
    motion.advance(.08);
    assert.equal(motion.current.name, '夜航员');
    assert.ok(motion.amount > 0 && motion.amount < 1);
    finish(motion);
    assert.equal(motion.amount, 0);
    motion.sync(null);
    motion.advance(.12);
    assert.equal(motion.current.name, '夜航员', 'never erase a departing name early');
    assert.ok(motion.amount > 0 && motion.amount < 1);
    finish(motion);
    assert.equal(motion.current, null);
    assert.equal(motion.amount, 1);
});

test('an occupied-seat replacement withdraws the old card before displaying the new identity', () => {
    const motion = new RosterMotion();
    motion.sync(person('old', '相同名字'));
    motion.sync(person('new', '相同名字'));
    motion.advance(.21);
    assert.equal(motion.current.id, 'old', 'identity is the player ID, not the name or occupied flag');
    motion.advance(.21);
    assert.equal(motion.amount, 1);
    assert.equal(rosterPose(motion.amount).opacity, 0, 'exchange ink only when hidden');
    assert.equal(motion.current.id, 'new');
    finish(motion);
    assert.equal(motion.amount, 0);
});

test('rapid roster updates converge to the latest occupant and same-person updates do not replay motion', () => {
    const motion = new RosterMotion();
    motion.sync(person('a')); motion.sync(null); motion.advance(.10);
    motion.sync(person('b')); motion.advance(.08);
    motion.sync(person('c')); finish(motion);
    assert.equal(motion.current.id, 'c');
    motion.sync(person('c', '已提交')); motion.advance(.10);
    assert.equal(motion.current.name, '已提交');
    assert.equal(motion.amount, 0);
    motion.sync(null); motion.advance(.10);
    motion.sync(person('c', '重新连接')); finish(motion);
    assert.equal(motion.current.name, '重新连接');
    assert.equal(motion.amount, 0);
});

test('reduced motion settles join, replace and leave immediately, including mid-animation', () => {
    const motion = new RosterMotion();
    motion.sync(null); motion.sync(person('a')); motion.advance(.1);
    motion.advance(0, true);
    assert.equal(motion.current.id, 'a'); assert.equal(motion.amount, 0);
    motion.sync(person('b')); motion.advance(0, true);
    assert.equal(motion.current.id, 'b'); assert.equal(motion.amount, 0);
    motion.sync(null); motion.advance(0, true);
    assert.equal(motion.current, null); assert.equal(motion.amount, 1);
});

test('the card releases the fixed brass clips before sliding upward', () => {
    assert.deepEqual(rosterPose(0), { y: 0, z: 0, opacity: 1 });
    const released = rosterPose(.28);
    assert.equal(released.y, .045);
    assert.equal(released.z, 0, 'lift above the retainer before crossing its depth');
    assert.equal(released.opacity, 1);
    const aligned = rosterPose(.56);
    assert.equal(aligned.y, .045);
    assert.equal(aligned.z, .16, 'clear adjacent-row hardware before lifting farther');
    const sliding = rosterPose(.8);
    assert.ok(sliding.y > .25 && sliding.z >= aligned.z);
    assert.equal(sliding.opacity, 1, 'keep the name readable for most of the travel');
    assert.equal(rosterPose(1).opacity, 0);
});
