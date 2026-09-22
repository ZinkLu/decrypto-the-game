import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/components/console/sound.ts', import.meta.url), 'utf8');
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const dataURL = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const bankURL = dataURL(compile(await readFile(new URL('../src/components/console/soundBank.ts', import.meta.url), 'utf8')));
const { soundBank } = await import(bankURL);
const { ConsoleAudio, consoleSounds, gameSound } = await import(dataURL(compile(source).replace("'./soundBank'", JSON.stringify(bankURL))));

function speaker(state = 'running') {
    const voices = [], gains = [];
    const context = {
        state, currentTime: 0, sampleRate: 48000, destination: {}, decodes: 0, resumes: 0,
        createGain() {
            const node = { gain: { setValueAtTime(value) { node.value = value; }, linearRampToValueAtTime(value) { node.value = value; },
                cancelScheduledValues() {}, setTargetAtTime(value) { node.value = value; } },
                connect(destination) { this.destination = destination; }, disconnect() {} };
            gains.push(node); return node;
        },
        async decodeAudioData() { this.decodes++; return { sampleRate: 48000, duration: 20 }; },
        createBufferSource() {
            const voice = { started: false, stopped: false, disconnected: false,
                connect(node) { this.destination = node; }, disconnect() { this.disconnected = true; },
                start(...args) { this.started = true; this.startArgs = args; }, stop() { this.stopped = true; },
                finish() { this.onended?.(); } };
            voices.push(voice); return voice;
        },
        resume() { this.resumes++; return new Promise(resolve => { this.unlock = () => { this.state = 'running'; resolve(); }; }); },
        async close() { this.state = 'closed'; },
    };
    let created = 0;
    const audio = new ConsoleAudio(() => { created++; return context; }, async () => new ArrayBuffer(1));
    return { audio, context, voices, gains, created: () => created };
}

test('effects default on but passive events cannot allocate audio before a gesture', async () => {
    const s = speaker();
    for (const cue of consoleSounds) await s.audio.play(cue);
    assert.equal(s.created(), 0);
    await s.audio.play('key', true);
    assert.equal(s.created(), 1);
    assert.equal(s.voices.length, 1);
    assert.equal(s.voices[0].destination.destination, s.gains[1], 'every effect uses its own gate');
    assert.equal(s.gains[1].destination, s.gains[0], 'effects then reach the shared output');
    s.audio.dispose();
});

test('muting effects leaves the music output available, including first-gesture unlock', async () => {
    const s = speaker(); s.audio.setEnabled(false);
    assert.equal(await s.audio.output(), undefined);
    await s.audio.unlock();
    const output = await s.audio.output();
    assert.equal(output.destination, s.gains[0]);
    assert.equal(s.gains[0].value, .45);
    assert.equal(s.gains[1].value, 0);
    await s.audio.play('key', true);
    assert.equal(s.voices.length, 0);
    s.audio.setEnabled(true);
    await s.audio.play('key', true);
    assert.equal(s.voices.length, 1);
    s.audio.setEnabled(false);
    assert.equal(s.gains[0].value, .45, 'effects mute never changes the music output gain');
    s.audio.setVisible(false);
    assert.equal(s.gains[0].value, 0, 'hidden pages still silence both channels');
    s.audio.dispose();
});

test('rear switch stops current sounds immediately and never replays them after enabling', async () => {
    const s = speaker(); s.audio.setEnabled(true);
    await s.audio.play('transmit', true);
    await s.audio.play('paper-feed');
    s.audio.setEnabled(false);
    assert.equal(s.gains[1].value, 0);
    assert.ok(s.voices.every(v => v.stopped && v.disconnected));
    const count = s.voices.length;
    for (const cue of consoleSounds) await s.audio.play(cue, true);
    assert.equal(s.voices.length, count);
    s.audio.setEnabled(true);
    assert.equal(s.voices.length, count, 'enabling itself does not replay anything');
    await s.audio.play('key', true);
    assert.equal(s.voices.length, count + 1);
    s.audio.dispose();
});

test('mute/on while resume is pending invalidates old requests, including a queued test tone', async () => {
    const s = speaker('suspended'); s.audio.setEnabled(true);
    const old = s.audio.play('transmit', true);
    s.audio.setEnabled(false); s.audio.setEnabled(true);
    const fresh = s.audio.play('test', true);
    assert.equal(s.context.resumes, 1);
    s.context.unlock();
    await Promise.all([old, fresh]);
    assert.equal(s.voices.length, 1, 'only the new test tone is eligible');
    s.context.state = 'suspended';
    await s.audio.play('score');
    assert.equal(s.context.resumes, 1, 'animation and network events never resume audio');
    s.audio.dispose();
});

