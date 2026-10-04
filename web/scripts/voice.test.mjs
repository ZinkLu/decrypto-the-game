import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { moduleUrl } from './load.mjs';
const { apart, speakingTo, audible, voiceStatus, voiceTurn, turnSelector, transmitting, selectorLabel, talkLabel, intercomLine, previewIntercom } = await import(await moduleUrl('voice'));
const { initialLocal: { intercom: idleIntercom } } = await import(await moduleUrl('model'));
const { reachable } = await import(await moduleUrl('actions'));
const { messages } = await import(await moduleUrl('i18n'));

const view = (phase, extra = {}) => ({ phase, role: 'teammate', team: 'A', encryptor: 'enc', ...extra });

test('teams talk apart while they guess, from the end of encryption until the reveal', () => {
  for (const phase of ['home', 'room', 'encrypting', 'round_result', 'game_over']) assert.equal(apart(view(phase)), false, phase);
  assert.equal(apart(view('guess')), true);
});

test('a voice goes to the table, to the team when whispering, and nowhere when it must keep quiet', () => {
  assert.equal(speakingTo(view('encrypting'), false), 'table');
  assert.equal(speakingTo(view('encrypting', { role: 'encryptor' }), false), 'table', 'the encryptor may chat while writing');
  assert.equal(speakingTo(view('room'), true), 'team');
  assert.equal(speakingTo(view('room', { team: '' }), true), 'table', 'a spectator has no team to whisper to');
  assert.equal(speakingTo(view('guess'), false), 'team', 'apart, the team talks among itself');
  assert.equal(speakingTo(view('guess', { role: 'opponent' }), true), 'team');
  assert.equal(speakingTo(view('guess', { role: 'encryptor' }), true), null, 'the encryptor keeps quiet');
  assert.equal(speakingTo(view('round_result', { role: 'encryptor' }), false), 'table', 'until the reveal');
  assert.equal(speakingTo(view('guess', { team: '' }), false), null);
});

test('the table goes quiet while teams are apart, and so does the encryptor', () => {
  assert.equal(audible(view('encrypting'), 'table', 'ann'), true);
  assert.equal(audible(view('encrypting'), 'team', 'enc'), true);
  assert.equal(audible(view('guess'), 'table', 'ann'), false);
  assert.equal(audible(view('guess'), 'team', 'ann'), true);
  assert.equal(audible(view('guess'), 'team', 'enc'), false, 'even a page that does not keep quiet is not heard');
  assert.equal(audible(view('round_result'), 'team', 'enc'), true);
});

test('the player is told when the table splits and comes back together', () => {
  assert.equal(voiceTurn(view('encrypting'), view('encrypting')), null);
  assert.equal(voiceTurn(view('encrypting'), view('guess')), '开始分组讨论：只听得到队友');
  assert.equal(voiceTurn(view('encrypting', { role: 'encryptor' }), view('guess', { role: 'encryptor' })), '开始分组讨论：加密者请保持安静');
  assert.equal(voiceTurn(view('encrypting', { team: '' }), view('guess', { team: '' })), '开始分组讨论：观战席暂时静音');
  assert.equal(voiceTurn(view('guess'), view('round_result')), '回到全桌通话');
});

