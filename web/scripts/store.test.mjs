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
  } finally {
    store?.getState().disconnect();
    globalThis.window = previousWindow;
    globalThis.WebSocket = previousWebSocket;
    await rm(dir, { recursive: true, force: true });
  }
});
