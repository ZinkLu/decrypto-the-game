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
  const saved = new Map();
  globalThis.sessionStorage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
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

  } finally {
    store?.getState().disconnect();
    globalThis.window = previousWindow;
    globalThis.WebSocket = previousWebSocket;
    globalThis.sessionStorage = previousStorage;
    await rm(dir, { recursive: true, force: true });
  }
});
