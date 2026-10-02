import { create } from "zustand";
import { WebSocketService } from "@/services/websocket";

export interface PlayerInfo {
  id: string;
  nickname: string;
  is_ai: boolean;
  disconnected?: boolean;
}

export interface ScoreInfo {
  interceptions: number;
  decrypt_failures: number;
}

/** A fresh wire result, never reconstructed from a restored score. */
export interface ScoreChange {
  id: number;
  at: number;
  round: number;
  changes: { team: "A" | "B"; kind: "intercept" | "failure"; total: number }[];
}
let scoreSerial = 0;

export interface RoundHistoryRow {
  round: number;
  team: string;
  clues: string[];
  secret?: number[];
  intercept?: number[];
  decrypt?: number[];
  /** Actions of this round that ran out of time: "encrypt", "intercept", "decrypt". */
  timeouts?: string[];
}

/** An action whose time ran out, and how the server settled it. */
export interface TimeoutInfo {
  round: number;
  action: GameAction;
  team: string;
  player?: string;
  /** "draft" | "blank" for clues, "guess" | "none" for guesses. */
  outcome: string;
}

/** What a team does in a phase: the clues while encrypting; the decoding and,
 *  from round 3, the interception while both teams guess at once. */
export type GameAction = "encrypt" | "decrypt" | "intercept";

/** One action of the current phase, as every seat may see it: never what was chosen. */
export interface ActionInfo {
  team: string;
  /** In this device's clock. */
  deadline: number;
  submitted: boolean;
}

export interface AIStatus {
  action: string;
  player: string;
  state?: string;
  completed?: number;
  step: number;
  total: number;
}

export type PlayerProgressState = "idle" | "editing" | "thinking" | "retrying" | "ready" | "unavailable" | "submitted";

export interface PlayerProgress {
  round?: number;
  action: string;
  player: string;
  player_id?: string;
  is_ai?: boolean;
  /** An advisory AI choice, never an accepted team answer. */
  suggestion?: boolean;
  /** Whether this seat may provide the team's final answer. */
  can_submit?: boolean;
  state?: PlayerProgressState;
  step: number;
  focus?: number;
  /** Reaches only the guessing team and the round's encryptor. */
  guesses?: number[];
  /** Encryption only: which clue lines hold text, so out-of-order drafts read correctly. */
  filled?: boolean[];
  total: number;
}

export interface GameOverInfo {
  winner: string | null;
  /** "interceptions" | "errors" | "score" | "draw" */
  reason?: string;
  wordsA?: string[];
  wordsB?: string[];
}

export type GamePhase =
  | "home"
  | "room"
  | "encrypting"
  | "guess"
  | "round_result"
  | "game_over";

export type PlayerRole = "encryptor" | "teammate" | "opponent" | "observer" | "";

interface GameStore {
  resumeToken: string;
  recovering: boolean;
  deadline: number;
  submitted: boolean;
  aiNotice: string;
  error: string | null;
  clearError: () => void;
  // Connection
  connected: boolean;
  wsService: WebSocketService | null;

  // Room state
  phase: GamePhase;
  roomCode: string | null;
  players: PlayerInfo[];
  teamA: PlayerInfo[];
  teamB: PlayerInfo[];
  ownerID: string;
  canStart: boolean;
  myPlayerID: string;
  /** The page code of the server's voice service; empty without voice. */
  voice: string;

  // Game state
  round: number;
  myRole: PlayerRole;
  myTeam: string;
  myWords: string[];
  secretDigits: number[];
  secretWords: string[];
  clues: string[];
  encryptor: string;
  encryptorID: string;
  history: RoundHistoryRow[];
  waiting: boolean;
  scoreA: ScoreInfo;
  scoreB: ScoreInfo;
  scoreChange: ScoreChange | null;
  roundResult: {
    intercept_success?: boolean;
    decrypt_success?: boolean;
  } | null;
  gameOver: GameOverInfo | null;
  /** This round's timeouts, in the order they happened. */
  timeouts: TimeoutInfo[];
  /** Set while this player asks to go back to the reopened lobby after a game. */
  pendingLobby: boolean;
  /** The actions of the current phase by name; both teams may be acting at once. */
  actions: Partial<Record<GameAction, ActionInfo>>;
  /** The latest status of each AI action of the phase. */
  aiStatus: Partial<Record<string, AIStatus>>;
  /** The latest progress of each action of the phase. */
  playerProgress: Partial<Record<string, PlayerProgress>>;
  /** Each seat's own draft in this phase, keyed by stable player ID. */
  teammateProgress: Record<string, PlayerProgress>;

