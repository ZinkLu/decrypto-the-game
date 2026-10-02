import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './load.mjs';

const { resultSummary, resultView, handoverLine, briefingKey, previewState } = await import(await moduleUrl('model'));
const { translate } = await import(await moduleUrl('i18n'));
const labels = state => resultSummary(state).map(row => translate('zh', ...row.label));

test('a correct decode keeps the rival interception, with its meaning for both teams', () => {
    const sender = previewState({}, 'round-scored');
    assert.deepEqual(labels(sender), ['B 队截获成功 · 截获 +1', 'A 队解码成功 · 失误不变']);
    assert.deepEqual(resultSummary(sender).map(row => row.scoring), [true, false]);
    assert.equal(resultView(sender).tone, 'bad');
    assert.deepEqual(resultView(sender).title, ['本轮回执', []]);
    assert.deepEqual(resultView(sender).sub, ['{0} 队截获 +1', ['B']]);
    assert.equal(resultView({ ...sender, myTeam: 'B', myRole: 'opponent' }).tone, 'good');
    assert.equal(resultView({ ...sender, myTeam: '', myRole: 'observer' }).tone, 'neutral');
});

test('interception and decode errors both appear when the same round changes both registers', () => {
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

test('nothing is judged while both teams still guess, even after one of them answered', () => {
    for (const name of ['watch-guess', 'decrypt-sent']) {
        const state = previewState({}, name);
        assert.ok(!state.history.some(row => row.round === state.round));
        assert.deepEqual(resultSummary(state), [], name);
        assert.deepEqual(resultView(state), { title: ['本轮回执', []], sub: null, tone: 'neutral' }, name);
    }
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
    assert.deepEqual(handoverLine(previewState({}, 'decrypt')), ['{0} 队解码，{1} 队同时拦截', ['A', 'B']]);
    assert.deepEqual(handoverLine(previewState({}, 'decrypt-sent')), ['{0} 队已提交 · 等 {1} 队拦截后揭晓', ['A', 'B']]);
    const intercepted = previewState({}, 'intercept');
    assert.deepEqual(handoverLine({ ...intercepted, actions: { ...intercepted.actions, intercept: { ...intercepted.actions.intercept, submitted: true } } }),
        ['{0} 队已提交 · 等 {1} 队解码后揭晓', ['A', 'B']]);
    assert.equal(handoverLine(previewState({}, 'encrypting')), null);
});

test('all result and handover copy has an English translation', () => {
    for (const name of ['round-scored', 'round-failure', 'game-over-failure', 'round_result', 'game_over', 'intercept', 'decrypt', 'decrypt-sent', 'watch-guess']) {
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
