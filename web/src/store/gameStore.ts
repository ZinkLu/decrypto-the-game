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
  action: "encrypt" | "intercept" | "decrypt";
  team: string;
  player?: string;
  /** "draft" | "blank" for clues, "guess" | "none" for guesses. */
  outcome: string;
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
  | "intercept"
  | "decrypt"
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

  // Game state
  round: number;
  myRole: PlayerRole;
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
  scoreChange: ScoreChange | null;
  roundResult: {
    intercept_success?: boolean;
    decrypt_success?: boolean;
  } | null;
  gameOver: GameOverInfo | null;
  timeout: TimeoutInfo | null;
  /** Set while this player asks to go back to the reopened lobby after a game. */
  pendingLobby: boolean;
  aiStatus: {
    action: string;
    player: string;
    state?: string;
    completed?: number;
    step: number;
    total: number;
  } | null;
  playerProgress: {
    action: string;
    player: string;
    state?: "idle" | "editing" | "submitted";
    step: number;
    focus?: number;
    guesses?: number[];
    /** Encryption only: which clue lines hold text, so out-of-order drafts read correctly. */
    filled?: boolean[];
    total: number;
  } | null;

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
  round: 0,
  myRole: "" as PlayerRole,
  myTeam: "",
  myWords: [] as string[],
  secretDigits: [] as number[],
  secretWords: [] as string[],
  clues: [] as string[],
  encryptor: "",
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
  timeout: null as TimeoutInfo | null,
  pendingLobby: false,
  aiStatus: null as {
    action: string;
    player: string;
    state?: string;
    completed?: number;
    step: number;
    total: number;
  } | null,
  playerProgress: null as {
    action: string;
    player: string;
    state?: "idle" | "editing" | "submitted";
    step: number;
    focus?: number;
    guesses?: number[];
    /** Encryption only: which clue lines hold text, so out-of-order drafts read correctly. */
    filled?: boolean[];
    total: number;
  } | null,
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
  secretDigits: [] as number[], secretWords: [] as string[], clues: [] as string[], encryptor: "", history: [] as RoundHistoryRow[],
  waiting: false, scoreA: { interceptions: 0, decrypt_failures: 0 }, scoreB: { interceptions: 0, decrypt_failures: 0 },
  roundResult: null, gameOver: null, timeout: null, aiStatus: null, playerProgress: null, scoreChange: null,
};

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
      set({ roomCode: d.room_code as string, myPlayerID: d.my_player_id as string });
      break;

    case "room_created":
      if (d.resume_token) saveSession({ roomCode: d.room_code as string, resumeToken: d.resume_token as string });
      set({
        resumeToken: (d.resume_token as string) ?? "",
        recovering: false,
        roomCode: d.room_code as string,
        myPlayerID: (d.my_player_id as string) ?? "",
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
        round: (d.round as number) ?? 0,
        myRole: (d.your_role as PlayerRole) ?? "",
        myTeam: (d.your_team as string) ?? "",
        myWords: (d.words as string[]) ?? [],
      });
      break;

    case "phase_change": {
      set({ deadline: localDeadline(d.deadline), submitted: false, aiNotice: String(d.notice || ""), recovering: false });
      if (get().timeout && get().timeout!.round !== ((d.round as number) ?? get().round)) set({ timeout: null });
      const newPhase = d.phase as string;
      if (newPhase === "new_round") {
        // Map new_round to the correct GamePhase based on role
        const role = (d.your_role as PlayerRole) ?? get().myRole;
        const nextPhase: GamePhase = "encrypting";
        set({
          phase: nextPhase,
          round: (d.round as number) ?? get().round,
          myRole: role,
          encryptor: (d.encryptor as string) ?? "",
          secretDigits: (d.secret_digits as number[]) ?? [],
          secretWords: (d.secret_words as string[]) ?? [],
          clues: (d.clues as string[]) ?? [],
          history: (d.history as RoundHistoryRow[]) ?? get().history,
          waiting: (d.waiting as boolean) ?? false,
          roundResult: null,
          aiStatus: null,
          playerProgress: null,
        });
      } else {
        set({
          phase: newPhase as GamePhase,
          round: (d.round as number) ?? get().round,
          myRole: (d.your_role as PlayerRole) ?? get().myRole,
          encryptor: (d.encryptor as string) ?? "",
          secretDigits: (d.secret_digits as number[]) ?? [],
          secretWords: (d.secret_words as string[]) ?? [],
          clues: (d.clues as string[]) ?? (newPhase === "encrypting" ? [] : get().clues),
          history: (d.history as RoundHistoryRow[]) ?? get().history,
          waiting: (d.waiting as boolean) ?? false,
          roundResult: newPhase === "decrypt" ? get().roundResult : null,
          aiStatus: null,
          playerProgress: null,
        });
      }
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
        roundResult: {
          ...get().roundResult,
          ...(typeof d.intercept_success === "boolean"
            ? { intercept_success: d.intercept_success }
            : {}),
          ...(typeof d.decrypt_success === "boolean"
            ? { decrypt_success: d.decrypt_success }
            : {}),
        },
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
        set({
          deadline: localDeadline(gameData.deadline),
          timeout: (gameData.timeout as TimeoutInfo) ?? null,
          submitted: !!gameData.submitted,
          roundResult: (gameData.round_result as GameStore["roundResult"]) ?? null,
          aiStatus: (gameData.ai_status as GameStore["aiStatus"]) ?? null,
          aiNotice: String(gameData.notice || ""),
          gameOver: gameData.game_over ? gameOverInfo(gameData.game_over as Record<string, unknown>) : null,
          round: (gameData.round as number) ?? get().round,
          myRole: (gameData.your_role as PlayerRole) ?? get().myRole,
          myTeam: (gameData.your_team as string) ?? get().myTeam,
          myWords: (gameData.words as string[]) ?? get().myWords,
          secretDigits: (gameData.secret_digits as number[]) ?? [],
          secretWords: (gameData.secret_words as string[]) ?? [],
          clues: (gameData.clues as string[]) ?? [],
          encryptor: (gameData.encryptor as string) ?? "",
          history: (gameData.history as RoundHistoryRow[]) ?? [],
          waiting: (gameData.waiting as boolean) ?? false,
          scoreA: (gameData.score_a as ScoreInfo) ?? get().scoreA,
          scoreB: (gameData.score_b as ScoreInfo) ?? get().scoreB,
          phase: ({ new: "encrypting", init: "encrypting", done: "round_result" } as Record<string, GamePhase>)[String(gameData.phase)] ?? (gameData.phase as GamePhase) ?? get().phase,
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
    case "ai_acted":
      set({
        aiStatus: { action: String(d.action), player: String(d.player), state: String(d.state || 'thinking'),
          step: Number(d.step) || 1, completed: Number(d.completed) || 0, total: Number(d.total) || 3 },
        aiNotice: get().aiNotice.startsWith('AI 未能') ? get().aiNotice : String(d.notice || ''),
      });
      break;

    case "timeout":
      set({ timeout: d as unknown as TimeoutInfo });
      break;

    case "player_progress":
      set({
        playerProgress: {
          action: d.action as string,
          player: d.player as string,
          state: d.state as "idle" | "editing" | "submitted" | undefined,
          step: (d.step as number) ?? 0,
          focus: (d.focus as number) ?? 0,
          guesses: (d.guesses as number[]) ?? undefined,
          filled: Array.isArray(d.filled) ? (d.filled as unknown[]).slice(0, 3).map(Boolean) : undefined,
          total: (d.total as number) ?? 3,
        },
      });
      break;

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