  // Actions
  connect: () => void;
  disconnect: () => void;
  createRoom: (nickname: string) => void;
  joinRoom: (code: string, nickname: string) => void;
  selectTeam: (team: string) => void;
  leaveTeam: () => void;
  addAI: (team: string) => void;
  removeAI: (team: string, index: number) => void;
  startGame: () => void;
  submitClues: (clues: [string, string, string]) => void;
  submitIntercept: (guess: [number, number, number]) => void;
  submitDecrypt: (guess: [number, number, number]) => void;
  sendProgress: (
    action: string,
    step: number,
    opts?: {
      state?: "idle" | "editing" | "submitted";
      focus?: number;
      guesses?: number[];
      filled?: boolean[];
      clues?: string[];
    },
  ) => void;
  requestSync: () => void;
  returnToRoom: () => void;
  reset: () => void;
}

const initialState = {
  resumeToken: "",
  recovering: false,
  deadline: 0,
  submitted: false,
  aiNotice: "",
  error: null as string | null,
  connected: false,
  wsService: null as WebSocketService | null,
  phase: "home" as GamePhase,
  roomCode: null as string | null,
  players: [] as PlayerInfo[],
  teamA: [] as PlayerInfo[],
  teamB: [] as PlayerInfo[],
  ownerID: "",
  canStart: false,
  myPlayerID: "",
  voice: "",
  round: 0,
  myRole: "" as PlayerRole,
  myTeam: "",
  myWords: [] as string[],
  secretDigits: [] as number[],
  secretWords: [] as string[],
  clues: [] as string[],
  encryptor: "",
  encryptorID: "",
  history: [] as RoundHistoryRow[],
  waiting: false,
  scoreA: { interceptions: 0, decrypt_failures: 0 } as ScoreInfo,
  scoreB: { interceptions: 0, decrypt_failures: 0 } as ScoreInfo,
  scoreChange: null as ScoreChange | null,
  roundResult: null as {
    intercept_success?: boolean;
    decrypt_success?: boolean;
  } | null,
  gameOver: null as GameOverInfo | null,
  timeouts: [] as TimeoutInfo[],
  pendingLobby: false,
  actions: {} as GameStore["actions"],
  aiStatus: {} as GameStore["aiStatus"],
  playerProgress: {} as GameStore["playerProgress"],
  teammateProgress: {} as GameStore["teammateProgress"],
};

type SetFn = (
  partial:
    | GameStore
    | Partial<GameStore>
    | ((state: GameStore) => GameStore | Partial<GameStore>),
  replace?: false,
) => void;

type GetFn = () => GameStore;

const sessionKey = "decrypto-session-v1";
const deviceKey = "decrypto-device-v1";

// Server clock minus this device's clock. Each message carries the server time
// it was sent at; the true offset is that sample plus the network delay, so the
// largest recent sample is the best estimate. Deadlines are then kept in this
// device's clock, whatever its system time says.
let clockSamples: number[] = [];
export function clockOffset() {
  return clockSamples.length ? Math.max(...clockSamples) : 0;
}
export function noteServerTime(serverTime: number | undefined, now = Date.now()) {
  if (!serverTime) return;
  clockSamples = [...clockSamples.slice(-15), serverTime - now];
}
export function localDeadline(serverDeadline: unknown) {
  const value = Number(serverDeadline) || 0;
  return value ? value - clockOffset() : 0;
}
export function resetClock() { clockSamples = []; }

