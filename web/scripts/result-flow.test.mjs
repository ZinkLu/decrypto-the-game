import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './load.mjs';

const { resultSummary, resultView, handoverLine, briefingKey, previewState } = await import(await moduleUrl('model'));
const { translate } = await import(await moduleUrl('i18n'));
const labels = state => resultSummary(state).map(row => translate('zh', ...row.label));

test('an interception ends the round without a decode, with its meaning for both teams', () => {
    const sender = previewState({}, 'round-scored');
    assert.deepEqual(labels(sender), ['B 队截获成功 · 截获 +1', 'A 队被截获 · 本轮不解码']);
    assert.deepEqual(resultSummary(sender).map(row => row.scoring), [true, false]);
    assert.equal(resultView(sender).tone, 'bad');
    assert.deepEqual(resultView(sender).title, ['本轮回执', []]);
    assert.deepEqual(resultView(sender).sub, ['{0} 队截获 +1', ['B']]);
    assert.equal(resultView({ ...sender, myTeam: 'B', myRole: 'opponent' }).tone, 'good');
    assert.equal(resultView({ ...sender, myTeam: '', myRole: 'observer' }).tone, 'neutral');
});

test('a round stored under the earlier rule, intercepted and then decoded wrongly, still shows both', () => {
    const state = previewState({}, 'round-scored');
    state.roundResult = { intercept_success: true, decrypt_success: false };
    state.history = state.history.map(row => row.round === state.round ? { ...row, decrypt: [0, 0, 0], timeouts: ['decrypt'] } : row);
    assert.deepEqual(labels(state), ['B 队截获成功 · 截获 +1', 'A 队解码失误 · 失误 +1']);
    assert.deepEqual(resultSummary(state).map(row => row.scoring), [true, true]);
    assert.deepEqual(resultView(state).sub, ['{0} 队截获 +1 · {1} 队失误 +1', ['B', 'A']]);
    assert.equal(resultView(state).tone, 'bad');
});

test('unsuccessful interception and successful decode are neutral when no register changes', () => {
    const state = previewState({}, 'round_result');
    assert.deepEqual(resultSummary(state).map(row => [row.scoring, row.tone]), [[false, 'neutral'], [false, 'neutral']]);
    assert.equal(resultView(state).tone, 'neutral');
    assert.deepEqual(resultView(state).sub, ['本轮没有新增截获或失误', []]);
});

test('an interim interception never invents a decode from the encryptor private code', () => {
    const state = previewState({}, 'intercept-hit');
    assert.equal(resultSummary(state).length, 1);
    assert.deepEqual(resultView(state).title, ['{0} 队截获成功', ['B']]);
    assert.deepEqual(resultView(state).sub, ['{0} 队截获 {1} / 2 · 本轮不再解码', ['B', 1]]);
    assert.ok(!state.history.some(row => row.round === state.round));
    assert.equal(resultSummary({ ...state, roundResult: null }).length, 0);
});

test('a restored final screen reconstructs the deciding error only from this round public history', () => {
    const state = previewState({}, 'game-over-failure');
    assert.equal(state.roundResult, null);
    assert.deepEqual(labels(state), ['B 队拦截未成功 · 截获不变', 'A 队解码失误 · 失误 +1']);
    assert.equal(resultView(state).tone, 'bad');
    assert.equal(resultSummary({ ...state, history: state.history.filter(row => row.round !== state.round) }).length, 0);
    assert.equal(resultSummary({ ...state, history: state.history.map(row => ({ ...row, secret: undefined })) }).length, 0);
});

test('early-round receipts show interception was skipped and handovers do not block input', () => {
    const state = previewState({}, 'round_result');
    state.round = 2;
    state.roundResult = { decrypt_success: true };
    assert.deepEqual(labels(state), ['前两次发报不拦截', 'B 队解码成功 · 失误不变']);
    for (const phase of ['intercept', 'decrypt']) {
        const working = { ...previewState({}, phase), roundResult: { intercept_success: true } };
        assert.equal(briefingKey(working), '');
        assert.ok(handoverLine(working));
    }
    assert.deepEqual(handoverLine({ ...previewState({}, 'decrypt'), round: 2 }), ['前两次发报不拦截 · 轮到 {0} 队解码', ['A']]);
    assert.equal(handoverLine(previewState({}, 'encrypting')), null);
});

test('all result and handover copy has an English translation', () => {
    for (const name of ['intercept-hit', 'round-scored', 'round-failure', 'game-over-failure', 'round_result', 'game_over', 'intercept', 'decrypt']) {
        const state = previewState({}, name);
        const view = resultView(state);
        const lines = [view.title, view.sub, handoverLine(state), ...resultSummary(state).map(row => row.label)].filter(Boolean);
        for (const line of lines) assert.ok(!/[\u3400-\u9fff]/.test(translate('en', ...line)), `${name}: ${line[0]}`);
    }
});

test('the long receipt preview exercises the full accepted clue length in either locale', () => {
    for (const locale of ['zh', 'en']) {
        const state = previewState({}, 'round-long', locale);
        assert.deepEqual(state.clues.map(clue => [...clue].length), [80, 80, 80]);
        assert.deepEqual(state.history.find(row => row.round === state.round).clues, state.clues);
    }
});
