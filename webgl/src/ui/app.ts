// App shell: routes GameState -> views inside the room's main screen, owns
// the paper overlays (codebook archive + field manual), renders the minimal
// HUD, and drives the three.js stage (moods, pulses, activity, codebook
// words, score lamps, VU countdown, power state).

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
import {
  CountdownRing,
  HistoryPanel,
  PaperOverlay,
  Toasts,
  el,
  fieldManual,
  scorePips,
} from './widgets';

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
  private screenMain: HTMLElement;
  private viewRoot: HTMLElement;
  private strip: HTMLElement;
  private toasts = new Toasts();
  private history = new HistoryPanel();
  private archive: PaperOverlay;
  private manual: PaperOverlay;

  private view: View | null = null;
  private viewId = '';
  private lastToastSeq = 0;
  private lastPhase: Phase | null = null;
  private lastResult: GameState['result'] = null;
  private lastProgress: GameState['progress'] = null;
  private lastAI: GameState['aiStatus'] = null;
  private lastWordsKey = '';
  private lastPowered: boolean | null = null;

  constructor(
    private readonly store: Store,
    private readonly stage: StageAPI,
    root: HTMLElement,
  ) {
    this.hud = el('div', 'hud');
    this.hudLeft = el('div', 'hud-left');
    this.hudRight = el('div', 'hud-right');
    this.hud.append(this.hudLeft, this.hudRight);

    // the room's main tube carries the views
    this.screenMain = el('div', 'screen screen-main');
    this.viewRoot = el('div', 'view-root');
    this.screenMain.append(this.viewRoot);

    this.strip = el('div', 'status-strip');
    this.screenMain.append(this.strip);
    this.screenMain.append(this.toasts.el);

    // paper overlays: the codebook (round archive) and the field manual
    this.archive = new PaperOverlay('密码本 · 情报档案');
    this.archive.setContent(this.history.el);
    this.manual = new PaperOverlay('野战手册 · 怎么玩');
    this.manual.setContent(fieldManual());

    root.append(this.hud, this.screenMain, this.archive.el, this.manual.el);

    // the room's VU meter mirrors the active countdown
    CountdownRing.onChange = (seconds, deadline) => this.stage.setCountdown(seconds, deadline);

    // the desk codebook prop opens the archive
    this.stage.onCodebookClick = () => this.archive.toggle();

    // DOM typing makes the 3D desk keyboard sink a key
    this.viewRoot.addEventListener(
      'keydown',
      (ev) => {
        const t = ev.target as HTMLElement | null;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) this.stage.keyPress();
      },
      true,
    );

    // H toggles the codebook, Esc closes any paper overlay; the home view's
    // "怎么玩？" button opens the manual via a window event
    window.addEventListener('keydown', this.onGlobalKey);
    window.addEventListener('decrypto:howto', this.onHowto);

    store.subscribe((s) => this.render(s));
    this.render(store.state);
  }

  private onGlobalKey = (ev: KeyboardEvent): void => {
    const t = ev.target as HTMLElement | null;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
    if (ev.key === 'Escape') {
      if (this.archive.isOpen) this.archive.hide();
      if (this.manual.isOpen) this.manual.hide();
      return;
    }
    if (!typing && (ev.key === 'h' || ev.key === 'H')) {
      this.archive.toggle();
    }
  };

  private onHowto = (): void => {
    this.manual.show();
  };

  private render(s: GameState): void {
    // toasts
    if (s.toast && s.toast.seq !== this.lastToastSeq) {
      this.lastToastSeq = s.toast.seq;
      this.toasts.show(s.toast.message);
    }

    // scene mood
    const mood = MOOD_BY_PHASE[s.phase];
    this.stage.setMood(mood);

    // instruments power up for a match, go dark in menus
    const inGame = s.phase !== 'home' && s.phase !== 'room';
    if (inGame !== this.lastPowered) {
      this.lastPowered = inGame;
      this.stage.setPowered(inGame);
    }

    // desk displays: your 4 code words during a match, blank outside
    const wordsKey = inGame ? s.myWords.join('|') : '';
    if (wordsKey !== this.lastWordsKey) {
      this.lastWordsKey = wordsKey;
      this.stage.setCodebook(inGame && s.myWords.length === 4 ? s.myWords : null);
    }
    // score lamps on the wall board
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

    // codebook archive keeps tracking the match
    this.history.update(s.history, s.myTeam, s.myWords);

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
    const inRoom = s.phase !== 'home';
    this.hud.classList.toggle('hidden', !inRoom);
    if (!inRoom) return;

    this.hudLeft.textContent = '';
    const conn = el('span', `conn-dot${s.connected ? ' on' : ''}`);
    conn.title = s.connected ? '线路已接通' : '线路中断';
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
    const bookBtn = el('button', 'hud-book', '密码本');
    bookBtn.type = 'button';
    bookBtn.title = '查看回合历史（H）';
    bookBtn.addEventListener('click', () => this.archive.toggle());
    this.hudRight.append(bookBtn);
  }

  private hudScore(team: string, score: { interceptions: number; decrypt_failures: number }): HTMLElement {
    const wrap = el('span', `hud-score${team === this.store.state.myTeam ? ' mine' : ''}`);
    wrap.append(el('span', `team-badge team-${team.toLowerCase()}`, team));
    const ints = el('span', 'hud-score-group');
    ints.title = '拦截成功（先得 2 分获胜）';
    ints.append(el('span', 'hud-score-tag', '拦'));
    ints.append(scorePips(score.interceptions, 'pips-intercept'));
    ints.append(el('span', 'hud-score-num', `${score.interceptions}/2`));
    const fails = el('span', 'hud-score-group');
    fails.title = '解密失误（累计 2 次判负）';
    fails.append(el('span', 'hud-score-tag', '误'));
    fails.append(scorePips(score.decrypt_failures, 'pips-fail'));
    fails.append(el('span', 'hud-score-num', `${score.decrypt_failures}/2`));
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
    // say who we're waiting for instead of an opaque "silence"
    const whom =
      action === 'encrypt' && s.encryptor ? `等待 ${s.encryptor} 编制密电` : '线路静默 · 等待动静';
    this.strip.append(el('span', 'strip-item strip-quiet', whom));
  }
}
