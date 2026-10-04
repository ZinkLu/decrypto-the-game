import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './load.mjs';

const { tourAction, tourSteps, readTourProgress, saveTourProgress } = await import(await moduleUrl('onboarding'));
const { initialLocal, previewState, roleState } = await import(await moduleUrl('model'));
const ids = context => tourSteps(context).map(step => step.id);
const actions = ['start', 'clues', 'guess', 'return'];
const allSteps = () => [...tourSteps({ home: true }), ...actions.flatMap(action => tourSteps({ home: false, words: true, voice: true, action }))];

test('the first visit explains entering a room before any room-only controls', () => {
    for (const words of [false, true]) for (const voice of [false, true]) {
        assert.deepEqual(ids({ home: true, words, voice }), ['enter', 'action-enter']);
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

test('number entry precedes ACTION only when this player is guessing', () => {
    assert.deepEqual(ids({ home: false, words: true, voice: true, action: 'guess' }),
        ['room', 'history', 'words', 'keypad', 'action-guess', 'voice']);
    for (const action of [undefined, 'start', 'clues', 'return']) {
        const steps = ids({ home: false, words: true, voice: true, action });
        assert.equal(steps.includes('keypad'), false, `${action} does not use the number keypad`);
        assert.deepEqual(steps.filter(id => id.startsWith('action-')), action ? [`action-${action}`] : []);
    }
});

test('entering, starting, and submitting have separate completion IDs', () => {
    const seen = new Set([
        ...ids({ home: true }),
        ...ids({ home: false, words: true, voice: true, action: 'start' }),
    ]);
    const unseen = action => ids({ home: false, words: true, voice: true, action }).filter(id => !seen.has(id));
    assert.deepEqual(unseen('clues'), ['action-clues'], 'using ACTION in the lobby must not suppress clue submission guidance');
    assert.deepEqual(unseen('guess'), ['keypad', 'action-guess'], 'using ACTION in the lobby must not suppress guess submission guidance');
    seen.add('action-clues');
    assert.deepEqual(unseen('guess'), ['keypad', 'action-guess'], 'clue submission does not teach number entry or guess submission');
});

test('ACTION guidance explains the current operation before the form is complete', () => {
    assert.equal(tourAction(previewState({}, 'home'), initialLocal), 'enter');
    assert.equal(tourAction({ ...previewState({}, 'room'), canStart: false }, initialLocal), 'start', 'the owner can learn how to start before both teams are ready');
    assert.equal(tourAction(previewState({}, 'game_over'), initialLocal), 'return');
    for (const [preview, action] of [['encrypting', 'clues'], ['decrypt', 'guess'], ['intercept', 'guess']]) {
        const state = previewState({}, preview);
        assert.equal(roleState(state, initialLocal).ready, false, 'the initial form is incomplete');
        assert.equal(tourAction(state, initialLocal), action, `${preview} must explain how to complete the action before it is ready`);
    }
});

test('ACTION guidance never invites gameplay submission from an inactive seat', () => {
    for (const preview of ['encrypting', 'decrypt', 'intercept']) {
        const state = previewState({}, preview);
        for (const unavailable of [{ submitted: true }, { waiting: true }, { recovering: true }, { deadline: Date.now() - 1000 }, { connected: false }, { myRole: 'observer' }]) {
            assert.equal(tourAction({ ...state, ...unavailable }, initialLocal), undefined, `${preview}: ${JSON.stringify(unavailable)}`);
        }
        assert.equal(tourAction(state, { ...initialLocal, submitted: true }), undefined, `${preview}: local submission already sent`);
    }
    assert.equal(tourAction({ ...previewState({}, 'room'), ownerID: 'someone-else' }, initialLocal), undefined, 'only the room owner starts the game');
    assert.equal(tourAction({ ...previewState({}, 'intercept'), round: 2 }, initialLocal), undefined, 'opponents cannot intercept before round three');
    for (const preview of ['waiting', 'listening', 'watch-guess', 'decrypt-sent', 'round_result']) {
        assert.equal(tourAction(previewState({}, preview), initialLocal), undefined, `${preview} has no submission to explain`);
    }
});

test('every instruction has a desktop and compact explanation and a real target selector', () => {
    const all = allSteps();
    assert.deepEqual([...new Set(all.map(step => step.id))].sort(),
        ['enter', 'action-enter', 'room', 'history', 'words', 'voice', 'keypad', ...actions.map(action => `action-${action}`)].sort(),
        'guidance stays limited to essential game functions');
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
    for (const step of allSteps()) {
        for (const key of ['title', 'body', 'mobile']) {
            assert.doesNotMatch(translate('en', step[key]), /[\u3400-\u9fff]/, `${step.id}.${key}`);
        }
    }
});
