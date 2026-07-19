// End-to-end smoke test for the Decrypto server over the real WS protocol.
// Two scripted clients + one AI per team play until game_over.
//
// Usage: node webgl/scripts/smoke-e2e.mjs [ws://localhost:8080/ws]
//
// Strategy: humans always fail decrypt ([0,0,0]) so the game ends quickly;
// intercepts use a fixed guess to exercise the intercept phase (rounds 3+).

const url = process.argv[2] ?? 'ws://localhost:8080/ws';

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};

const stats = {
  rounds: new Set(),
  sawIntercept: false,
  results: 0,
};

function client(nickname) {
  const c = {
    nickname,
    ws: new WebSocket(url),
    roomCode: null,
    secretDigits: null,
    open: false,
  };
  c.ws.onopen = () => {
    c.open = true;
    log(`[${nickname}] connected`);
  };
  c.ws.onclose = () => {
    c.open = false;
  };
  c.ws.onerror = (e) => fail(`${nickname} ws error: ${e.message ?? e}`);
  c.ws.onmessage = (ev) => onMessage(c, JSON.parse(ev.data));
  c.send = (type, data) => c.ws.send(JSON.stringify({ type, data }));
  return c;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function onMessage(c, msg) {
  const d = msg.data ?? {};
  switch (msg.type) {
    case 'room_created':
      c.roomCode = d.room_code;
      log(`[${c.nickname}] room created: ${d.room_code}`);
      break;

    case 'room_state':
      log(
        `[${c.nickname}] room_state A=${(d.team_a ?? []).map((p) => p.nickname)} B=${(d.team_b ?? []).map((p) => p.nickname)} can_start=${d.can_start}`,
      );
      break;

    case 'game_start':
      log(`[${c.nickname}] game_start team=${d.your_team} role=${d.your_role} words=${d.words}`);
      break;

    case 'phase_change':
      await onPhase(c, d);
      break;

    case 'clues_submitted':
      log(`[${c.nickname}] clues: ${d.clues}`);
      break;

    case 'round_result':
      stats.results++;
      log(
        `[${c.nickname}] round_result intercept=${d.intercept_success} decrypt=${d.decrypt_success} A=${JSON.stringify(d.score_a)} B=${JSON.stringify(d.score_b)}`,
      );
      break;

    case 'game_over':
      log(`[${c.nickname}] GAME OVER winner=${d.winner}`);
      finish();
      break;

    case 'error':
      if (!/already submitted/.test(d.message ?? '')) {
        log(`[${c.nickname}] error: ${d.message}`);
      }
      break;
  }
}

async function onPhase(c, d) {
  stats.rounds.add(d.round);
  if (d.phase === 'new_round') return;
  if (d.phase === 'intercept') stats.sawIntercept = true;
  log(`[${c.nickname}] phase=${d.phase} round=${d.round} role=${d.your_role} waiting=${d.waiting ?? false}`);

  await sleep(300); // act like a human, not a race condition

  if (d.phase === 'encrypting' && d.your_role === 'encryptor') {
    c.secretDigits = d.secret_digits;
    log(`[${c.nickname}] encrypting digits=${d.secret_digits} -> submit clues`);
    c.send('submit_clues', { clues: ['红日', '长河', '孤岛'] });
  } else if (d.phase === 'intercept' && d.your_role === 'opponent') {
    log(`[${c.nickname}] intercepting -> fixed guess [1,2,3]`);
    c.send('submit_intercept', { guess: [1, 2, 3] });
  } else if (d.phase === 'decrypt' && d.your_role === 'teammate') {
    log(`[${c.nickname}] decrypting -> deliberate fail [0,0,0]`);
    c.send('submit_decrypt', { guess: [0, 0, 0] });
  }
}

function finish() {
  const rounds = [...stats.rounds].sort((a, b) => a - b);
  log(`summary: rounds=${rounds} interceptPhase=${stats.sawIntercept} results=${stats.results}`);
  if (rounds.length < 3) fail(`expected >=3 rounds, got ${rounds.length}`);
  if (!stats.sawIntercept) fail('never saw intercept phase');
  console.log('PASS: full game completed over the WS protocol');
  process.exit(0);
}

// ---- scenario ----
const p1 = client('脚本甲');
const p2 = client('脚本乙');

await sleep(400);
p1.send('create_room', { nickname: '脚本甲' });
await sleep(400);
if (!p1.roomCode) fail('no room code');
p2.send('join_room', { room_code: p1.roomCode, nickname: '脚本乙' });
await sleep(400);
p1.send('select_team', { team: 'A' });
p2.send('select_team', { team: 'B' });
await sleep(400);
p1.send('add_ai', { team: 'A' });
await sleep(300);
p1.send('add_ai', { team: 'B' });
await sleep(500);
p1.send('start_game', {});
log('game starting…');

setTimeout(() => fail('timeout: game did not finish in 150s'), 150_000);
