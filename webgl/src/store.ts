// Protocol state machine — framework-free port of the reference client logic
// in web/src/store/gameStore.ts (see HANDOFF_THREEJS.md §6), with fixes for
// the documented pitfalls:
//  - round_result is incremental (optional fields), merge within a round
//  - clues persist across phases within a round (server omits them for some
//    roles on later phase_change messages)
//  - disconnect degrades to home instead of freezing mid-game

import type {
  PhaseChangeData,
  PlayerInfo,
  PlayerProgressData,
  Role,
  RoundHistoryRow,
  RoundResultData,
  ScoreInfo,
} from './protocol';
import { C, S } from './protocol';
import type { Net } from './net';

export type Phase =
  | 'home'
  | 'room'
  | 'encrypting'
  | 'intercept'
  | 'decrypt'
  | 'round_result'
  | 'game_over';

export interface RoundResultState {
  interceptSuccess?: boolean;
  decryptSuccess?: boolean;
}

export interface AIStatus {
  action: string;
  player: string;
  step: number;
  total: number;
}

export interface GameState {
  connected: boolean;
  /** One-shot notice for the user (e.g. disconnect). Cleared on next view. */
  notice: string | null;
  phase: Phase;

  // Room
  roomCode: string | null;
  players: PlayerInfo[];
  teamA: PlayerInfo[];
  teamB: PlayerInfo[];
  ownerID: string;
  canStart: boolean;
  myPlayerID: string;

  // Game
  round: number;
  myRole: Role;
  myTeam: string;
  myWords: string[];
  secretDigits: number[];
  secretWords: string[];
  clues: string[];
  encryptor: string;
  history: RoundHistoryRow[];
  waiting: boolean;
  scoreA: ScoreInfo;
  scoreB: ScoreInfo;
  result: RoundResultState | null;
  gameOver: { winner: string | null } | null;
  aiStatus: AIStatus | null;
  progress: PlayerProgressData | null;

  // Toast stream (server errors + local warnings)
  toast: { message: string; seq: number } | null;

  /** Nickname as entered on the home screen (for "is this me" checks). */
  myNickname: string;
}

const initialState = (): GameState => ({
  connected: false,
  notice: null,
  phase: 'home',
  roomCode: null,
  players: [],
  teamA: [],
  teamB: [],
  ownerID: '',
  canStart: false,
  myPlayerID: '',
  round: 0,
  myRole: '',
  myTeam: '',
  myWords: [],
  secretDigits: [],
  secretWords: [],
  clues: [],
  encryptor: '',
  history: [],
  waiting: false,
  scoreA: { interceptions: 0, decrypt_failures: 0 },
  scoreB: { interceptions: 0, decrypt_failures: 0 },
  result: null,
  gameOver: null,
  aiStatus: null,
  progress: null,
  toast: null,
  myNickname: '',
});

type Listener = (s: GameState) => void;

export class Store {
  state: GameState = initialState();
  private listeners = new Set<Listener>();
  private toastSeq = 0;

  constructor(private readonly net: Net) {}

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(partial: Partial<GameState>): void {
    this.state = { ...this.state, ...partial };
    for (const fn of this.listeners) fn(this.state);
  }

  showToast(message: string): void {
    this.set({ toast: { message, seq: ++this.toastSeq } });
  }

  // ---- inbound dispatch ----------------------------------------------------

