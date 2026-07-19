// App shell: routes GameState -> views, renders the persistent HUD, status
// strip and toasts, and drives the three.js stage (moods, pulses, activity).

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
import { Toasts, el, scorePips } from './widgets';

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
  private hudCenter: HTMLElement;
  private hudRight: HTMLElement;
  private viewRoot: HTMLElement;
  private strip: HTMLElement;
  private toasts = new Toasts();

  private view: View | null = null;
  private viewId = '';
  private lastToastSeq = 0;
  private lastPhase: Phase | null = null;
  private lastResult: GameState['result'] = null;
  private lastProgress: GameState['progress'] = null;
  private lastAI: GameState['aiStatus'] = null;

  constructor(
    private readonly store: Store,
    private readonly stage: StageAPI,
    root: HTMLElement,
  ) {
    this.hud = el('div', 'hud');
    this.hudLeft = el('div', 'hud-left');
    this.hudCenter = el('div', 'hud-center');
    this.hudRight = el('div', 'hud-right');
    this.hud.append(this.hudLeft, this.hudCenter, this.hudRight);
    this.viewRoot = el('div', 'view-root');
    this.strip = el('div', 'status-strip');
    root.append(this.hud, this.viewRoot, this.strip, this.toasts.el);

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

    this.hudCenter.textContent = '';
    if (s.phase !== 'room' && s.round > 0) {
      this.hudCenter.append(el('span', 'hud-round', `回合 ${s.round}/16`));
      const label = PHASE_LABEL[s.phase];
      if (label) this.hudCenter.append(el('span', 'hud-phase', label));
      if (s.encryptor && s.phase !== 'game_over') {
        this.hudCenter.append(el('span', 'hud-encryptor', `加密者 ${s.encryptor}`));
      }
    } else if (s.phase === 'room') {
      this.hudCenter.append(el('span', 'hud-phase', '集结待命'));
    }

    this.hudRight.textContent = '';
    if (s.phase !== 'room') {
      this.hudRight.append(this.hudScore('A', s.scoreA));
      this.hudRight.append(this.hudScore('B', s.scoreB));
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
