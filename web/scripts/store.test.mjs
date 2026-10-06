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
    // Both teams guess at once: the other team may answer first, and the round is
    // revealed in one message once both have answered.
    socket.receive('phase_change', { phase: 'guess', round: 3, your_role: 'teammate',
      actions: { decrypt: { team: 'A', deadline: 0 }, intercept: { team: 'B', deadline: 0 } } });
    assert.deepEqual(store.getState().clues, ['one', 'two', 'three'], 'guessing players keep the public clues');
    assert.deepEqual(Object.keys(store.getState().actions).sort(), ['decrypt', 'intercept']);
    const draft = { round: 3, action: 'decrypt', player: 'Ann', state: 'editing', step: 2, focus: 2, total: 3 };
    socket.receive('player_progress', { ...draft, player_id: 'one', is_ai: false, guesses: [3, 0, 4] });
    socket.receive('player_progress', { ...draft, player_id: 'two', is_ai: false, guesses: [1, 0, 4] });
    assert.deepEqual(Object.keys(store.getState().teammateProgress), ['one', 'two'], 'same-name seats keep independent drafts');
    assert.deepEqual(store.getState().teammateProgress.one.guesses, [3, 0, 4]);
    assert.equal(store.getState().playerProgress.decrypt.player_id, 'two', 'watching screens retain the latest action signal');
    socket.receive('player_progress', { ...draft, round: 2, player_id: 'one', guesses: [2, 3, 4] });
    socket.receive('player_progress', { ...draft, action: 'encrypt', player_id: 'one', filled: [true, true, true] });
    assert.deepEqual(store.getState().teammateProgress.one.guesses, [3, 0, 4], 'old rounds and other phases cannot replace a draft');
    socket.receive('player_progress', { ...draft, player_id: 'ai', is_ai: true, suggestion: true, step: 3, focus: 0, guesses: [3, 1, 4] });
    assert.equal(store.getState().teammateProgress.ai.suggestion, true);
    assert.equal(store.getState().submitted, false, 'a complete recommendation never submits for humans');
    for (const [id, state, step, focus] of [['ai-one', 'thinking', 1, 2], ['ai-two', 'retrying', 0, 1],
      ['ai-three', 'ready', 3, 0], ['ai-four', 'unavailable', 0, 0]]) {
      socket.receive('player_progress', { ...draft, player_id: id, is_ai: true, suggestion: true, can_submit: false, state, step, focus });
    }
    assert.deepEqual(['ai-one', 'ai-two', 'ai-three', 'ai-four'].map(id => store.getState().teammateProgress[id].state),
      ['thinking', 'retrying', 'ready', 'unavailable'], 'parallel AI states never overwrite one another');
    assert.equal(store.getState().teammateProgress['ai-one'].focus, 2);
    assert.equal(store.getState().teammateProgress['ai-three'].can_submit, false);
    socket.receive('action_submitted', { round: 3, action: 'intercept', team: 'B' });
    assert.equal(store.getState().actions.intercept.submitted, true);
    assert.equal(store.getState().submitted, false, 'the other team answering leaves this seat its turn');
    socket.receive('action_submitted', { round: 2, action: 'decrypt', team: 'A' });
    assert.equal(store.getState().submitted, false, 'an answer from another round changes nothing');
    socket.receive('action_submitted', { round: 3, action: 'decrypt', team: 'A' });
    assert.equal(store.getState().submitted, true, 'a teammate answered for the team');
    assert.equal(store.getState().waiting, true);
    socket.receive('player_progress', { ...draft, player_id: 'one', guesses: [2, 3, 4] });
    assert.deepEqual(store.getState().teammateProgress.one.guesses, [3, 0, 4], 'a late edit cannot replace the accepted team state');
    socket.receive('player_progress', { ...draft, player_id: 'two', state: 'submitted', step: 3, focus: 0, guesses: [1, 3, 4] });
    assert.equal(store.getState().teammateProgress.two.state, 'submitted', 'final progress may follow the team submission message');
    socket.receive('round_result', { intercept_success: false, decrypt_success: true });
    assert.deepEqual(store.getState().roundResult, { intercept_success: false, decrypt_success: true });
    assert.deepEqual(store.getState().actions, {}, 'nothing is left to answer');
    assert.deepEqual(store.getState().teammateProgress, {}, 'revealing the round clears working drafts');
    socket.receive('player_progress', { ...draft, player_id: 'one', guesses: [2, 3, 4] });
    assert.deepEqual(store.getState().teammateProgress, {}, 'progress after the phase ends stays hidden');
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
    assert.deepEqual(store.getState().playerProgress.encrypt.filled, [true, false, true], 'received flags are booleans, three at most');
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
    recovered.receive('full_sync', { room:{room_code:'1234'},game:{phase:'encrypting',round:3,your_role:'encryptor',secret_digits:[2,4,1],deadline,submitted:true,
      encryptor_id: 'me', teammate_progress: {
        me: { round: 3, action: 'encrypt', player_id: 'me', player: 'Ann', state: 'editing', step: 2, focus: 2, filled: [true, false, true] },
        stale: { round: 2, action: 'encrypt', player_id: 'stale', player: 'Old', state: 'editing' },
        wrong: { round: 3, action: 'encrypt', player_id: 'different', player: 'Mismatch', state: 'editing' },
      }} });
    assert.equal(store.getState().recovering, false);
    assert.equal(store.getState().submitted, true);
    assert.equal(store.getState().deadline, deadline);
    assert.equal(store.getState().encryptorID, 'me');
    assert.deepEqual(Object.keys(store.getState().teammateProgress), ['me'], 'sync replaces drafts and rejects stale or mismatched identities');
    assert.deepEqual(store.getState().playerProgress.encrypt.filled, [true, false, true], 'reconnect also restores the watching signal');
    recovered.receive('phase_change', { phase: 'guess', round: 3, your_role: 'teammate',
      actions: { decrypt: { team: 'A', submitted: false } }, teammate_progress: {
        human: { ...draft, player_id: 'human', state: 'idle', step: 0, focus: 0, can_submit: true },
        ai: { ...draft, player_id: 'ai', state: 'thinking', step: 0, focus: 1, is_ai: true, suggestion: true, can_submit: false },
      } });
    assert.deepEqual(Object.keys(store.getState().teammateProgress), ['human', 'ai'], 'a phase starts with every seeded participant already visible');
    assert.equal(store.getState().teammateProgress.human.can_submit, true);
    assert.equal(store.getState().playerProgress.decrypt.player_id, 'ai', 'an active AI wins a snapshot tie with an idle human');
    recovered.receive('full_sync', { game: { phase: 'guess', round: 3, your_role: 'teammate', teammate_progress: {
      one: { ...draft, player_id: 'one', state: 'retrying', step: 1, focus: 2, is_ai: true, suggestion: true, can_submit: false },
      two: { ...draft, player_id: 'two', state: 'ready', step: 3, focus: 0, is_ai: true, suggestion: false, can_submit: true, guesses: [2, 4, 1] },
    } } });
    assert.deepEqual(Object.values(store.getState().teammateProgress).map(progress => [progress.state, progress.can_submit]),
      [['retrying', false], ['ready', true]], 'reconnect retains each AI status and designated submit authority');
    recovered.receive('full_sync', { game: { phase: 'guess', round: 3, your_role: 'teammate', submitted: true,
      actions: { decrypt: { team: 'A', submitted: true } }, teammate_progress: {
        accepted: { ...draft, player_id: 'accepted', state: 'submitted', step: 3, guesses: [2, 4, 1] },
        later: { ...draft, player_id: 'later', step: 3, guesses: [1, 2, 3], is_ai: true, suggestion: true },
      } } });
    assert.deepEqual(store.getState().playerProgress.decrypt.guesses, [2, 4, 1], 'accepted team answer wins over later-key advice on reconnect');
    recovered.receive('phase_change', { phase: 'guess', round: 3, your_role: 'teammate', submitted: true,
      actions: { decrypt: { team: 'A', submitted: true } }, teammate_progress: {
        accepted: { ...draft, player_id: 'accepted', state: 'submitted', step: 3, guesses: [2, 4, 1] },
      } });
    assert.deepEqual(store.getState().playerProgress.decrypt.guesses, [2, 4, 1], 'resuming the same phase keeps the accepted answer supplied by the server');
    assert.deepEqual(Object.keys(store.getState().teammateProgress), ['accepted'], 'phase changes replace drafts with the authoritative resumed snapshot');
    recovered.receive('full_sync', { game: { phase: 'encrypting', round: 3, your_role: 'encryptor', secret_digits: [2, 4, 1], deadline, submitted: true } });
    assert.deepEqual(store.getState().teammateProgress, {}, 'an empty phase snapshot replaces earlier drafts');
    live.receive('phase_change', {phase:'room'}); live.close();
    assert.equal(store.getState().phase, 'encrypting', 'stale sockets cannot replace recovered state');
    recovered.receive('ai_thinking', {action:'encrypt',player:'AI',step:3,completed:2,state:'thinking'});
    assert.equal(store.getState().aiStatus.encrypt.completed, 2);
    recovered.receive('ai_thinking', {action:'intercept',player:'AI · 2',step:1,completed:0,state:'thinking'});
    assert.equal(store.getState().aiStatus.encrypt.completed, 2, 'two AI players at once keep their own status');
    recovered.receive('ai_acted', {action:'encrypt',player:'AI',step:3,completed:3,state:'fallback',notice:'AI 未能完成回答'});
    recovered.receive('ai_thinking', {action:'encrypt',player:'AI',step:3,completed:2,state:'retrying',notice:'retry'});
    assert.equal(store.getState().aiNotice, 'AI 未能完成回答');
    store.getState().disconnect(); store.getState().connect();
    const refreshed = sockets.at(-1); refreshed.onopen();
    assert.equal(refreshed.sent.at(-1).type, 'resume_room', 'a reload restores the per-tab credential');
    refreshed.receive('full_sync', {game:{phase:'game_over',round:3,history:[{round:3,secret:[2,4,1]}],game_over:{winner:'B'}}});
    assert.equal(store.getState().gameOver.winner, 'B'); assert.equal(store.getState().history.length, 1);
    assert.deepEqual(store.getState().teammateProgress, {}, 'a fresh sync cannot keep progress from a former phase');
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
    assert.equal(store.getState().timeouts.at(-1).outcome, 'draft');
    send('timeout', { round: 1, action: 'decrypt', team: 'A', outcome: 'none' });
    assert.deepEqual(store.getState().timeouts.map(timeout => timeout.action), ['encrypt', 'decrypt'], 'each timed-out action keeps its notice');
    send('phase_change', { phase: 'new_round', round: 2, your_role: 'opponent' });
    assert.deepEqual(store.getState().timeouts, [], 'a timeout notice ends with its round');
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
    scoring.receive('full_sync', { game: { phase: 'guess', round: 4, score_a: startingA, score_b: startingB } });
    assert.equal(store.getState().scoreChange, null, 'loading already scored flags is silent');
    scoring.receive('round_result', { intercept_success: false, decrypt_success: true, score_a: startingA, score_b: startingB });
    assert.equal(store.getState().scoreChange, null, 'an ordinary result without a score increase has no pulse');

    scoring.receive('phase_change', { phase: 'new_round', round: 5, your_role: 'teammate' });
    scoring.receive('phase_change', { phase: 'guess', round: 5, your_role: 'teammate' });
    // One reveal can score both registers: team B intercepts while team A decodes wrongly.
    const both = { intercept_success: true, decrypt_success: false,
      score_a: { ...startingA, decrypt_failures: 2 }, score_b: { ...startingB, interceptions: 2 } };
    const scoredAt = Date.now();
    scoring.receive('round_result', both);
    const score = store.getState().scoreChange;
    assert.equal(score.round, 5);
    assert.ok(score.at >= scoredAt && score.at <= Date.now(), 'the pulse is dated when the live result arrives');
    assert.deepEqual(score.changes, [{ team: 'A', kind: 'failure', total: 2 }, { team: 'B', kind: 'intercept', total: 2 }]);
    assert.deepEqual(store.getState().roundResult, { intercept_success: true, decrypt_success: false });
    scoring.receive('round_result', both);
    assert.equal(store.getState().scoreChange, score, 'a repeated result cannot retrigger the pulse');
    scoring.receive('round_result', { ...both, history: [{ round: 5, team: 'A', secret: [2, 4, 1] }] });
    assert.equal(store.getState().scoreChange, score, 'completing the public history does not replay a score');
    scoring.receive('game_over', { winner: 'B', reason: 'interceptions', score_a: both.score_a, score_b: both.score_b });
    assert.equal(store.getState().scoreChange, score, 'an immediate terminal packet preserves the final pulse');
    assert.deepEqual(store.getState().roundResult, { intercept_success: true, decrypt_success: false }, 'the ending retains both final judgements');

    const finalSnapshot = { game: { phase: 'game_over', round: 5, score_a: both.score_a, score_b: both.score_b,
      round_result: { intercept_success: true, decrypt_success: false }, game_over: { winner: 'B' } } };
    scoring.receive('full_sync', finalSnapshot);
    assert.equal(store.getState().scoreChange, null, 'a full sync clears the transient event even when its scores match');
    scoring.receive('round_result', both);
    assert.equal(store.getState().scoreChange, null, 'a repeated result after a snapshot does not manufacture a new pulse');

    scoring.receive('full_sync', { game: { phase: 'guess', round: 5, score_a: startingA, score_b: startingB,
      actions: { decrypt: { team: 'A', deadline: 0 }, intercept: { team: 'B', deadline: 0, submitted: true } } } });
    assert.equal(store.getState().actions.intercept.submitted, true, 'a resumed seat sees who has answered');
    scoring.receive('round_result', both);
    assert.ok(store.getState().scoreChange);
    scoring.close();
    assert.equal(store.getState().scoreChange, null, 'losing the link clears the live event before recovery');
    store.getState().wsService.connect();
    const resumedScore = sockets.at(-1); resumedScore.onopen();
    assert.equal(store.getState().recovering, true);
    resumedScore.receive('round_result', both);
    assert.equal(store.getState().scoreChange, null, 'score packets arriving before recovery completes remain silent');
    resumedScore.receive('full_sync', finalSnapshot);
    assert.equal(store.getState().scoreChange, null, 'reconnecting to an ending restores scores without a pulse');

    // A shared invitation selects a room without accidentally resuming another
    // room's seat. A matching invitation and an ordinary reload retain it.
    store.getState().disconnect(); store.getState().connect('1357');
    const invited = sockets.at(-1); invited.onopen();
    assert.deepEqual(invited.sent, [], 'an invitation to another room sends no resume request');
    assert.equal(store.getState().phase, 'home');
    assert.equal(store.getState().roomCode, null);
    assert.equal(store.getState().resumeToken, '');
    assert.equal(saved.size, 0, 'the previous room credential is cleared before joining the invitation');
    store.getState().joinRoom('1357', 'Ann');
    assert.equal(invited.sent.at(-1).type, 'join_room');
    assert.equal(invited.sent.at(-1).data.room_code, '1357');
    invited.receive('room_created', { room_code: '1357', my_player_id: 'invited-me', resume_token: 'invite-token' });
    const invitationSession = saved.get('decrypto-session-v1');
    const socketCount = sockets.length;
    store.getState().connect('9999');
    assert.equal(sockets.length, socketCount, 'connecting again cannot replace an active connection');
    assert.equal(store.getState().roomCode, '1357', 'an idempotent connect keeps the active room');
    assert.equal(saved.get('decrypto-session-v1'), invitationSession, 'an idempotent connect cannot clear the active credential');

    store.getState().disconnect(); store.getState().connect('1357');
    const matchingInvite = sockets.at(-1); matchingInvite.onopen();
    assert.deepEqual(matchingInvite.sent, [{ type: 'resume_room', data: { room_code: '1357', resume_token: 'invite-token' } }],
      'an invitation to the saved room restores the original seat');
    assert.equal(store.getState().recovering, true);
    assert.equal(saved.get('decrypto-session-v1'), invitationSession);

    store.getState().disconnect(); store.getState().connect();
    const normalVisit = sockets.at(-1); normalVisit.onopen();
    assert.deepEqual(normalVisit.sent, [{ type: 'resume_room', data: { room_code: '1357', resume_token: 'invite-token' } }],
      'a visit without an invitation continues to restore the saved seat');

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