  handle(type: string, data: unknown): void {
    const d = (data ?? {}) as Record<string, unknown>;
    switch (type) {
      case '_connected':
        this.set({ connected: true, notice: null });
        if (this.state.roomCode) this.net.send(C.RequestSync, {});
        break;

      case '_disconnected': {
        // Identity lives on the connection (HANDOFF §5.1): a dropped link
        // means the room/game is gone for us. Degrade to home gracefully.
        const wasInGame = this.state.phase !== 'home';
        const notice = wasInGame
          ? '连接已断开。对局无法恢复——请重新建立频道。'
          : null;
        this.set({ ...initialState(), connected: false, notice });
        break;
      }

      case S.RoomCreated:
        this.set({
          roomCode: (d.room_code as string) ?? null,
          myPlayerID: (d.my_player_id as string) ?? '',
          phase: 'room',
        });
        break;

      case S.RoomState:
        this.set({
          phase: 'room',
          roomCode: (d.room_code as string) ?? this.state.roomCode,
          players: (d.players as PlayerInfo[]) ?? [],
          teamA: (d.team_a as PlayerInfo[]) ?? [],
          teamB: (d.team_b as PlayerInfo[]) ?? [],
          ownerID: (d.owner_id as string) ?? '',
          canStart: (d.can_start as boolean) ?? false,
          myPlayerID: (d.my_player_id as string) ?? this.state.myPlayerID,
        });
        break;

      case S.GameStart:
        this.set({
          round: (d.round as number) ?? 1,
          myRole: (d.your_role as Role) ?? '',
          myTeam: (d.your_team as string) ?? '',
          myWords: (d.words as string[]) ?? [],
          history: [],
          result: null,
          gameOver: null,
        });
        break;

      case S.PhaseChange:
        this.onPhaseChange(d as unknown as PhaseChangeData);
        break;

      case S.CluesSubmitted:
        this.set({
          clues: (d.clues as string[]) ?? this.state.clues,
          history: (d.history as RoundHistoryRow[]) ?? this.state.history,
        });
        break;

      case S.RoundResult:
        this.onRoundResult(d as unknown as RoundResultData);
        break;

      case S.GameOver:
        this.set({
          gameOver: { winner: (d.winner as string | null) ?? null },
          scoreA: (d.score_a as ScoreInfo) ?? this.state.scoreA,
          scoreB: (d.score_b as ScoreInfo) ?? this.state.scoreB,
          phase: 'game_over',
        });
        break;

      case S.FullSync:
        this.onFullSync(d);
        break;

      case S.AIThinking:
        this.set({
          aiStatus: {
            action: (d.action as string) ?? '',
            player: (d.player as string) ?? '',
            step: (d.step as number) ?? 1,
            total: (d.total as number) ?? 3,
          },
        });
        break;

      case S.AIActed:
        this.set({ aiStatus: null });
        break;

      case S.PlayerProgress:
        this.set({ progress: d as unknown as PlayerProgressData });
        break;

      case S.Error:
        this.showToast((d.message as string) ?? '未知错误');
        break;

      default:
        break;
    }
  }

  private onPhaseChange(d: PhaseChangeData): void {
    if (d.phase === 'new_round') {
      // "Round N is about to start": role is already updated. Derive the
      // interim perspective (reference logic): encryptor -> encrypting,
      // waiting -> intercept-side view, otherwise -> decrypt-side view.
      // The real phase_change(encrypting) follows immediately.
      const role = d.your_role ?? this.state.myRole;
      const phase: Phase =
        role === 'encryptor' ? 'encrypting' : d.waiting ? 'intercept' : 'decrypt';
      this.set({
        phase,
        round: d.round ?? this.state.round,
        myRole: role,
        encryptor: d.encryptor ?? '',
        secretDigits: [],
        secretWords: [],
        clues: [],
        history: d.history ?? this.state.history,
        waiting: d.waiting ?? false,
        result: null,
        aiStatus: null,
        progress: null,
      });
      return;
    }

    this.set({
      phase: d.phase,
      round: d.round ?? this.state.round,
      myRole: d.your_role ?? this.state.myRole,
      encryptor: d.encryptor ?? '',
      secretDigits: d.secret_digits ?? [],
      secretWords: d.secret_words ?? [],
      // Keep clues across phases within a round: later phase_change messages
      // only include clues for specific roles (HANDOFF §5.5).
      clues: d.clues ?? this.state.clues,
      history: d.history ?? this.state.history,
      waiting: d.waiting ?? false,
      result: null,
      aiStatus: null,
      progress: null,
    });
  }

  private onRoundResult(d: RoundResultData): void {
    // Incremental delivery: intercept result first, decrypt result later —
    // merge within the round instead of replacing (HANDOFF §5.2).
    const prev = this.state.result ?? {};
    this.set({
      result: {
        interceptSuccess: d.intercept_success ?? prev.interceptSuccess,
        decryptSuccess: d.decrypt_success ?? prev.decryptSuccess,
      },
      scoreA: d.score_a ?? this.state.scoreA,
      scoreB: d.score_b ?? this.state.scoreB,
      phase: 'round_result',
    });
  }