/** Everything that belongs to one game, cleared when the room reopens. */
const gameFields = {
  deadline: 0, submitted: false, aiNotice: "", round: 0, myRole: "" as PlayerRole, myTeam: "", myWords: [] as string[],
  secretDigits: [] as number[], secretWords: [] as string[], clues: [] as string[], encryptor: "", encryptorID: "", history: [] as RoundHistoryRow[],
  waiting: false, scoreA: { interceptions: 0, decrypt_failures: 0 }, scoreB: { interceptions: 0, decrypt_failures: 0 },
  roundResult: null, gameOver: null, timeouts: [] as TimeoutInfo[], actions: {}, aiStatus: {}, playerProgress: {}, teammateProgress: {}, scoreChange: null,
};

/** The action a seat takes in a phase, or "" for a seat that only watches. */
export function seatAction(phase: string, role: string, round: number): GameAction | "" {
  if (phase === "encrypting" && role === "encryptor") return "encrypt";
  if (phase === "guess" && role === "teammate") return "decrypt";
  if (phase === "guess" && role === "opponent" && round > 2) return "intercept";
  return "";
}

function actionsFrom(data: unknown): GameStore["actions"] {
  const actions: GameStore["actions"] = {};
  for (const [name, value] of Object.entries((data as Record<string, Record<string, unknown>> | undefined) ?? {})) {
    if (name !== "encrypt" && name !== "decrypt" && name !== "intercept") continue;
    actions[name] = { team: String(value.team ?? ""), deadline: localDeadline(value.deadline), submitted: !!value.submitted };
  }
  return actions;
}

function aiStatusFrom(d: Record<string, unknown>): AIStatus {
  return { action: String(d.action), player: String(d.player), state: String(d.state || "thinking"),
    step: Number(d.step) || 1, completed: Number(d.completed) || 0, total: Number(d.total) || 3 };
}

function playerProgressFrom(d: Record<string, unknown>): PlayerProgress {
  const guesses = Array.isArray(d.guesses) ? d.guesses : undefined;
  const states: PlayerProgressState[] = ["idle", "editing", "thinking", "retrying", "ready", "unavailable", "submitted"];
  return {
    round: typeof d.round === "number" ? d.round : undefined,
    action: String(d.action ?? ""), player: String(d.player ?? ""),
    player_id: typeof d.player_id === "string" ? d.player_id : undefined,
    is_ai: !!d.is_ai, suggestion: !!d.suggestion,
    can_submit: typeof d.can_submit === "boolean" ? d.can_submit : !d.is_ai,
    state: states.includes(d.state as PlayerProgressState) ? d.state as PlayerProgressState : "idle",
    step: Math.max(0, Math.min(3, Number(d.step) || 0)),
    focus: [1, 2, 3].includes(Number(d.focus)) ? Number(d.focus) : 0,
    guesses: guesses ? Array.from({ length: 3 }, (_, index) => {
      const digit = guesses[index];
      return typeof digit === "number" && Number.isInteger(digit) && digit >= 1 && digit <= 4 ? digit : 0;
    }) : undefined,
    filled: Array.isArray(d.filled) ? d.filled.slice(0, 3).map(Boolean) : undefined,
    total: 3,
  };
}

function currentProgress(progress: PlayerProgress, phase: string, round: number) {
  return (progress.round === undefined || progress.round === round) &&
    (phase === "encrypting" ? progress.action === "encrypt" : phase === "guess" &&
      (progress.action === "decrypt" || progress.action === "intercept" && round > 2));
}

function teammateProgressFrom(data: unknown, phase: string, round: number): GameStore["teammateProgress"] {
  const result: GameStore["teammateProgress"] = {};
  if (!data || typeof data !== "object") return result;
  for (const [id, value] of Object.entries(data)) {
    if (!value || typeof value !== "object") continue;
    const progress = playerProgressFrom(value as Record<string, unknown>);
    if (progress.player_id === id && currentProgress(progress, phase, round)) result[id] = progress;
  }
  return result;
}

function aggregateProgress(progress: GameStore["teammateProgress"]): GameStore["playerProgress"] {
  const result: GameStore["playerProgress"] = {};
  // Snapshot maps carry no event order. The accepted answer always wins, then
  // the most advanced draft; an idle or advisory seat cannot erase submission.
  const rank = (value: PlayerProgress) => value.state === "submitted" && !value.suggestion ? 100 :
    value.step * 3 + (value.state === "thinking" || value.state === "retrying" ? 2 : value.state === "idle" ? 0 : 1);
  for (const value of Object.values(progress)) {
    const previous = result[value.action];
    if (!previous || rank(value) > rank(previous)) result[value.action] = value;
  }
  return result;
}

