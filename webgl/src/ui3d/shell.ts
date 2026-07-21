// Shell: routes GameState -> canvas views on the main CRT, owns the paper
// overlays (codebook archive + field manual), paints toasts, and drives the
// three.js stage (moods, pulses, activity, power, codebook words, score,
// VU countdown, status readout).

import type { GameState, Phase, Store } from '../store';
import type { Mood, PickKind, StageAPI } from '../scene';
import { hitAt, screenBg, text, type Ctx, type HitArea } from './kit';
import { T } from './theme';
import { CView, countdownOf } from './view';
import { ime } from './ime';
import { HomeView } from './views/home';
import { LobbyView } from './views/lobby';
import { EncryptView } from './views/encrypt';
import { WaitCluesView } from './views/wait-clues';
import { InterceptInputView } from './views/intercept-input';
import { InterceptWatchView } from './views/intercept-watch';
import { DecryptInputView } from './views/decrypt-input';
import { DecryptWatchView } from './views/decrypt-watch';
import { DecryptStandbyView } from './views/decrypt-standby';
import { ResultView } from './views/result';
import { GameOverView } from './views/gameover';
import { paintPaperArchive, paintPaperManual } from './views/paper';

const MOOD_BY_PHASE: Record<Phase, Mood> = {
  home: 'idle',
  room: 'lobby',
  encrypting: 'encrypt',
  intercept: 'intercept',
  decrypt: 'decrypt',
  round_result: 'result',
  game_over: 'result',
};

interface Toast {
  message: string;
  born: number;
}

export class Shell {
  private view: CView | null = null;
  private viewId = '';
  private state: GameState;
  private t = 0;

  private lastToastSeq = 0;
  private toasts: Toast[] = [];
  private lastPhase: Phase | null = null;
  private lastResult: GameState['result'] = null;
  private lastProgress: GameState['progress'] = null;
  private lastAI: GameState['aiStatus'] = null;
  private lastWordsKey = '';
  private lastPowered: boolean | null = null;
  private lastDeadline: number | null = null;

  private paper: 'archive' | 'manual' | null = null;
  private paperAreas: HitArea[] = [];

