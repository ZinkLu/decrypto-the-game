import { create } from "zustand";
import { WebSocketService } from "@/services/websocket";

export interface PlayerInfo {
  id: string;
  nickname: string;
  is_ai: boolean;
}

export interface ScoreInfo {
  interceptions: number;
  decrypt_failures: number;
}

export interface RoundHistoryRow {
  round: number;
  team: string;
  clues: string[];
  secret?: number[];
  intercept?: number[];
  decrypt?: number[];
}

export type GamePhase =
  | "home"
  | "room"
  | "encrypting"
  | "intercept"
  | "decrypt"
  | "round_result"
  | "game_over";

export type PlayerRole = "encryptor" | "teammate" | "opponent" | "";

interface GameStore {
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
  roundResult: {
    intercept_success?: boolean;
    decrypt_success?: boolean;
  } | null;
  gameOver: { winner: string | null } | null;
  aiStatus: {
    action: string;
    player: string;
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
    },
  ) => void;
  requestSync: () => void;
  reset: () => void;
}

const initialState = {
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
  roundResult: null as {
    intercept_success?: boolean;
    decrypt_success?: boolean;
  } | null,
  gameOver: null as { winner: string | null } | null,
  aiStatus: null as {
    action: string;
    player: string;
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

function handleServerMessage(
  set: SetFn,
  get: GetFn,
  type: string,
  data: unknown,
) {
  const d = data as Record<string, unknown>;

  switch (type) {
    case "_connected":
      set({ connected: true });
      if (get().roomCode) {
        get().wsService?.send("request_sync", {});
      }
      break;

    case "_disconnected":
      if (get().roomCode) {
        set({
          ...initialState,
          wsService: get().wsService,
          error:
            "连接已中断。当前服务器暂不支持找回原座位，请重新建立或加入房间。",
        });
      } else {
        set({ connected: false });
      }
      break;

    case "room_created":
      set({
        roomCode: d.room_code as string,
        myPlayerID: (d.my_player_id as string) ?? "",
        phase: "room",
      });
      break;

    case "room_state":
      set({
        phase: "room",
        roomCode: (d.room_code as string) ?? get().roomCode,
        players: (d.players as PlayerInfo[]) ?? [],
        teamA: (d.team_a as PlayerInfo[]) ?? [],
        teamB: (d.team_b as PlayerInfo[]) ?? [],
        ownerID: (d.owner_id as string) ?? "",
        canStart: (d.can_start as boolean) ?? false,
        myPlayerID: (d.my_player_id as string) ?? get().myPlayerID,
      });
      break;

    case "game_start":
      set({
        round: (d.round as number) ?? 0,
        myRole: (d.your_role as PlayerRole) ?? "",
        myTeam: (d.your_team as string) ?? "",
        myWords: (d.words as string[]) ?? [],
      });
      break;

    case "phase_change": {
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
          clues: (d.clues as string[]) ?? get().clues,
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
          clues: (d.clues as string[]) ?? get().clues,
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

    case "round_result":
      set({
        roundResult: {
          ...get().roundResult,
          ...(typeof d.intercept_success === "boolean"
            ? { intercept_success: d.intercept_success }
            : {}),
          ...(typeof d.decrypt_success === "boolean"
            ? { decrypt_success: d.decrypt_success }
            : {}),
        },
        scoreA: (d.score_a as ScoreInfo) ?? get().scoreA,
        scoreB: (d.score_b as ScoreInfo) ?? get().scoreB,
        phase: "round_result",
      });
      break;

    case "game_over":
      set({
        gameOver: { winner: (d.winner as string | null) ?? null },
        scoreA: (d.score_a as ScoreInfo) ?? get().scoreA,
        scoreB: (d.score_b as ScoreInfo) ?? get().scoreB,
        phase: "game_over",
      });
      break;

    case "full_sync": {
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
          phase: (gameData.phase as GamePhase) ?? get().phase,
        });
      } else if (roomData) {
        set({ phase: "room" });
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
      set({
        aiStatus: {
          action: d.action as string,
          player: d.player as string,
          step: (d.step as number) ?? 1,
          total: (d.total as number) ?? 3,
        },
      });
      break;

    case "ai_acted":
      set({ aiStatus: null });
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
          total: (d.total as number) ?? 3,
        },
      });
      break;

    case "error":
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
    const ws = new WebSocketService(url, (type: string, data: unknown) => {
      handleServerMessage(set, get, type, data);
    });
    set({ wsService: ws });
    ws.connect();
  },

  disconnect() {
    get().wsService?.disconnect();
    set({ ...initialState });
  },

  createRoom(nickname: string) {
    get().wsService?.send("create_room", { nickname });
  },

  joinRoom(code: string, nickname: string) {
    get().wsService?.send("join_room", { room_code: code, nickname });
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
    get().wsService?.send("submit_clues", { clues });
  },

  submitIntercept(guess: [number, number, number]) {
    get().wsService?.send("submit_intercept", { guess });
  },

  submitDecrypt(guess: [number, number, number]) {
    get().wsService?.send("submit_decrypt", { guess });
  },

  sendProgress(action, step, opts) {
    get().wsService?.send("progress", {
      action,
      step,
      total: 3,
      state: opts?.state,
      focus: opts?.focus ?? 0,
      guesses: opts?.guesses,
    });
  },

  requestSync() {
    get().wsService?.send("request_sync", {});
  },

  reset() {
    get().wsService?.disconnect();
    set({ ...initialState });
  },
}));