function gameOverInfo(d: Record<string, unknown>): GameOverInfo {
  return { winner: (d.winner as string | null) ?? null, reason: d.reason as string | undefined,
    wordsA: d.words_a as string[] | undefined, wordsB: d.words_b as string[] | undefined };
}
function savedSession(): { roomCode: string; resumeToken: string } | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(sessionKey) || "null");
    return typeof value?.roomCode === "string" && typeof value?.resumeToken === "string" && value.resumeToken ? value : null;
  } catch { return null; }
}
function saveSession(value: { roomCode: string; resumeToken: string } | null) {
  try {
    if (value) sessionStorage.setItem(sessionKey, JSON.stringify(value));
    else sessionStorage.removeItem(sessionKey);
  } catch { /* Resume still works in memory when storage is blocked. */ }
}

/** A secret this browser keeps for good, so the server can tell which rooms one
 *  browser opened and entered. The server keeps only its hash. */
function deviceToken(): string {
  try {
    const saved = localStorage.getItem(deviceKey) || "";
    if (/^[0-9a-f]{64}$/.test(saved)) return saved;
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(deviceKey, token);
    return token;
  } catch { return ""; /* Without storage this browser stays unnamed. */ }
}

// Signals of the voice service go to the voice controller, which is loaded with
// the voice controls.
let voiceListener: ((signal: unknown) => void) | null = null;
export function listenVoice(listener: (signal: unknown) => void) {
  voiceListener = listener;
}

