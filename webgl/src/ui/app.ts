// App shell: routes GameState -> views inside the room's main screen, owns
// the persistent archive panel in the side screen, renders the minimal HUD,
// and drives the three.js stage (moods, pulses, activity, codebook, score,
// VU countdown).

import type { GameState, Phase, Store } from '../store';
import type { Mood, StageAPI } from '../scene';
import {
  DecryptInputView,
  DecryptStandbyView,
  DecryptWatchView,
  EncryptView,
  GameOverView,
  HomeView,
  InterceptInputView,
  InterceptWatchView,
  LobbyView,
  ResultView,
  View,
  WaitCluesView,
} from './views';
import { CountdownRing, HistoryPanel, Toasts, el, scorePips } from './widgets';

const PHASE_ACTION: Partial<Record<Phase, string>> = {
  encrypting: 'encrypt',
  intercept: 'intercept',
  decrypt: 'decrypt',
};

const ACTION_LABEL: Record<string, string> = {
  encrypt: '编制密电',
  intercept: '拦截破译',
  decrypt: '解密核对',
};

const PHASE_LABEL: Partial<Record<Phase, string>> = {
  encrypting: '加密中',
  intercept: '拦截窗口',
  decrypt: '解密窗口',
  round_result: '回合结算',
  game_over: '行动结束',
};

const MOOD_BY_PHASE: Record<Phase, Mood> = {
  home: 'idle',
  room: 'lobby',
  encrypting: 'encrypt',
  intercept: 'intercept',
  decrypt: 'decrypt',
  round_result: 'result',
  game_over: 'result',
};

export class App {
  private hud: HTMLElement;
  private hudLeft: HTMLElement;
  private hudRight: HTMLElement;
  private chrome: HTMLElement;
  private chromeRight: HTMLElement;
  private screenMain: HTMLElement;
  private screenSide: HTMLElement;
  private viewRoot: HTMLElement;
  private strip: HTMLElement;
  private toasts = new Toasts();
  private history = new HistoryPanel();

  private view: View | null = null;
  private viewId = '';
  private lastToastSeq = 0;
  private lastPhase: Phase | null = null;
  private lastResult: GameState['result'] = null;
  private lastProgress: GameState['progress'] = null;
  private lastAI: GameState['aiStatus'] = null;
  private lastWordsKey = '';

  constructor(
    private readonly store: Store,
    private readonly stage: StageAPI,
    root: HTMLElement,
  ) {
    this.hud = el('div', 'hud');
    this.hudLeft = el('div', 'hud-left');
    this.hudRight = el('div', 'hud-right');
    this.hud.append(this.hudLeft, this.hudRight);

    // the room's two screens: main carries the views, side the archive
    this.screenMain = el('div', 'screen screen-main');
    // terminal chrome: the screen's own title bar (round / phase / encryptor)
    this.chrome = el('div', 'screen-chrome');
    this.chrome.append(el('span', 'chrome-left', '监听终端 K-3 · DECRYPTO'));
    this.chromeRight = el('span', 'chrome-right');
    this.chrome.append(this.chromeRight);
    this.viewRoot = el('div', 'view-root');
    this.screenMain.append(this.chrome, this.viewRoot);
    this.screenSide = el('div', 'screen screen-side hidden');
    this.screenSide.append(this.history.el);

    this.strip = el('div', 'status-strip');
    this.screenMain.append(this.strip);
    this.screenMain.append(this.toasts.el);

    root.append(this.hud, this.screenMain, this.screenSide);

    // the room's VU meter mirrors the active countdown
    CountdownRing.onChange = (seconds, deadline) => this.stage.setCountdown(seconds, deadline);

    store.subscribe((s) => this.render(s));
    this.render(store.state);
  }

  private render(s: GameState): void {
    // toasts
    if (s.toast && s.toast.seq !== this.lastToastSeq) {
      this.lastToastSeq = s.toast.seq;
      this.toasts.show(s.toast.message);
    }

    // scene mood
    const mood = MOOD_BY_PHASE[s.phase];
    this.stage.setMood(mood);

    // desk displays: your 4 code words during a match, blank outside
    const inGame = s.phase !== 'home' && s.phase !== 'room';
    const wordsKey = inGame ? s.myWords.join('|') : '';
    if (wordsKey !== this.lastWordsKey) {
      this.lastWordsKey = wordsKey;
      this.stage.setCodebook(inGame && s.myWords.length === 4 ? s.myWords : null);
    }
    // score lamps on the wall strip
    this.stage.setScore(s.scoreA, s.scoreB);

    // scene pulses on fresh results
    if (s.phase === 'round_result' && s.result) {
      const prev = this.lastResult;
      if (s.result.interceptSuccess !== undefined && prev?.interceptSuccess === undefined) {
        const goodForMe = s.result.interceptSuccess === (s.myRole === 'opponent');
        this.stage.pulse(goodForMe ? 'ok' : 'fail');
      }
      if (s.result.decryptSuccess !== undefined && prev?.decryptSuccess === undefined) {
        const goodForMe = s.result.decryptSuccess !== (s.myRole === 'opponent');
        this.stage.pulse(goodForMe ? 'ok' : 'fail');
      }
    }
    if (s.phase === 'game_over' && this.lastPhase !== 'game_over') {
      const winner = s.gameOver?.winner ?? null;
      this.stage.pulse(winner === null ? 'info' : winner === s.myTeam ? 'ok' : 'fail');
    }
    this.lastPhase = s.phase;
    this.lastResult = s.result;

    // scene activity from live progress
    if (s.progress && s.progress !== this.lastProgress) {
      this.stage.activity(s.progress.step / 3, s.progress.focus || undefined);
    }
    this.lastProgress = s.progress;
    if (s.aiStatus && s.aiStatus !== this.lastAI) {
      this.stage.activity(s.aiStatus.step / Math.max(1, s.aiStatus.total));
    }
    this.lastAI = s.aiStatus;

    // view routing
    const id = this.computeViewId(s);
    if (id !== this.viewId) {
      this.viewId = id;
      this.view?.dispose();
      this.view = this.createView(id);
      this.viewRoot.textContent = '';
      this.viewRoot.append(this.view.el);
    }
    this.view?.update(s);

    // archive side screen: visible during a match, hidden otherwise (the
    // room shows a standby readout on that tube)
    this.screenSide.classList.toggle('hidden', !inGame);
    if (inGame) this.history.update(s.history, s.myTeam, s.myWords);

    this.renderHud(s);
    this.renderStrip(s);
  }