  private onFullSync(d: Record<string, unknown>): void {
    const room = d.room as Record<string, unknown> | undefined;
    const game = d.game as Record<string, unknown> | undefined;

    if (room) {
      this.set({
        roomCode: (room.room_code as string) ?? this.state.roomCode,
        players: (room.players as PlayerInfo[]) ?? [],
        teamA: (room.team_a as PlayerInfo[]) ?? [],
        teamB: (room.team_b as PlayerInfo[]) ?? [],
        ownerID: (room.owner_id as string) ?? '',
        canStart: (room.can_start as boolean) ?? false,
        myPlayerID: (room.my_player_id as string) ?? this.state.myPlayerID,
      });
    }

    if (game) {
      // full_sync phases are internal state names: new|init|encrypting|
      // intercept|decrypt|done (HANDOFF §4.2) — map onto our Phase union.
      const raw = (game.phase as string) ?? '';
      const phase: Phase =
        raw === 'encrypting' || raw === 'intercept' || raw === 'decrypt'
          ? raw
          : raw === 'done'
            ? 'round_result'
            : this.state.phase === 'home'
              ? 'room'
              : this.state.phase;
      this.set({
        round: (game.round as number) ?? this.state.round,
        myRole: (game.your_role as Role) ?? this.state.myRole,
        myTeam: (game.your_team as string) ?? this.state.myTeam,
        myWords: (game.words as string[]) ?? this.state.myWords,
        secretDigits: (game.secret_digits as number[]) ?? [],
        secretWords: (game.secret_words as string[]) ?? [],
        clues: (game.clues as string[]) ?? this.state.clues,
        encryptor: (game.encryptor as string) ?? this.state.encryptor,
        history: (game.history as RoundHistoryRow[]) ?? this.state.history,
        waiting: (game.waiting as boolean) ?? false,
        scoreA: (game.score_a as ScoreInfo) ?? this.state.scoreA,
        scoreB: (game.score_b as ScoreInfo) ?? this.state.scoreB,
        phase,
      });
    } else if (room) {
      this.set({ phase: 'room' });
    }
  }

  // ---- outbound actions ----------------------------------------------------

  createRoom(nickname: string): void {
    this.set({ myNickname: nickname });
    this.net.send(C.CreateRoom, { nickname });
  }

  joinRoom(code: string, nickname: string): void {
    this.set({ myNickname: nickname });
    this.net.send(C.JoinRoom, { room_code: code, nickname });
  }

  selectTeam(team: 'A' | 'B'): void {
    this.net.send(C.SelectTeam, { team });
  }

  leaveTeam(): void {
    this.net.send(C.LeaveTeam, {});
  }

  addAI(team: 'A' | 'B'): void {
    this.net.send(C.AddAI, { team });
  }

  removeAI(team: 'A' | 'B', index: number): void {
    this.net.send(C.RemoveAI, { team, index });
  }

  startGame(): void {
    this.net.send(C.StartGame, {});
  }

  submitClues(clues: [string, string, string]): void {
    this.net.send(C.SubmitClues, { clues });
  }

  submitIntercept(guess: [number, number, number]): void {
    this.net.send(C.SubmitIntercept, { guess });
  }

  submitDecrypt(guess: [number, number, number]): void {
    this.net.send(C.SubmitDecrypt, { guess });
  }

  sendProgress(
    action: 'encrypt' | 'intercept' | 'decrypt',
    step: number,
    opts?: { state?: 'idle' | 'editing' | 'submitted'; focus?: number; guesses?: number[] },
  ): void {
    this.net.send(C.Progress, {
      action,
      step,
      total: 3,
      state: opts?.state,
      focus: opts?.focus ?? 0,
      guesses: opts?.guesses,
    });
  }

  requestSync(): void {
    this.net.send(C.RequestSync, {});
  }

  /** Leave the current context and return to the home screen. */
  reset(): void {
    this.set({ ...initialState(), connected: this.state.connected });
  }
}
