import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Exercise the real client/store with wire messages; no server or model API required.
test('multiplayer protocol state survives incremental messages and disconnects cleanly', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'decrypto-store-'));
  const require = createRequire(import.meta.url);
  const previousWindow = globalThis.window;
  const previousWebSocket = globalThis.WebSocket;
  const previousStorage = globalThis.sessionStorage;
  const previousLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const saved = new Map();
  globalThis.sessionStorage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
  const kept = new Map();
  let storageBlocked = false;
  const unlessBlocked = action => (...args) => { if (storageBlocked) throw new Error('storage is blocked'); return action(...args); };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true,
    value: { getItem: unlessBlocked(key => kept.get(key) ?? null), setItem: unlessBlocked((key, value) => kept.set(key, value)) } });
  const sockets = [];
  class FakeSocket {
    static OPEN = 1;
    readyState = 1;
    sent = [];
    constructor() { sockets.push(this); }
    send(message) { this.sent.push(JSON.parse(message)); }
    close() { this.onclose?.(); }
    receive(type, data) { this.onmessage?.({ data: JSON.stringify({ type, data }) }); }
  }
  globalThis.window = { location: { protocol: 'http:', host: 'localhost' } };
  globalThis.WebSocket = FakeSocket;
  let store;
  try {
    const service = await readFile(new URL('../src/services/websocket.ts', import.meta.url), 'utf8');
    const servicePath = join(dir, 'websocket.mjs');
    await writeFile(servicePath, ts.transpileModule(service, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
    let source = await readFile(new URL('../src/store/gameStore.ts', import.meta.url), 'utf8');
    source = source.replace(/(['"])zustand\1/, JSON.stringify(pathToFileURL(require.resolve('zustand')).href)).replace(/(['"])@\/services\/websocket\1/, JSON.stringify(pathToFileURL(servicePath).href));
    const storePath = join(dir, 'store.mjs');
    await writeFile(storePath, ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
    store = (await import(pathToFileURL(storePath).href)).useGameStore;
    store.getState().connect(); store.getState().connect();
    assert.equal(sockets.length, 1, 'connect is idempotent');
    const socket = sockets[0]; socket.onopen();
    store.getState().createRoom('Ann');
    const device = socket.sent.at(-1).data.device_token;
    assert.match(device, /^[0-9a-f]{64}$/, 'the browser names itself with a random token');
    assert.deepEqual(socket.sent.at(-1), { type: 'create_room', data: { nickname: 'Ann', device_token: device } });
    assert.equal(kept.get('decrypto-device-v1'), device, 'and keeps it beyond this tab');
    store.getState().joinRoom('1234', 'Ann');
    assert.deepEqual(socket.sent.at(-1), { type: 'join_room', data: { room_code: '1234', nickname: 'Ann', device_token: device } }, 'every room sees the same token');
    kept.set('decrypto-device-v1', 'edited by hand');
    store.getState().createRoom('Ann');
    assert.match(socket.sent.at(-1).data.device_token, /^[0-9a-f]{64}$/, 'a damaged token is replaced');
    assert.notEqual(socket.sent.at(-1).data.device_token, device);
    storageBlocked = true;
    store.getState().createRoom('Ann');
    assert.equal(socket.sent.at(-1).data.device_token, '', 'a browser without storage stays unnamed');
    storageBlocked = false;
    socket.receive('room_created', { room_code: 'A1B2', my_player_id: 'me' });
    assert.equal(store.getState().phase, 'room');
    socket.receive('phase_change', { phase: 'encrypting', round: 3, your_role: 'encryptor', secret_digits: [2, 4, 1] });
    socket.receive('clues_submitted', { clues: ['one', 'two', 'three'], history: [{ round: 1, team: 'A', clues: ['a', 'b', 'c'] }] });
    socket.receive('phase_change', { phase: 'intercept', round: 3, your_role: 'teammate', waiting: true });
    assert.deepEqual(store.getState().clues, ['one', 'two', 'three'], 'waiting players retain public clues');
    socket.receive('round_result', { intercept_success: false });
    socket.receive('phase_change', { phase: 'decrypt', round: 3, your_role: 'teammate' });
    socket.receive('round_result', { decrypt_success: true });
    assert.deepEqual(store.getState().roundResult, { intercept_success: false, decrypt_success: true });
    socket.receive('phase_change', { phase: 'new_round', round: 4, your_role: 'opponent' });
    assert.equal(store.getState().phase, 'encrypting');
    assert.equal(store.getState().roundResult, null);
    assert.deepEqual(store.getState().clues, [], 'new rounds never show previous-round clues while waiting');
    socket.receive('full_sync', { game: { phase: 'done', round: 4 } });
    assert.equal(store.getState().phase, 'round_result', 'internal done maps to the console result surface');
    socket.receive('full_sync', { game: { phase: 'init', round: 5 } });
    assert.equal(store.getState().phase, 'encrypting', 'internal init maps to encryption');
    socket.receive('error', { message: 'room not found' });
    assert.match(store.getState().error, /没有找到/);
    store.getState().clearError();
    socket.receive('game_over', { winner: 'A' });
    assert.equal(store.getState().phase, 'game_over');
    socket.close();
    assert.equal(store.getState().phase, 'home');
    assert.equal(store.getState().roomCode, null);
    assert.equal(store.getState().connected, false);
    assert.match(store.getState().error, /连接已中断/);
    store.getState().reset(); store.getState().connect();
    const live = sockets.at(-1); live.onopen();
    live.receive('room_created', { room_code: '1234', my_player_id: 'me', resume_token: 'test-token' });
    const deadline = Date.now() + 50000;
    live.receive('phase_change', { phase: 'encrypting', round: 3, your_role: 'encryptor', secret_digits: [2, 4, 1], deadline });
    store.getState().sendProgress('encrypt', 2, { state: 'editing', focus: 2, filled: [true, false, true] });
    assert.deepEqual(live.sent.at(-1).data, { round: 3, action: 'encrypt', step: 2, total: 3, state: 'editing', focus: 2, filled: [true, false, true] },
      'drafting reports which lines hold a clue, never the clue');
    live.receive('player_progress', { action: 'encrypt', player: 'Ann', state: 'editing', step: 2, focus: 2, filled: [true, 0, 'yes', true], total: 3 });
    assert.deepEqual(store.getState().playerProgress.filled, [true, false, true], 'received flags are booleans, three at most');
    store.getState().submitClues(['a', 'b', 'c']);
    assert.equal(live.sent.at(-1).data.round, 3, 'outbound actions identify their round');
    live.receive('room_state', { started: true, team_a: [{id:'me'}] });
    assert.equal(store.getState().phase, 'encrypting', 'presence updates do not return active games to lobby');
    live.close();
    assert.equal(store.getState().recovering, true);
    assert.equal(store.getState().phase, 'encrypting');
    store.getState().wsService.connect();
    const recovered = sockets.at(-1); recovered.onopen();
    assert.deepEqual(recovered.sent.at(-1), { type:'resume_room', data: {room_code:'1234',resume_token:'test-token'} });
    recovered.receive('room_resumed', {room_code:'1234',my_player_id:'me'});
    recovered.receive('full_sync', { room:{room_code:'1234'},game:{phase:'encrypting',round:3,your_role:'encryptor',secret_digits:[2,4,1],deadline,submitted:true} });
    assert.equal(store.getState().recovering, false);
    assert.equal(store.getState().submitted, true);
    assert.equal(store.getState().deadline, deadline);
    live.receive('phase_change', {phase:'room'}); live.close();
    assert.equal(store.getState().phase, 'encrypting', 'stale sockets cannot replace recovered state');
    recovered.receive('ai_thinking', {action:'encrypt',player:'AI',step:3,completed:2,state:'thinking'});
    assert.equal(store.getState().aiStatus.completed, 2);
    recovered.receive('ai_acted', {action:'encrypt',player:'AI',step:3,completed:3,state:'fallback',notice:'AI 未能完成回答'});
    recovered.receive('ai_thinking', {action:'encrypt',player:'AI',step:3,completed:2,state:'retrying',notice:'retry'});
    assert.equal(store.getState().aiNotice, 'AI 未能完成回答');
    store.getState().disconnect(); store.getState().connect();
    const refreshed = sockets.at(-1); refreshed.onopen();
    assert.equal(refreshed.sent.at(-1).type, 'resume_room', 'a reload restores the per-tab credential');
    refreshed.receive('full_sync', {game:{phase:'game_over',round:3,history:[{round:3,secret:[2,4,1]}],game_over:{winner:'B'}}});
    assert.equal(store.getState().gameOver.winner, 'B'); assert.equal(store.getState().history.length, 1);
    refreshed.receive('error', {code:'resume_expired',message:'room resume expired; please create or join a room'});
    assert.equal(store.getState().phase, 'home'); assert.equal(saved.size, 0);

    // Deadlines follow the server clock, whatever this device's clock says.
    store.getState().reset(); store.getState().connect();
    const clock = sockets.at(-1); clock.onopen();
    const skew = 120000; // this device runs two minutes behind the server
    const send = (type, data) => clock.onmessage?.({ data: JSON.stringify({ type, data, server_time: Date.now() + skew }) });
    send('room_created', { room_code: '5555', my_player_id: 'me' });
    send('phase_change', { phase: 'encrypting', round: 1, your_role: 'encryptor', deadline: Date.now() + skew + 60000 });
    const left = store.getState().deadline - Date.now();
    assert.ok(left > 59000 && left <= 60500, `deadline converted to the local clock: ${left} ms left`);
    store.getState().sendProgress('encrypt', 1, { state: 'editing', focus: 2, filled: [true, false, false], clues: ['harbor', '', ''] });
    assert.deepEqual(clock.sent.at(-1).data.clues, ['harbor', '', ''], 'the draft goes to the server for a timeout');
    send('timeout', { round: 1, action: 'encrypt', team: 'A', player: 'me', outcome: 'draft' });
    assert.equal(store.getState().timeout.outcome, 'draft');
    send('phase_change', { phase: 'new_round', round: 2, your_role: 'opponent' });
    assert.equal(store.getState().timeout, null, 'a timeout notice ends with its round');
    send('game_over', { winner: 'A', reason: 'interceptions', words_a: ['a', 'b', 'c', 'd'], words_b: ['e', 'f', 'g', 'h'] });
    assert.deepEqual(store.getState().gameOver.wordsB, ['e', 'f', 'g', 'h']);
    send('room_state', { started: false, room_code: '5555', team_a: [{ id: 'me', nickname: 'me' }] });
    assert.equal(store.getState().phase, 'game_over', 'another player reopening the room does not close this final screen');
    store.getState().returnToRoom();
    assert.equal(clock.sent.at(-1).type, 'reopen_room');
    send('room_state', { started: false, room_code: '5555', team_a: [{ id: 'me', nickname: 'me' }] });
    assert.equal(store.getState().phase, 'room');
    assert.equal(store.getState().gameOver, null);
    assert.equal(store.getState().history.length, 0, 'the reopened room starts a fresh game');

    // Only live score changes earn a pulse; snapshots merely restore the machine.
    store.getState().reset(); store.getState().connect();
    const scoring = sockets.at(-1); scoring.onopen();
    scoring.receive('room_created', { room_code: '2468', my_player_id: 'me', resume_token: 'score-session' });
    const startingA = { interceptions: 0, decrypt_failures: 1 };
    const startingB = { interceptions: 1, decrypt_failures: 0 };
    scoring.receive('full_sync', { game: { phase: 'intercept', round: 4, score_a: startingA, score_b: startingB } });
    assert.equal(store.getState().scoreChange, null, 'loading already scored flags is silent');
    scoring.receive('round_result', { intercept_success: false, decrypt_success: true, score_a: startingA, score_b: startingB });
    assert.equal(store.getState().scoreChange, null, 'an ordinary result without a score increase has no pulse');

    scoring.receive('phase_change', { phase: 'new_round', round: 5, your_role: 'teammate' });
    scoring.receive('phase_change', { phase: 'intercept', round: 5, your_role: 'teammate', waiting: true });
    const interception = { intercept_success: true, score_a: startingA, score_b: { ...startingB, interceptions: 2 } };
    const scoredAt = Date.now();
    scoring.receive('round_result', interception);
    const firstScore = store.getState().scoreChange;
    assert.equal(firstScore.round, 5);
    assert.ok(firstScore.at >= scoredAt && firstScore.at <= Date.now(), 'the pulse is dated when the live result arrives');
    assert.deepEqual(firstScore.changes, [{ team: 'B', kind: 'intercept', total: 2 }]);
    scoring.receive('round_result', interception);
    assert.equal(store.getState().scoreChange, firstScore, 'a repeated result cannot retrigger the pulse');

    scoring.receive('phase_change', { phase: 'decrypt', round: 5, your_role: 'teammate' });
    assert.equal(store.getState().scoreChange, firstScore, 'the handover retains the current pulse');
    const failure = { decrypt_success: false, score_a: { ...startingA, decrypt_failures: 2 }, score_b: interception.score_b };
    scoring.receive('round_result', failure);
    const secondScore = store.getState().scoreChange;
    assert.ok(secondScore.id > firstScore.id, 'the second scored action in the same round has its own pulse');
    assert.equal(secondScore.round, 5);
    assert.deepEqual(secondScore.changes, [{ team: 'A', kind: 'failure', total: 2 }]);
    assert.deepEqual(store.getState().roundResult, { intercept_success: true, decrypt_success: false });
    scoring.receive('round_result', { ...failure, history: [{ round: 5, team: 'A', secret: [2, 4, 1] }] });
    assert.equal(store.getState().scoreChange, secondScore, 'completing the public history does not replay a score');
    scoring.receive('game_over', { winner: 'B', reason: 'interceptions', score_a: failure.score_a, score_b: failure.score_b });
    assert.equal(store.getState().scoreChange, secondScore, 'an immediate terminal packet preserves the final pulse');
    assert.deepEqual(store.getState().roundResult, { intercept_success: true, decrypt_success: false }, 'the ending retains both final judgements');

    const finalSnapshot = { game: { phase: 'game_over', round: 5, score_a: failure.score_a, score_b: failure.score_b,
      round_result: { intercept_success: true, decrypt_success: false }, game_over: { winner: 'B' } } };
    scoring.receive('full_sync', finalSnapshot);
    assert.equal(store.getState().scoreChange, null, 'a full sync clears the transient event even when its scores match');
    scoring.receive('round_result', { ...interception, ...failure });
    assert.equal(store.getState().scoreChange, null, 'a repeated result after a snapshot does not manufacture a new pulse');

    scoring.receive('full_sync', { game: { phase: 'intercept', round: 5, score_a: startingA, score_b: startingB } });
    scoring.receive('round_result', interception);
    assert.ok(store.getState().scoreChange);
    scoring.close();
    assert.equal(store.getState().scoreChange, null, 'losing the link clears the live event before recovery');
    store.getState().wsService.connect();
    const resumedScore = sockets.at(-1); resumedScore.onopen();
    assert.equal(store.getState().recovering, true);
    resumedScore.receive('round_result', failure);
    assert.equal(store.getState().scoreChange, null, 'score packets arriving before recovery completes remain silent');
    resumedScore.receive('full_sync', finalSnapshot);
    assert.equal(store.getState().scoreChange, null, 'reconnecting to an ending restores scores without a pulse');

  } finally {
    store?.getState().disconnect();
    globalThis.window = previousWindow;
    globalThis.WebSocket = previousWebSocket;
    globalThis.sessionStorage = previousStorage;
    if (previousLocal) Object.defineProperty(globalThis, 'localStorage', previousLocal);
    else delete globalThis.localStorage;
    await rm(dir, { recursive: true, force: true });
  }
});
