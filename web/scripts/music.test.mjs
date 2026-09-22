import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import ts from 'typescript';
const compiled = ts.transpileModule(await readFile(new URL('../src/components/console/music.ts', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const { ConsoleMusic, musicScene, musicEnding, readMusicPreferences, saveMusicPreferences, musicFiles } =
    await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const flush = () => new Promise(resolve => setImmediate(resolve));
const home = { phase: 'home', connected: true, recovering: false, roomCode: '1234', myTeam: 'A', round: 1 };
const game = { ...home, phase: 'encrypting' };
const ending = { ...game, phase: 'game_over', gameOver: { winner: 'A' } };
function fixture(loader) {
    const sources = [], gains = [], requests = [], statuses = [];
    let unlocked = true, outputs = 0;
    const context = {
        state: 'running', currentTime: 0,
        createGain() {
            const events = [];
            const gain = { value: 1, events };
            for (const method of ['setValueAtTime', 'linearRampToValueAtTime', 'setTargetAtTime', 'cancelScheduledValues'])
                gain[method] = (...args) => { events.push([method, ...args]); if (!method.startsWith('cancel')) gain.value = args[0]; };
            const node = { gain, connect(target) { this.target = target; }, disconnect() { this.disconnected = true; } };
            gains.push(node); return node;
        },
        async decodeAudioData() { return { duration: 82.12925 }; },
        createBufferSource() {
            const source = { connect(target) { this.target = target; }, disconnect() { this.disconnected = true; },
                start(...args) { this.startArgs = args; }, stop(at = context.currentTime) { this.stopAt = at; },
                finish() { this.onended?.(); } };
            sources.push(source); return source;
        },
    };
    const destination = {};
    const music = new ConsoleMusic(async () => { outputs++; return unlocked ? { context, destination } : undefined; },
        status => statuses.push(status), async (id, signal) => {
            requests.push({ id, signal }); return loader ? loader(id, signal) : new ArrayBuffer(1);
        });
    return { music, context, sources, gains, requests, statuses, destination,
        outputs: () => outputs, unlock(value) { unlocked = value; },
        async start(state = home) {
            music.configure({ enabled: true });
            music.transition(state, state); await flush();
        } };
}

test('music defaults on, waits for an unlocked context and honors its own switch', async () => {
    const f = fixture(); f.unlock(false);
    f.music.transition(home, home); await flush();
    assert.equal(f.requests.length, 0);
    f.music.configure({ enabled: false });
    f.unlock(true); await f.music.refresh();
    assert.equal(f.sources.length, 0);
    f.music.configure({ enabled: true }); await flush();
    assert.equal(f.sources.length, 1);
    assert.equal(f.sources[0].target.target.target.target, f.destination);
    f.music.dispose();
});

test('restoring a terminal after an unseen ending stops the old loop without replaying a stinger', async () => {
    const f = fixture(); await f.start(game);
    const before = f.requests.length;
    assert.equal(f.music.transition(ending, ending, false), false);
    await flush();
    assert.equal(f.requests.length, before);
    assert.ok(f.sources.every(source => source.stopAt !== undefined));
    f.music.dispose();
});

test('a gesture arriving during a passive unlock attempt still starts music', async () => {
    const f = fixture(); f.unlock(false);
    f.music.configure({ enabled: true });
    f.music.transition(home, home);
    f.unlock(true); void f.music.refresh();
    await flush();
    assert.equal(f.sources.length, 1); assert.equal(f.requests.length, 1);
    f.music.dispose();
});

test('home/room and all active game phases retain one continuous loop each', async () => {
    const f = fixture(); await f.start();
    f.context.currentTime = 15;
    f.music.transition(home, { ...home, phase: 'room' }); await flush();
    assert.equal(f.sources.length, 1);
    f.music.transition(home, game); await flush();
    assert.equal(f.sources.length, 2);
    assert.equal(f.sources[0].stopAt, 15.9);
    for (const phase of ['intercept', 'decrypt', 'round_result', 'encrypting']) {
        f.music.transition(game, { ...game, phase, round: 2 }); await flush();
        assert.equal(f.sources.length, 2);
    }
    assert.equal(f.sources[1].loop, true);
    assert.equal(f.sources[1].loopEnd, 82.12925);
    assert.equal(f.sources[1].stopAt, undefined);
    f.music.dispose();
});

test('tab hiding and music off stop immediately and resume the saved loop position', async () => {
    for (const gate of ['visible', 'enabled']) {
        const f = fixture(); await f.start(game);
        f.context.currentTime = 12;
        f.music.configure({ [gate]: false });
        assert.equal(f.sources[0].stopAt, 12); assert.equal(f.sources[0].disconnected, true);
        f.context.currentTime = 60;
        f.music.configure({ [gate]: true }); await flush();
        assert.deepEqual(f.sources[1].startArgs, [60, 12]);
        assert.equal(f.requests.length, 1, 'paused loop reuses its buffer');
        f.music.dispose();
    }
});

test('power-off fades, while music mute also kills already fading sources', async () => {
    const f = fixture(); await f.start(game);
    f.context.currentTime = 2;
    f.music.configure({ powered: false });
    assert.equal(f.sources[0].stopAt, 2.65);
    f.context.currentTime = 2.1;
    f.music.configure({ enabled: false });
    assert.equal(f.sources[0].stopAt, 2.1); assert.equal(f.sources[0].disconnected, true);
    f.music.dispose();
});

test('muting during fetch invalidates and aborts pending music without a delayed start', async () => {
    let resolve;
    const f = fixture(() => new Promise(done => { resolve = done; }));
    await f.start();
    f.music.configure({ enabled: false });
    assert.equal(f.requests[0].signal.aborted, true);
    resolve(new ArrayBuffer(1)); await flush();
    assert.equal(f.sources.length, 0); assert.notEqual(f.statuses.at(-1), 'error');
    f.music.dispose();
});

test('stale decoded tracks cannot replace the latest scene', async () => {
    const pending = [];
    const f = fixture();
    f.context.decodeAudioData = () => new Promise(resolve => pending.push(resolve));
    await f.start();
    f.music.transition(home, game); await flush();
    pending[1]({ duration: 82 }); await flush();
    pending[0]({ duration: 82 }); await flush();
    assert.equal(f.sources.length, 1); assert.equal(f.requests.at(-1).id, 'game');
    f.music.dispose();
});

test('fresh win/loss replaces the beep, plays once, then settles into silence', async () => {
    for (const winner of ['A', 'B']) {
        const f = fixture(); await f.start(game);
        const next = { ...ending, gameOver: { winner } };
        assert.equal(f.music.transition(game, next), true); await flush();
        assert.equal(f.requests.at(-1).id, winner === 'A' ? 'win' : 'loss');
        assert.equal(f.sources.at(-1).loop, false);
        f.music.transition(next, { ...next, round: 99 }); await flush();
        assert.equal(f.sources.length, 2);
        f.sources.at(-1).finish(); await f.music.refresh();
        assert.equal(f.sources.length, 2); assert.equal(f.statuses.at(-1), 'ready');
        f.music.transition(next, home); await flush();
        assert.equal(f.requests.at(-1).id, 'lobby');
        f.music.dispose();
    }
});

test('hidden/muted endings, restored snapshots, observers and draws never queue stingers', async () => {
    for (const patch of [{ connected: false }, { recovering: true }, { roomCode: 'other' }, { myTeam: null },
        { myRole: 'observer' }, { gameOver: { winner: null } }, { gameOver: { winner: 'unknown' } }]) {
        assert.equal(musicEnding(game, { ...ending, ...patch }), undefined);
    }
    assert.equal(musicEnding({ ...game, recovering: true }, ending), undefined);
    assert.equal(musicEnding(ending, ending), undefined);
    const f = fixture(); await f.start(game);
    f.music.configure({ visible: false });
    assert.equal(f.music.transition(game, ending), false);
    f.music.configure({ visible: true }); await flush();
    assert.equal(f.sources.length, 1);
    assert.equal(musicScene(ending), null);
    f.music.dispose();
});

test('interrupting a stinger consumes it instead of replaying it on unmute', async () => {
    const f = fixture(); await f.start(game);
    f.music.transition(game, ending); await flush();
    f.music.configure({ enabled: false }); f.music.configure({ enabled: true }); await flush();
    assert.equal(f.sources.length, 2);
    f.music.dispose();
});

test('ducking has attack, hold and recovery; keys and knobs do not duck', async () => {
    const f = fixture(); await f.start();
    const duck = f.gains[1].gain;
    f.music.duck('key'); f.music.duck('dial'); assert.equal(duck.events.length, 0);
    f.music.duck('turn');
    assert.ok(duck.events.some(e => e[0] === 'linearRampToValueAtTime' && e[1] === .35));
    assert.deepEqual(duck.events.at(-1), ['linearRampToValueAtTime', 1, 1.15]);
    f.music.dispose();
});

test('load errors are contained, can be retried, and dispose cancels all work', async () => {
    let fail = true;
    const f = fixture(async () => { if (fail) throw new Error('offline'); return new ArrayBuffer(1); });
    await f.start(); assert.equal(f.statuses.at(-1), 'error');
    fail = false; await f.music.refresh(); assert.equal(f.sources.length, 1);
    f.music.dispose(); await f.music.refresh();
    assert.ok(f.sources.every(s => s.disconnected));
    assert.ok(f.gains.every(g => g.disconnected));
});

test('music preferences persist, validate volume and tolerate disabled storage', () => {
    let value;
    globalThis.localStorage = { getItem: () => value, setItem: (_, v) => { value = v; } };
    assert.deepEqual(readMusicPreferences(), { enabled: true, volume: .6 });
    saveMusicPreferences({ enabled: true, volume: .42 }); assert.equal(readMusicPreferences().volume, .42);
    value = '{"enabled":"true","volume":5}'; assert.deepEqual(readMusicPreferences(), { enabled: true, volume: 1 });
    saveMusicPreferences({ enabled: false, volume: .6 }); assert.equal(readMusicPreferences().enabled, false);
    value = '{bad'; assert.equal(readMusicPreferences().enabled, true);
    globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    assert.doesNotThrow(() => saveMusicPreferences({ enabled: true, volume: .5 }));
    assert.equal(readMusicPreferences().enabled, true);
});

test('the four locally served files match the measured, credited build manifest', async () => {
    const manifest = JSON.parse(await readFile(new URL('../public/audio/music/manifest.json', import.meta.url), 'utf8'));
    assert.equal(manifest.license, 'CC0-1.0');
    assert.equal(Object.keys(manifest.tracks).length, 4);
    for (const [id, track] of Object.entries(manifest.tracks)) {
        const file = new URL(`../public${musicFiles[id]}`, import.meta.url);
        assert.equal((await stat(file)).size, track.bytes);
        assert.ok(track.peak_dbtp < -2);
        if (track.loop) assert.ok(track.boundary_step < .02);
    }
});