  private computeViewId(s: GameState): string {
    switch (s.phase) {
      case 'home':
        return 'home';
      case 'room':
        return 'lobby';
      case 'encrypting':
        return s.myRole === 'encryptor' ? 'encrypt' : 'wait-clues';
      case 'intercept':
        return s.myRole === 'opponent' ? 'intercept-input' : 'intercept-watch';
      case 'decrypt':
        return s.myRole === 'teammate'
          ? 'decrypt-input'
          : s.myRole === 'encryptor'
            ? 'decrypt-watch'
            : 'decrypt-standby';
      case 'round_result':
        return 'result';
      case 'game_over':
        return 'gameover';
    }
  }

  private createView(id: string): View {
    switch (id) {
      case 'lobby':
        return new LobbyView(this.store);
      case 'encrypt':
        return new EncryptView(this.store);
      case 'wait-clues':
        return new WaitCluesView(this.store);
      case 'intercept-input':
        return new InterceptInputView(this.store);
      case 'intercept-watch':
        return new InterceptWatchView(this.store);
      case 'decrypt-input':
        return new DecryptInputView(this.store);
      case 'decrypt-watch':
        return new DecryptWatchView(this.store);
      case 'decrypt-standby':
        return new DecryptStandbyView(this.store);
      case 'result':
        return new ResultView(this.store);
      case 'gameover':
        return new GameOverView(this.store);
      default:
        return new HomeView(this.store);
    }
  }

  private renderHud(s: GameState): void {
    const inGame = s.phase !== 'home';
    this.hud.classList.toggle('hidden', !inGame);
    if (!inGame) return;

    this.hudLeft.textContent = '';
    const conn = el('span', `conn-dot${s.connected ? ' on' : ''}`);
    conn.title = s.connected ? '频道在线' : '连接中断';
    this.hudLeft.append(conn);
    if (s.roomCode) this.hudLeft.append(el('span', 'hud-room', `频道 ${s.roomCode}`));
    if (s.myTeam) {
      this.hudLeft.append(el('span', `team-badge team-${s.myTeam.toLowerCase()}`, `我方 ${s.myTeam} 队`));
    }

    this.hudRight.textContent = '';
    if (s.phase !== 'room') {
      this.hudRight.append(this.hudScore('A', s.scoreA));
      this.hudRight.append(this.hudScore('B', s.scoreB));
    }

    // terminal chrome inside the main screen: round / phase / encryptor
    this.chromeRight.textContent = '';
    if (s.phase !== 'room' && s.round > 0) {
      const parts = [`回合 ${s.round}/16`];
      const label = PHASE_LABEL[s.phase];
      if (label) parts.push(label);
      if (s.encryptor && s.phase !== 'game_over') parts.push(`加密者 ${s.encryptor}`);
      this.chromeRight.append(el('span', 'chrome-status', parts.join(' · ')));
    } else if (s.phase === 'room') {
      this.chromeRight.append(el('span', 'chrome-status', '集结待命'));
    }
  }

  private hudScore(team: string, score: { interceptions: number; decrypt_failures: number }): HTMLElement {
    const wrap = el('span', `hud-score${team === this.store.state.myTeam ? ' mine' : ''}`);
    wrap.append(el('span', `team-badge team-${team.toLowerCase()}`, team));
    const ints = el('span', 'hud-score-group');
    ints.title = '拦截成功（先得 2 分获胜）';
    ints.append(scorePips(score.interceptions, 'pips-intercept'));
    const fails = el('span', 'hud-score-group');
    fails.title = '解密失误（累计 2 次判负）';
    fails.append(scorePips(score.decrypt_failures, 'pips-fail'));
    wrap.append(ints, fails);
    return wrap;
  }

  private renderStrip(s: GameState): void {
    const action = PHASE_ACTION[s.phase];
    if (!action) {
      this.strip.classList.add('hidden');
      return;
    }
    this.strip.classList.remove('hidden');
    this.strip.textContent = '';

    if (s.aiStatus && s.aiStatus.action === action) {
      this.strip.append(
        el(
          'span',
          'strip-item strip-ai',
          `◈ AI ${s.aiStatus.player} 正在${ACTION_LABEL[action]} · ${s.aiStatus.step}/${s.aiStatus.total}`,
        ),
      );
      return;
    }
    const p = s.progress;
    if (p && p.action === action && p.player !== s.myNickname) {
      const stateText =
        p.state === 'submitted' ? '已提交' : p.state === 'editing' ? `输入中 ${p.step}/3` : '待命';
      this.strip.append(el('span', 'strip-item', `${p.player} · ${ACTION_LABEL[action]} · ${stateText}`));
      return;
    }
    this.strip.append(el('span', 'strip-item strip-quiet', '频道静默'));
  }
}