test('hidden pages cut tails and pending resumes; returning does not replay notifications', async () => {
    const s = speaker(); s.audio.setEnabled(true);
    await s.audio.play('success', true);
    s.audio.setVisible(false);
    assert.equal(s.gains[0].value, 0);
    assert.ok(s.voices[0].stopped);
    await s.audio.play('turn');
    s.audio.setVisible(true);
    assert.equal(s.voices.length, 1);
    s.context.state = 'suspended';
    const pending = s.audio.play('key', true);
    s.audio.setVisible(false); s.audio.setVisible(true); s.context.unlock();
    await pending;
    assert.equal(s.voices.length, 1);
    s.audio.dispose();
});

test('repeated gestures are throttled, the bank decodes once and recorded variations alternate', async () => {
    const s = speaker(); s.audio.setEnabled(true);
    for (let i = 0; i < 100; i++) await s.audio.play('knob', true);
    assert.equal(s.voices.length, 1);
    s.voices[0].finish();
    assert.equal(s.voices[0].disconnected, true);
    s.context.currentTime = .1;
    await s.audio.play('knob', true);
    assert.equal(s.voices.length, 2);
    assert.equal(s.context.decodes, 1);
    assert.notEqual(s.voices[0].startArgs[1], s.voices[1].startArgs[1], 'different recordings, not pitch shifts of one beep');
    s.audio.dispose();
});

test('roller frames share one continuous motor; stop and mute release it without restarting', async () => {
    const s = speaker(); s.audio.setEnabled(true);
    await s.audio.unlock();
    for (let i = 0; i < 120; i++) {
        s.context.currentTime = i / 120;
        await s.audio.setPaperFeed(true);
    }
    assert.equal(s.voices.length, 1, 'one loop, not 120 short retriggers');
    const motor = s.voices[0];
    assert.equal(motor.loop, true);
    assert.ok(motor.loopEnd > motor.loopStart);
    await s.audio.setPaperFeed(false);
    assert.equal(motor.stopped, true);
    assert.equal(motor.destination.value, 0);
    motor.finish();
    await s.audio.setPaperFeed(true);
    assert.equal(s.voices.length, 2);
    s.audio.setEnabled(false);
    assert.ok(s.voices.every(voice => voice.stopped));
    await s.audio.setPaperFeed(true);
    assert.equal(s.voices.length, 2);
    s.audio.setEnabled(true);
    assert.equal(s.voices.length, 2, 'enabling never starts an idle motor');
    s.audio.dispose();
});

test('muting during an asset download discards old cues and a cancelled motor start', async () => {
    const s = speaker();
    let resolve;
    const audio = new ConsoleAudio(() => s.context, () => new Promise(done => { resolve = done; }));
    audio.setEnabled(true);
    const key = audio.play('key', true), motor = audio.setPaperFeed(true);
    await Promise.resolve(); // The shared output is acquired before the bank download starts.
    audio.setEnabled(false);
    resolve(new ArrayBuffer(1));
    await Promise.all([key, motor]);
    assert.equal(s.voices.length, 0);
    audio.setEnabled(true);
    await audio.play('key', true);
    assert.equal(s.voices.length, 1);
    audio.dispose();
    const failed = new ConsoleAudio(() => s.context, () => Promise.reject(new Error('offline')));
    failed.setEnabled(true);
    await assert.doesNotReject(failed.play('key', true));
    failed.dispose();
});

test('disposal cancels playback/resume and unavailable audio never rejects game actions', async () => {
    const s = speaker('suspended'); s.audio.setEnabled(true);
    const pending = s.audio.play('key', true);
    s.audio.dispose(); s.context.unlock(); await pending;
    await s.audio.play('test', true);
    assert.equal(s.voices.length, 0);
    const blocked = new ConsoleAudio(() => { throw new Error('AudioContext unavailable'); });
    blocked.setEnabled(true);
    await assert.doesNotReject(blocked.play('test', true));
    blocked.dispose();
    const rejected = speaker('suspended'); rejected.audio.setEnabled(true);
    rejected.context.resume = () => Promise.reject(new Error('autoplay blocked'));
    await assert.doesNotReject(rejected.audio.play('test', true));
    assert.equal(rejected.voices.length, 0);
    rejected.audio.dispose();
});

test('shipped recordings fit the atlas, contain no clipping and have quiet cut boundaries', async () => {
    const wav = await readFile(new URL('../public/audio/console-foley-v3.wav', import.meta.url));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.readUInt16LE(22), 1);
    const rate = wav.readUInt32LE(24), count = wav.readUInt32LE(40) / 2;
    assert.ok(wav.length < 600 * 1024, 'one compact bank covers every cue');
    for (const [cue, spec] of Object.entries(soundBank)) for (const clip of spec.variants) {
        const offset = Math.round(clip.offset * rate), length = Math.round(clip.duration * rate);
        assert.ok(offset >= 0 && offset + length <= count, cue);
        assert.ok(clip.duration < 1, cue);
        if (cue === 'knob') assert.ok(clip.duration < .08, 'one contact, not a full scroll recording');
        const sample = i => wav.readInt16LE(44 + (offset + i) * 2) / 32768;
        let peak = 0;
        for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(sample(i)));
        assert.ok(peak > .1 && peak < .9, `${cue}: peak ${peak}`);
        if (cue !== 'paper-motor') {
            assert.ok(Math.abs(sample(0)) < .005 && Math.abs(sample(length - 1)) < .005, cue);
        } else assert.ok(Math.abs(sample(0) - sample(length - 1)) < .06, 'motor loop closes without a click');
    }
});