  constructor(
    private readonly store: Store,
    private readonly stage: StageAPI,
  ) {
    this.state = store.state;

    stage.onScreenPick = (u, v, kind) => this.onPick(false, u, v, kind);
    stage.onPaperPick = (u, v, kind) => this.onPick(true, u, v, kind);
    stage.onCodebookClick = () => this.togglePaper('archive');
    ime.onType = () => this.stage.keyPress();

    window.addEventListener('keydown', this.onKey);
    window.addEventListener('decrypto:howto', this.onHowto);

    // static paint closures read the latest state/time — set once
    this.stage.mainPainter.setPainter((g, w, h) => this.paintMain(g, w, h));
    this.stage.paperPainter.setPainter((g, w, h) => this.paintPaper(g, w, h));

    store.subscribe((s) => this.render(s));
    this.render(store.state);

    // e2e/debug hook: hit-area lookup + programmatic clicks
    (window as unknown as { __ui3d: unknown }).__ui3d = {
      viewId: () => this.viewId,
      phase: () => this.state.phase,
      role: () => this.state.myRole,
      roomCode: () => this.state.roomCode,
      paperOpen: () => this.paper !== null,
      area: (id: string) => {
        const a = [...(this.view?.areas ?? []), ...this.paperAreas].find((x) => x.id === id);
        return a ? { x: a.x, y: a.y, w: a.w, h: a.h, enabled: a.enabled } : null;
      },
      click: (id: string) => {
        const a = this.view?.areas.find((x) => x.id === id && x.enabled);
        a?.onClick?.();
        this.stage.mainPainter.markDirty();
        return !!a?.onClick;
      },
      paperClick: (id: string) => {
        const a = this.paperAreas.find((x) => x.id === id && x.enabled);
        a?.onClick?.();
        this.stage.paperPainter.markDirty();
        return !!a?.onClick;
      },
      /** hit-area center in client pixels (for real CDP mouse events) */
      areaClient: (id: string) => {
        const a = this.view?.areas.find((x) => x.id === id);
        if (!a) return null;
        return this.stage.screenUvToClient(
          (a.x + a.w / 2) / 1536,
          1 - (a.y + a.h / 2) / 936,
        );
      },
      codebookClient: () => this.stage.codebookClient(),
    };

    const loop = (tms: number): void => {
      this.t = tms / 1000;
      if (this.view?.animated || this.toasts.length > 0 || this.paper !== null) {
        this.stage.mainPainter.markDirty();
        if (this.paper !== null) this.stage.paperPainter.markDirty();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ---- input dispatch ------------------------------------------------------

  private onPick(paper: boolean, u: number, v: number, kind: PickKind): void {
    if (paper) {
      if (kind === 'outside') {
        this.closePaper();
        return;
      }
      const px = u * 1024;
      const py = (1 - v) * 1280;
      if (kind === 'click') {
        hitAt(this.paperAreas, px, py)?.onClick?.();
      } else if (kind === 'hover' || kind === 'leave') {
        const a = kind === 'hover' ? hitAt(this.paperAreas, px, py) : null;
        this.hover(this.paperAreas, a);
        document.body.style.cursor = a?.onClick ? 'pointer' : '';
        this.stage.paperPainter.markDirty();
      }
      return;
    }

    if (this.paper !== null) return; // paper is modal
    const px = u * 1536;
    const py = (1 - v) * 936;
    const areas = this.view?.areas ?? [];
    if (kind === 'click') {
      hitAt(areas, px, py)?.onClick?.();
      this.stage.mainPainter.markDirty();
      return;
    }
    const a = kind === 'hover' ? hitAt(areas, px, py) : null;
    if (this.hover(areas, a)) this.stage.mainPainter.markDirty();
    document.body.style.cursor = a?.onClick ? 'pointer' : '';
  }

  /** Update hovered flags; true when anything changed. */
  private hover(areas: HitArea[], active: HitArea | null): boolean {
    let changed = false;
    for (const a of areas) {
      const h = a === active;
      if (a.hovered !== h) {
        a.hovered = h;
        changed = true;
      }
    }
    return changed;
  }

  private onKey = (ev: KeyboardEvent): void => {
    if (ime.active) return; // the focused field owns the keyboard
    if (ev.key === 'Escape') {
      if (this.paper !== null) {
        this.closePaper();
        return;
      }
    }
    if ((ev.key === 'h' || ev.key === 'H') && !ime.active) {
      this.togglePaper('archive');
      return;
    }
    if (this.view?.key(ev, this.state)) ev.preventDefault();
  };

  private onHowto = (): void => {
    this.openPaper('manual');
  };

  // ---- paper overlays ------------------------------------------------------

  openPaper(which: 'archive' | 'manual'): void {
    this.paper = which;
    this.stage.setPaperOpen(true);
    this.stage.paperPainter.markDirty();
    document.body.style.cursor = '';
  }

  closePaper(): void {
    this.paper = null;
    this.stage.setPaperOpen(false);
    document.body.style.cursor = '';
  }

  private togglePaper(which: 'archive' | 'manual'): void {
    if (this.paper === which) this.closePaper();
    else this.openPaper(which);
  }

  private paintPaper(g: Ctx, w: number, h: number): void {
    this.paperAreas.length = 0;
    if (this.paper === 'archive') {
      paintPaperArchive(g, w, h, this.paperAreas, this.state, () => this.closePaper());
    } else if (this.paper === 'manual') {
      paintPaperManual(g, w, h, this.paperAreas, () => this.closePaper());
    }
  }

  // ---- main paint ----------------------------------------------------------

  private paintMain(g: Ctx, w: number, h: number): void {
    screenBg(g, w, h);
    this.view?.paint(g, this.state, this.t);
    this.paintToasts(g, w);
  }

  private paintToasts(g: Ctx, w: number): void {
    const now = this.t;
    this.toasts = this.toasts.filter((t) => now - t.born < 4.2);
    this.toasts.forEach((toast, i) => {
      const age = now - toast.born;
      const alpha = age > 3.4 ? Math.max(0, 1 - (age - 3.4) / 0.8) : 1;
      g.save();
      g.globalAlpha = alpha;
      g.font = '400 19px ' + T.fontCjk;
      const tw = g.measureText(toast.message).width + 40;
      const x = (w - tw) / 2;
      const y = 26 + i * 48;
      g.fillStyle = 'rgba(42, 15, 10, 0.92)';
      g.strokeStyle = T.redDim;
      g.fillRect(x, y, tw, 38);
      g.strokeRect(x, y, tw, 38);
      text(g, toast.message, w / 2, y + 19, { size: 19, color: '#ffd9c9', align: 'center', baseline: 'middle' });
      g.restore();
    });
  }

  // ---- state -> stage + view routing ---------------------------------------

  private render(s: GameState): void {
    this.state = s;

    if (s.toast && s.toast.seq !== this.lastToastSeq) {
      this.lastToastSeq = s.toast.seq;
      this.toasts.push({ message: s.toast.message, born: this.t });
      if (this.toasts.length > 3) this.toasts.shift();
    }

    this.stage.setMood(MOOD_BY_PHASE[s.phase]);

    const inGame = s.phase !== 'home' && s.phase !== 'room';
    if (inGame !== this.lastPowered) {
      this.lastPowered = inGame;
      this.stage.setPowered(inGame);
    }

    const wordsKey = inGame ? s.myWords.join('|') : '';
    if (wordsKey !== this.lastWordsKey) {
      this.lastWordsKey = wordsKey;
      this.stage.setCodebook(inGame && s.myWords.length === 4 ? s.myWords : null);
    }
    this.stage.setScore(s.scoreA, s.scoreB);

    // diegetic status readout: channel code + scores
    const status1 = s.phase === 'home' ? '' : s.roomCode ? `频道 ${s.roomCode}` : '';
    const status2 =
      inGame || s.phase === 'round_result' || s.phase === 'game_over'
        ? `A 拦${s.scoreA.interceptions}/2 误${s.scoreA.decrypt_failures}/2 · B 拦${s.scoreB.interceptions}/2 误${s.scoreB.decrypt_failures}/2`
        : '';
    this.stage.setStatus(status1, status2);

    // pulses on fresh results
    if (s.phase === 'round_result' && s.result) {
      const prev = this.lastResult;
      if (s.result.interceptSuccess !== undefined && prev?.interceptSuccess === undefined) {
        this.stage.pulse(s.result.interceptSuccess === (s.myRole === 'opponent') ? 'ok' : 'fail');
      }
      if (s.result.decryptSuccess !== undefined && prev?.decryptSuccess === undefined) {
        this.stage.pulse(s.result.decryptSuccess !== (s.myRole === 'opponent') ? 'ok' : 'fail');
      }
    }
    if (s.phase === 'game_over' && this.lastPhase !== 'game_over') {
      const winner = s.gameOver?.winner ?? null;
      this.stage.pulse(winner === null ? 'info' : winner === s.myTeam ? 'ok' : 'fail');
    }
    this.lastPhase = s.phase;
    this.lastResult = s.result;

    if (s.progress && s.progress !== this.lastProgress) {
      this.stage.activity(s.progress.step / 3, s.progress.focus || undefined);
    }
    this.lastProgress = s.progress;
    if (s.aiStatus && s.aiStatus !== this.lastAI) {
      this.stage.activity(s.aiStatus.step / Math.max(1, s.aiStatus.total));
    }
    this.lastAI = s.aiStatus;

    // server-synced countdown -> VU meter
    if (s.phaseDeadline !== this.lastDeadline) {
      this.lastDeadline = s.phaseDeadline;
      const cd = countdownOf(s);
      if (cd && s.phaseDeadline) {
        this.stage.setCountdown(
          s.phase === 'encrypting' ? 90 : 60,
          performance.now() + (s.phaseDeadline - Date.now()),
        );
      } else {
        this.stage.setCountdown(null);
      }
    }

    // view routing
    const id = this.computeViewId(s);
    if (id !== this.viewId) {
      this.viewId = id;
      this.view?.leave();
      this.view = this.createView(id);
      this.view.enter(s);
      document.body.style.cursor = '';
    }
    this.stage.mainPainter.markDirty();
    if (this.paper === 'archive') this.stage.paperPainter.markDirty();
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

  private createView(id: string): CView {
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
}