function handleServerMessage(
  set: SetFn,
  get: GetFn,
  type: string,
  data: unknown,
  serverTime?: number,
) {
  const d = data as Record<string, unknown>;
  noteServerTime(serverTime);

  switch (type) {
    case "_connected":
      set({ connected: true });
      if (get().roomCode && get().resumeToken) {
        set({ recovering: true });
        get().wsService?.send("resume_room", { room_code: get().roomCode, resume_token: get().resumeToken });
      }
      break;

    case "_disconnected":
      set({ scoreChange: null });
      if (get().resumeToken) {
        set({ connected: false, recovering: true, error: "连接已中断，正在恢复原座位…" });
      } else if (get().roomCode) {
        set({ ...initialState, wsService: get().wsService, error: "连接已中断，请重新加入房间。" });
      } else set({ connected: false });
      break;

    case "room_resumed":
      set({ roomCode: d.room_code as string, myPlayerID: d.my_player_id as string, voice: String(d.voice ?? "") });
      break;

    case "voice_signal":
      voiceListener?.(data);
      break;

    case "room_created":
      if (d.resume_token) saveSession({ roomCode: d.room_code as string, resumeToken: d.resume_token as string });
      set({
        resumeToken: (d.resume_token as string) ?? "",
        recovering: false,
        roomCode: d.room_code as string,
        myPlayerID: (d.my_player_id as string) ?? "",
        voice: String(d.voice ?? ""),
        phase: "room",
      });
      break;

    case "room_state": {
      // A reopened room waits on the final screen until this player moves on.
      const lobby = !d.started && (get().phase !== "game_over" || get().pendingLobby);
      set({
        ...(lobby && get().phase !== "room" && get().phase !== "home" ? { ...gameFields, pendingLobby: false } : {}),
        phase: d.started ? get().phase : lobby ? "room" : get().phase,
        roomCode: (d.room_code as string) ?? get().roomCode,
        players: (d.players as PlayerInfo[]) ?? [],
        teamA: (d.team_a as PlayerInfo[]) ?? [],
        teamB: (d.team_b as PlayerInfo[]) ?? [],
        ownerID: (d.owner_id as string) ?? "",
        canStart: (d.can_start as boolean) ?? false,
        myPlayerID: (d.my_player_id as string) ?? get().myPlayerID,
      });
      break;
    }

    case "game_start":
      set({
        playerProgress: {}, teammateProgress: {}, encryptorID: "",
        round: (d.round as number) ?? 0,
        myRole: (d.your_role as PlayerRole) ?? "",
        myTeam: (d.your_team as string) ?? "",
        myWords: (d.words as string[]) ?? [],
      });
      break;

    case "phase_change": {
      const newPhase = d.phase as string;
      const progress = teammateProgressFrom(d.teammate_progress, newPhase === "new_round" ? "encrypting" : newPhase,
        (d.round as number) ?? get().round);
      set({ deadline: localDeadline(d.deadline), submitted: !!d.submitted, aiNotice: String(d.notice || ""), recovering: false,
        actions: actionsFrom(d.actions) });
      if (get().timeouts.some(timeout => timeout.round !== ((d.round as number) ?? get().round))) set({ timeouts: [] });
      if (newPhase === "new_round") {
        // Map new_round to the correct GamePhase based on role
        const role = (d.your_role as PlayerRole) ?? get().myRole;
        const nextPhase: GamePhase = "encrypting";
        set({
          phase: nextPhase,
          round: (d.round as number) ?? get().round,
          myRole: role,
          encryptor: (d.encryptor as string) ?? "",
          encryptorID: (d.encryptor_id as string) ?? "",
          secretDigits: (d.secret_digits as number[]) ?? [],
          secretWords: (d.secret_words as string[]) ?? [],
          clues: (d.clues as string[]) ?? [],
          history: (d.history as RoundHistoryRow[]) ?? get().history,
          waiting: (d.waiting as boolean) ?? false,
          roundResult: null,
          aiStatus: {},
          playerProgress: aggregateProgress(progress),
          teammateProgress: progress,
        });
      } else {
        set({
          phase: newPhase as GamePhase,
          round: (d.round as number) ?? get().round,
          myRole: (d.your_role as PlayerRole) ?? get().myRole,
          encryptor: (d.encryptor as string) ?? "",
          encryptorID: (d.encryptor_id as string) ?? "",
          secretDigits: (d.secret_digits as number[]) ?? [],
          secretWords: (d.secret_words as string[]) ?? [],
          clues: (d.clues as string[]) ?? (newPhase === "encrypting" ? [] : get().clues),
          history: (d.history as RoundHistoryRow[]) ?? get().history,
          waiting: (d.waiting as boolean) ?? false,
          roundResult: null,
          aiStatus: {},
          playerProgress: aggregateProgress(progress),
          teammateProgress: progress,
        });
      }
      break;
    }

    case "action_submitted": {
      // A team answered while the phase goes on for the other.
      const name = d.action as GameAction, round = Number(d.round), state = get();
      const known = state.actions[name];
      if (round !== state.round || state.phase !== "guess" || !known) break;
      const mine = seatAction(state.phase, state.myRole, state.round) === name;
      set({ actions: { ...state.actions, [name]: { ...known, submitted: true } },
        ...(mine ? { submitted: true, waiting: true } : {}) });
      break;
    }

    case "clues_submitted":
      set({
        clues: (d.clues as string[]) ?? [],
        history: (d.history as RoundHistoryRow[]) ?? get().history,
      });
      break;

    case "round_result": {
      const before = get();
      const scoreA = (d.score_a as ScoreInfo) ?? before.scoreA;
      const scoreB = (d.score_b as ScoreInfo) ?? before.scoreB;
      const changes: ScoreChange["changes"] = [];
      if (before.connected && !before.recovering && before.roomCode) {
        for (const team of ["A", "B"] as const) {
          const old = team === "A" ? before.scoreA : before.scoreB;
          const next = team === "A" ? scoreA : scoreB;
          if (d.intercept_success === true && next.interceptions > old.interceptions)
            changes.push({ team, kind: "intercept", total: next.interceptions });
          if (d.decrypt_success === false && next.decrypt_failures > old.decrypt_failures)
            changes.push({ team, kind: "failure", total: next.decrypt_failures });
        }
      }
      set({
        aiNotice: String(d.notice || get().aiNotice),
        deadline: 0,
        history: (d.history as RoundHistoryRow[]) ?? get().history,
        // One message reveals the round: both verdicts arrive together.
        roundResult: {
          ...(typeof d.intercept_success === "boolean"
            ? { intercept_success: d.intercept_success }
            : {}),
          ...(typeof d.decrypt_success === "boolean"
            ? { decrypt_success: d.decrypt_success }
            : {}),
        },
        actions: {},
        playerProgress: {}, teammateProgress: {},
        submitted: false,
        waiting: true,
        scoreA, scoreB,
        // Keep the event through the complete history and immediate game_over packets.
        scoreChange: changes.length ? { id: ++scoreSerial, at: Date.now(), round: before.round, changes } : before.scoreChange,
        phase: "round_result",
      });
      break;
    }

    case "game_over":
      set({
        aiNotice: String(d.notice || get().aiNotice),
        deadline: 0,
        round: Number(d.round) || get().round,
        history: (d.history as RoundHistoryRow[]) ?? get().history,
        gameOver: gameOverInfo(d),
        scoreA: (d.score_a as ScoreInfo) ?? get().scoreA,
        scoreB: (d.score_b as ScoreInfo) ?? get().scoreB,
        phase: "game_over",
        playerProgress: {}, teammateProgress: {},
      });
      break;

    case "full_sync": {
      set({ recovering: false, error: null, scoreChange: null });
      const roomData = d.room as Record<string, unknown> | undefined;
      const gameData = d.game as Record<string, unknown> | undefined;

      if (roomData) {
        set({
          roomCode: (roomData.room_code as string) ?? get().roomCode,
          players: (roomData.players as PlayerInfo[]) ?? [],
          teamA: (roomData.team_a as PlayerInfo[]) ?? [],
          teamB: (roomData.team_b as PlayerInfo[]) ?? [],
          ownerID: (roomData.owner_id as string) ?? "",
          canStart: (roomData.can_start as boolean) ?? false,
          myPlayerID: (roomData.my_player_id as string) ?? get().myPlayerID,
        });
      }

      if (gameData) {
        const phase = ({ new: "encrypting", init: "encrypting", done: "round_result" } as Record<string, GamePhase>)[String(gameData.phase)] ?? (gameData.phase as GamePhase) ?? get().phase;
        const round = (gameData.round as number) ?? get().round;
        const teammateProgress = teammateProgressFrom(gameData.teammate_progress, phase, round);
        set({
          deadline: localDeadline(gameData.deadline),
          timeouts: (gameData.timeouts as TimeoutInfo[]) ?? [],
          submitted: !!gameData.submitted,
          actions: actionsFrom(gameData.actions),
          roundResult: (gameData.round_result as GameStore["roundResult"]) ?? null,
          aiStatus: Object.fromEntries(Object.entries((gameData.ai_status as Record<string, Record<string, unknown>>) ?? {})
            .map(([name, status]) => [name, aiStatusFrom(status)])),
          teammateProgress,
          // A full snapshot replaces any pre-disconnect progress. Retain the
          // aggregate signal for existing watcher screens as well.
          playerProgress: aggregateProgress(teammateProgress),
          aiNotice: String(gameData.notice || ""),
          gameOver: gameData.game_over ? gameOverInfo(gameData.game_over as Record<string, unknown>) : null,
          round,
          myRole: (gameData.your_role as PlayerRole) ?? get().myRole,
          myTeam: (gameData.your_team as string) ?? get().myTeam,
          myWords: (gameData.words as string[]) ?? get().myWords,
          secretDigits: (gameData.secret_digits as number[]) ?? [],
          secretWords: (gameData.secret_words as string[]) ?? [],
          clues: (gameData.clues as string[]) ?? [],
          encryptor: (gameData.encryptor as string) ?? "",
          encryptorID: (gameData.encryptor_id as string) ?? "",
          history: (gameData.history as RoundHistoryRow[]) ?? [],
          waiting: (gameData.waiting as boolean) ?? false,
          scoreA: (gameData.score_a as ScoreInfo) ?? get().scoreA,
          scoreB: (gameData.score_b as ScoreInfo) ?? get().scoreB,
          phase,
        });
      } else if (roomData) {
        set({ ...gameFields, phase: "room", pendingLobby: false });
      } else {
        set({
          ...initialState,
          wsService: get().wsService,
          connected: get().connected,
          error: "原房间连接已失效，请重新加入。",
        });
      }
      break;
    }

    case "ai_thinking":
    case "ai_acted": {
      const status = aiStatusFrom(d);
      set({
        aiStatus: { ...get().aiStatus, [status.action]: status },
        aiNotice: get().aiNotice.startsWith('AI 未能') ? get().aiNotice : String(d.notice || ''),
      });
      break;
    }

    case "timeout": {
      // Both teams may run out of time in one phase: keep each action's notice.
      const timeout = d as unknown as TimeoutInfo;
      const kept = get().timeouts.filter(item => item.round === timeout.round && item.action !== timeout.action);
      set({ timeouts: [...kept, timeout] });
      break;
    }

    case "player_progress": {
      const state = get(), progress = playerProgressFrom(d), action = progress.action as GameAction;
      if (!currentProgress(progress, state.phase, state.round) ||
          state.actions[action]?.submitted && progress.state !== "submitted") break;
      set({
        playerProgress: { ...state.playerProgress, [action]: progress },
        ...(progress.player_id ? { teammateProgress: { ...state.teammateProgress, [progress.player_id]: progress } } : {}),
      });
      break;
    }

    case "error":
      if (d.code === "resume_expired") {
        saveSession(null);
        set({ ...initialState, connected: get().connected, wsService: get().wsService });
      }
      set({ error: translateError(String(d.message ?? "操作失败，请重试。")) });
      break;

    default:
      break;
  }
}

