import { create } from 'zustand';
import { WebSocketService } from '@/services/websocket';

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
  | 'home'
  | 'room'
  | 'encrypting'
  | 'intercept'
  | 'decrypt'
  | 'round_result'
  | 'game_over';

export type PlayerRole = 'encryptor' | 'teammate' | 'opponent' | '';

interface GameStore {
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
  roundResult: { intercept_success?: boolean; decrypt_success?: boolean } | null;
  gameOver: { winner: string | null } | null;
  aiStatus: { action: string; player: string } | null;

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
  requestSync: () => void;
  reset: () => void;
}

const initialState = {
  connected: false,
  wsService: null as WebSocketService | null,
  phase: 'home' as GamePhase,
  roomCode: null as string | null,
  players: [] as PlayerInfo[],
  teamA: [] as PlayerInfo[],
  teamB: [] as PlayerInfo[],
  ownerID: '',
  canStart: false,
  myPlayerID: '',
  round: 0,
  myRole: '' as PlayerRole,
  myTeam: '',
  myWords: [] as string[],
  secretDigits: [] as number[],
  secretWords: [] as string[],
  clues: [] as string[],
  encryptor: '',
  history: [] as RoundHistoryRow[],
  waiting: false,
  scoreA: { interceptions: 0, decrypt_failures: 0 } as ScoreInfo,
  scoreB: { interceptions: 0, decrypt_failures: 0 } as ScoreInfo,
  roundResult: null as { intercept_success?: boolean; decrypt_success?: boolean } | null,
  gameOver: null as { winner: string | null } | null,
  aiStatus: null as { action: string; player: string } | null,
};

type SetFn = (
  partial:
    | GameStore
    | Partial<GameStore>
    | ((state: GameStore) => GameStore | Partial<GameStore>),
  replace?: false
) => void;

type GetFn = () => GameStore;

