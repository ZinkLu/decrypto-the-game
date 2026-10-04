import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './load.mjs';

const { tourSteps, readTourProgress, saveTourProgress } = await import(await moduleUrl('onboarding'));
const ids = context => tourSteps(context).map(step => step.id);

test('the first visit explains entering a room before any room-only controls', () => {
    for (const words of [false, true]) for (const voice of [false, true]) {
        assert.deepEqual(ids({ home: true, words, voice }), ['enter']);
    }
});

test('room guidance includes only available private words and voice controls', () => {
    for (const words of [false, true]) for (const voice of [false, true]) {
        const steps = ids({ home: false, words, voice });
        assert.ok(steps.includes('room'), 'the room number is useful to everyone in the room');
        assert.ok(steps.includes('history'), 'public history is useful to players and observers');
        assert.equal(steps.includes('words'), words, 'observers are never taught to reveal private words');
        assert.equal(steps.includes('voice'), voice, 'servers without voice never advertise joining it');
        assert.equal(steps.includes('enter'), false);
        assert.equal(new Set(steps).size, steps.length, 'a control is taught only once in each sequence');
    }
});

test('every instruction has a desktop and compact explanation and a real target selector', () => {
    const all = [...tourSteps({ home: true, words: false, voice: false }), ...tourSteps({ home: false, words: true, voice: true })];
    assert.deepEqual(all.map(step => step.id), ['enter', 'room', 'history', 'words', 'voice'], 'guidance stays limited to essential game functions');
    for (const step of all) for (const key of ['title', 'body', 'mobile', 'target', 'compactTarget']) {
        assert.equal(typeof step[key], 'string', `${step.id}.${key}`);
        assert.ok(step[key].trim().length, `${step.id}.${key}`);
    }
});

function withStorage(storage, callback) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    try { callback(); }
    finally {
        if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
        else delete globalThis.localStorage;
    }
}

test('completed controls and skipped guidance survive a reload independently', () => {
    const stored = new Map();
    withStorage({ getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) }, () => {
        assert.deepEqual(readTourProgress(), { seen: [], dismissed: false });
        const completed = { seen: ['enter', 'room', 'history'], dismissed: false };
        saveTourProgress(completed);
        assert.deepEqual(readTourProgress(), completed, 'new controls may still be offered after completing existing ones');
        const skipped = { seen: ['enter'], dismissed: true };
        saveTourProgress(skipped);
        assert.deepEqual(readTourProgress(), skipped, 'skipping must remain an explicit choice across visits');
    });
});

test('invalid saved guidance never prevents entering the game', () => {
    for (const raw of [null, 'broken JSON', 'null', '42', '[]', '{}', '{"seen":null,"dismissed":"true"}']) {
        withStorage({ getItem: () => raw }, () => {
            assert.deepEqual(readTourProgress(), { seen: [], dismissed: false });
        });
    }
    withStorage({ getItem: () => '{"seen":["room",0,null,{},"history"],"dismissed":true}' }, () => {
        assert.deepEqual(readTourProgress(), { seen: ['room', 'history'], dismissed: true });
    });
});

test('guidance works when browser storage is unavailable or blocked', () => {
    for (const storage of [undefined, { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } }]) {
        withStorage(storage, () => {
            assert.deepEqual(readTourProgress(), { seen: [], dismissed: false });
            assert.doesNotThrow(() => saveTourProgress({ seen: ['enter'], dismissed: true }));
        });
    }
});


test('every onboarding explanation is translated in English', async () => {
    const { translate } = await import(await moduleUrl('i18n'));
    for (const step of [...tourSteps({ home: true }), ...tourSteps({ home: false, words: true, voice: true })]) {
        for (const key of ['title', 'body', 'mobile']) {
            assert.doesNotMatch(translate('en', step[key]), /[\u3400-\u9fff]/, `${step.id}.${key}`);
        }
    }
});