function translateError(message: string): string {
  const errors: Record<string, string> = {
    "room not found": "没有找到这个房间，请检查四位房间码。",
    "game already started": "该房间的行动已经开始，请加入其他房间。",
    "only the room owner can start the game": "只有房主可以开始行动。",
    "you are not the current encryptor": "本回合由另一位特工发送线索。",
    "clues already submitted": "线索已提交，请等待下一阶段。",
    "intercept already submitted": "队伍已提交拦截密码，请等待结果。",
    "decrypt already submitted": "队伍已提交解密密码，请等待结果。",
  };
  return errors[message] ?? message;
}

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,

  clearError() {
    set({ error: null });
  },

  connect() {
    if (get().wsService) return;
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${protocol}://${window.location.host}/ws`;
    const ws = new WebSocketService(url, (type: string, data: unknown, serverTime?: number) => {
      handleServerMessage(set, get, type, data, serverTime);
    });
    const previous = get().resumeToken ? null : savedSession();
    set({ wsService: ws, ...(previous ? { ...previous, recovering: true } : {}) });
    ws.connect();
  },

  disconnect() {
    get().wsService?.disconnect();
    set({ ...initialState });
  },

  createRoom(nickname: string) {
    get().wsService?.send("create_room", { nickname, device_token: deviceToken() });
  },

  joinRoom(code: string, nickname: string) {
    get().wsService?.send("join_room", { room_code: code, nickname, device_token: deviceToken() });
  },

  selectTeam(team: string) {
    get().wsService?.send("select_team", { team });
  },

  leaveTeam() {
    get().wsService?.send("leave_team", {});
  },

  addAI(team: string) {
    get().wsService?.send("add_ai", { team });
  },

  removeAI(team: string, index: number) {
    get().wsService?.send("remove_ai", { team, index });
  },

  startGame() {
    get().wsService?.send("start_game", {});
  },

  submitClues(clues: [string, string, string]) {
    get().wsService?.send("submit_clues", { clues, round: get().round });
  },

  submitIntercept(guess: [number, number, number]) {
    get().wsService?.send("submit_intercept", { guess, round: get().round });
  },

  submitDecrypt(guess: [number, number, number]) {
    get().wsService?.send("submit_decrypt", { guess, round: get().round });
  },

  sendProgress(action, step, opts) {
    get().wsService?.send("progress", {
      round: get().round,
      action,
      step,
      total: 3,
      state: opts?.state,
      focus: opts?.focus ?? 0,
      guesses: opts?.guesses,
      filled: opts?.filled,
      clues: opts?.clues,
    });
  },

  returnToRoom() {
    // The first request reopens the room; the lobby then arrives as room_state.
    set({ pendingLobby: true });
    get().wsService?.send("reopen_room", {});
  },

  requestSync() {
    get().wsService?.send("request_sync", {});
  },

  reset() {
    saveSession(null);
    get().wsService?.disconnect();
    set({ ...initialState });
  },
}));