function handleServerMessage(set: SetFn, get: GetFn, type: string, data: unknown) {
  const d = data as Record<string, unknown>;

  switch (type) {
    case '_connected':
      set({ connected: true });
      if (get().roomCode) {
        get().wsService?.send('request_sync', {});
      }
      break;

    case '_disconnected':
      set({ connected: false });
      break;

    case 'room_created':
      set({
        roomCode: d.room_code as string,
        myPlayerID: (d.my_player_id as string) ?? '',
        phase: 'room',
      });
      break;

    case 'room_state':
      set({
        phase: 'room',
        roomCode: (d.room_code as string) ?? get().roomCode,
        players: (d.players as PlayerInfo[]) ?? [],
        teamA: (d.team_a as PlayerInfo[]) ?? [],
        teamB: (d.team_b as PlayerInfo[]) ?? [],
        ownerID: (d.owner_id as string) ?? '',
        canStart: (d.can_start as boolean) ?? false,
        myPlayerID: (d.my_player_id as string) ?? get().myPlayerID,
      });
      break;

    case 'game_start':
      set({
        round: (d.round as number) ?? 0,
        myRole: (d.your_role as PlayerRole) ?? '',
        myTeam: (d.your_team as string) ?? '',
        myWords: (d.words as string[]) ?? [],
      });
      break;

    case 'phase_change': {
      const newPhase = d.phase as string;
      if (newPhase === 'new_round') {
        set({
          round: (d.round as number) ?? get().round,
          myRole: (d.your_role as PlayerRole) ?? get().myRole,
          encryptor: (d.encryptor as string) ?? '',
          secretDigits: (d.secret_digits as number[]) ?? [],
          secretWords: (d.secret_words as string[]) ?? [],
          clues: (d.clues as string[]) ?? [],
          history: (d.history as RoundHistoryRow[]) ?? get().history,
          waiting: (d.waiting as boolean) ?? false,
          roundResult: null,
        });
      } else {
        set({
          phase: newPhase as GamePhase,
          round: (d.round as number) ?? get().round,
          myRole: (d.your_role as PlayerRole) ?? get().myRole,
          encryptor: (d.encryptor as string) ?? '',
          secretDigits: (d.secret_digits as number[]) ?? [],
          secretWords: (d.secret_words as string[]) ?? [],
          clues: (d.clues as string[]) ?? [],
          history: (d.history as RoundHistoryRow[]) ?? get().history,
          waiting: (d.waiting as boolean) ?? false,
          roundResult: null,
          aiStatus: null,
        });
      }
      break;
    }

    case 'clues_submitted':
      set({ clues: (d.clues as string[]) ?? [] });
      break;

    case 'round_result':
      set({
        roundResult: {
          intercept_success: d.intercept_success as boolean | undefined,
          decrypt_success: d.decrypt_success as boolean | undefined,
        },
        scoreA: (d.score_a as ScoreInfo) ?? get().scoreA,
        scoreB: (d.score_b as ScoreInfo) ?? get().scoreB,
        phase: 'round_result',
      });
      break;

    case 'game_over':
      set({
        gameOver: { winner: (d.winner as string | null) ?? null },
        scoreA: (d.score_a as ScoreInfo) ?? get().scoreA,
        scoreB: (d.score_b as ScoreInfo) ?? get().scoreB,
        phase: 'game_over',
      });
      break;

    case 'full_sync': {
      const roomData = d.room as Record<string, unknown> | undefined;
      const gameData = d.game as Record<string, unknown> | undefined;

      if (roomData) {
        set({
          roomCode: (roomData.room_code as string) ?? get().roomCode,
          players: (roomData.players as PlayerInfo[]) ?? [],
          teamA: (roomData.team_a as PlayerInfo[]) ?? [],
          teamB: (roomData.team_b as PlayerInfo[]) ?? [],
          ownerID: (roomData.owner_id as string) ?? '',
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
          encryptor: (gameData.encryptor as string) ?? '',
          history: (gameData.history as RoundHistoryRow[]) ?? [],
          waiting: (gameData.waiting as boolean) ?? false,
          scoreA: (gameData.score_a as ScoreInfo) ?? get().scoreA,
          scoreB: (gameData.score_b as ScoreInfo) ?? get().scoreB,
          phase: (gameData.phase as GamePhase) ?? get().phase,
        });
      } else {
        set({ phase: 'room' });
      }
      break;
    }

    case 'ai_thinking':
      set({
        aiStatus: {
          action: d.action as string,
          player: d.player as string,
        },
      });
      break;

    case 'ai_acted':
      set({ aiStatus: null });
      break;

    case 'error':
      console.error('Server error:', d);
      break;

    default:
      break;
  }
}

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${window.location.host}/ws`;
    const ws = new WebSocketService(url, (type: string, data: unknown) => {
      handleServerMessage(set, get, type, data);
    });
    set({ wsService: ws });
    ws.connect();
  },

  disconnect() {
    get().wsService?.disconnect();
    set({ wsService: null, connected: false });
  },

  createRoom(nickname: string) {
    get().wsService?.send('create_room', { nickname });
  },

  joinRoom(code: string, nickname: string) {
    get().wsService?.send('join_room', { code, nickname });
  },

  selectTeam(team: string) {
    get().wsService?.send('select_team', { team });
  },

  leaveTeam() {
    get().wsService?.send('leave_team', {});
  },

  addAI(team: string) {
    get().wsService?.send('add_ai', { team });
  },

  removeAI(team: string, index: number) {
    get().wsService?.send('remove_ai', { team, index });
  },

  startGame() {
    get().wsService?.send('start_game', {});
  },

  submitClues(clues: [string, string, string]) {
    get().wsService?.send('submit_clues', { clues });
  },

  submitIntercept(guess: [number, number, number]) {
    get().wsService?.send('submit_intercept', { guess });
  },

  submitDecrypt(guess: [number, number, number]) {
    get().wsService?.send('submit_decrypt', { guess });
  },

  requestSync() {
    get().wsService?.send('request_sync', {});
  },

  reset() {
    get().wsService?.disconnect();
    set({ ...initialState });
  },
}));