test('CRT reversal stops electrical tails but preserves the mechanical switch and other mechanisms', async () => {
    const s = speaker(); s.audio.setEnabled(true); await s.audio.unlock();
    await s.audio.play('power-off', true); await s.audio.setPaperFeed(true);
    await s.audio.crt({ type: 'begin' });
    await s.audio.crt({ type: 'play', cue: 'crt-collapse', gain: 1 });
    const collapse = s.voices.at(-1);
    await s.audio.crt({ type: 'begin' });
    assert.equal(collapse.stopped, true);
    assert.equal(collapse.destination.value, 0);
    assert.equal(s.voices[0].stopped, false);
    assert.equal(s.voices[1].stopped, false);
    await s.audio.crt({ type: 'play', cue: 'crt-warmup', gain: .4 });
    const warmup = s.voices.at(-1);
    assert.equal(warmup.destination.value, soundBank['crt-warmup'].gain * .4);
    await s.audio.crt({ type: 'end' });
    assert.equal(warmup.stopped, true);
    s.audio.dispose();
});

test('rear switch and hidden pages cancel the rest of a CRT transition without replay on enable', async () => {
    for (const gate of ['setEnabled', 'setVisible']) {
        const s = speaker(); s.audio.setEnabled(true); await s.audio.unlock();
        await s.audio.crt({ type: 'begin' });
        await s.audio.crt({ type: 'play', cue: 'crt-degauss', gain: 1 });
        s.audio[gate](false); s.audio[gate](true);
        await s.audio.crt({ type: 'play', cue: 'crt-warmup', gain: 1 });
        assert.equal(s.voices.length, 1);
        assert.equal(s.voices[0].stopped, true);
        await s.audio.crt({ type: 'begin' });
        await s.audio.crt({ type: 'play', cue: 'crt-collapse', gain: 1 });
        assert.equal(s.voices.length, 2);
        s.audio.dispose();
    }
});

test('CRT requests waiting for decode are invalidated by a reversal or picture settling', async () => {
    for (const type of ['begin', 'end']) {
        const s = speaker();
        let resolve;
        const audio = new ConsoleAudio(() => s.context, () => new Promise(done => { resolve = done; }));
        audio.setEnabled(true);
        const unlocking = audio.unlock();
        await audio.crt({ type: 'begin' });
        const pending = audio.crt({ type: 'play', cue: 'crt-degauss', gain: 1 });
        await audio.crt({ type });
        resolve(new ArrayBuffer(1));
        await Promise.all([unlocking, pending]);
        assert.equal(s.voices.length, 0);
        audio.dispose();
    }
});

const state = { connected: true, recovering: false, roomCode: '1234', phase: 'encrypting', round: 3,
    myRole: 'teammate', myTeam: 'A', waiting: false, submitted: false, deadline: 0 };
test('only fresh turns for the local actor and settled results notify', () => {
    for (const [phase, myRole] of [['encrypting', 'encryptor'], ['intercept', 'opponent'], ['decrypt', 'teammate']]) {
        const next = { ...state, phase, myRole, round: 4 };
        assert.equal(gameSound(state, next), 'turn');
        for (const patch of [{ myRole: 'observer' }, { waiting: true }, { submitted: true }, { deadline: 1 }])
            assert.equal(gameSound(state, { ...next, ...patch }), undefined);
    }
    assert.equal(gameSound(state, { ...state, phase: 'round_result' }), 'receive');
    assert.equal(gameSound(state, { ...state, phase: 'game_over', gameOver: { winner: 'A' } }), 'success');
    assert.equal(gameSound(state, { ...state, phase: 'game_over', gameOver: { winner: 'B' } }), 'error');
    assert.equal(gameSound(state, { ...state, phase: 'game_over', gameOver: { winner: null } }), 'receive');
    assert.equal(gameSound(state, { ...state, phase: 'game_over', myRole: 'observer', gameOver: { winner: 'A' } }), 'receive');
    const ended = { ...state, phase: 'game_over', gameOver: { winner: 'A' } };
    assert.equal(gameSound(ended, { ...ended, round: ended.round + 1 }), undefined, 'a corrected result snapshot cannot replay the legacy ending');
});

test('connection recovery, duplicate snapshots, new rooms and progress edits stay silent', () => {
    assert.equal(gameSound(state, { ...state, clues: ['editing'] }), undefined);
    const next = { ...state, phase: 'decrypt' };
    for (const patch of [{ connected: false }, { recovering: true }, { roomCode: '4321' }]) {
        assert.equal(gameSound({ ...state, ...patch }, next), undefined);
        assert.equal(gameSound(state, { ...next, ...patch }), undefined);
    }
});