test('every voice message has its English entry', async () => {
  const said = new Set();
  for (const phase of ['room', 'guess']) for (const role of ['teammate', 'encryptor']) for (const team of ['A', ''])
    for (const whisper of [false, true]) said.add(voiceStatus(view(phase, { role, team }), whisper));
  for (const role of ['teammate', 'encryptor']) for (const team of ['A', '']) {
    said.add(voiceTurn(view('encrypting', { role, team }), view('guess', { role, team })));
    said.add(voiceTurn(view('guess', { role, team }), view('round_result', { role, team })));
  }
  // Chinese literals of the controls and the controller are all shown through translate().
  for (const file of ['../src/console/VoiceBar.tsx', '../src/services/voice.ts']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    for (const [, text] of source.matchAll(/['"]([^'"\n]*[㐀-鿿][^'"\n]*)['"]/g)) said.add(text);
  }
  for (const text of said) assert.ok(messages[text], `no English for ${text}`);
});

test('silence on an outgoing track costs next to nothing', async () => {
  // The page side of the SFU imports types only, so it runs on its own.
  const source = await readFile(new URL('../src/services/cloudflareVoice.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  const { withDtx } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  const answer = ['v=0', 'm=audio 9 UDP/TLS/RTP/SAVPF 111 0', 'a=rtpmap:111 opus/48000/2', 'a=fmtp:111 minptime=10;useinbandfec=1',
    'a=rtpmap:0 PCMU/8000', 'a=fmtp:0 x=1', 'm=audio 9 UDP/TLS/RTP/SAVPF 111', 'a=rtpmap:111 opus/48000/2', 'a=fmtp:111 usedtx=0', ''].join('\r\n');
  const lines = withDtx(answer).split('\r\n');
  assert.equal(lines[3], 'a=fmtp:111 minptime=10;useinbandfec=1;usedtx=1');
  assert.equal(lines[5], 'a=fmtp:0 x=1', 'other codecs are left alone');
  assert.equal(lines[8], 'a=fmtp:111 usedtx=0', 'an explicit wish is kept');
  assert.equal(lines.length, answer.split('\r\n').length);
});

test('the selector clicks round its detents and the arrow keys stop at either end', () => {
  assert.equal(turnSelector('off', 'click'), 'all');
  assert.equal(turnSelector('all', 'click'), 'team');
  assert.equal(turnSelector('team', 'click'), 'off');
  assert.equal(turnSelector('team', 1), 'team');
  assert.equal(turnSelector('off', -1), 'off');
  assert.equal(turnSelector('all', -1), 'off');
});

test('the TALK jewel lights only while the voice goes out', () => {
  const on = { ...idleIntercom, available: true, line: 'on', selector: 'all', route: 'table', open: true };
  assert.equal(transmitting(on), true);
  assert.equal(transmitting({ ...on, open: false }), false, 'key up');
  assert.equal(transmitting({ ...on, route: null }), false, 'keeping quiet while teams are apart');
  assert.equal(transmitting({ ...on, line: 'connecting' }), false, 'not through yet');
  assert.deepEqual(intercomLine(on), ['对讲：{0} · {1}', ['全桌', '正在发言']]);
  assert.deepEqual(intercomLine({ ...on, route: 'team', open: false }), ['对讲：{0} · {1}', ['本队', '未发言']]);
  assert.deepEqual(intercomLine(idleIntercom), ['对讲：关', []]);
});

test('the intercom says what its controls do, in both languages', () => {
  const on = { ...idleIntercom, available: true, line: 'on', selector: 'team', route: 'team' };
  assert.deepEqual(selectorLabel(idleIntercom), ['对讲旋钮 · 服务器没有开启语音', []]);
  assert.deepEqual(selectorLabel(on), ['对讲旋钮：{0}', ['本队']]);
  const said = [talkLabel(idleIntercom), talkLabel(on), talkLabel({ ...on, open: true }), talkLabel({ ...on, mode: 'hold' }), talkLabel({ ...on, listenOnly: true }),
    ...['关', '全桌', '本队', '静音', '正在发言', '未发言', '对讲：正在接通', '对讲旋钮：{0}', '对讲：{0} · {1}']];
  for (const text of said) assert.ok(messages[text], `no English for ${text}`);
  for (const spec of ['all', 'team,talk', 'huddle', 'quiet', 'connecting', 'all,hold,talk']) {
    const deck = previewIntercom(spec);
    assert.ok(deck.available && deck.selector !== 'off', spec);
  }
  assert.equal(previewIntercom('huddle').route, 'team', 'the machine talks to the team whatever the selector says');
  assert.equal(previewIntercom('quiet').route, null);
  assert.equal(previewIntercom('connecting').line, 'connecting');
});

test('the intercom works without the network, but needs power and the front; a held key can always be let go', () => {
  const machine = { powered: true, online: false, rear: false, batteryOpen: false, pending: true, briefing: false };
  for (const id of ['voice-line', 'voice-line-next', 'voice-talk', 'voice-talk-down']) {
    assert.equal(reachable(id, machine), true, id);
    assert.equal(reachable(id, { ...machine, powered: false }), false, `${id} without power`);
    assert.equal(reachable(id, { ...machine, rear: true }), false, `${id} from behind`);
  }
  assert.equal(reachable('voice-talk-up', { ...machine, powered: false, rear: true }), true);
});
