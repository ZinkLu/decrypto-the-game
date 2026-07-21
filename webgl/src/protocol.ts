// Wire protocol types — the only contract with the Go backend.
// Mirrors internal/ws/message.go; see HANDOFF_THREEJS.md §4.

// --- Client -> Server ---
export const C = {
  CreateRoom: 'create_room',
  JoinRoom: 'join_room',
  SelectTeam: 'select_team',
  LeaveTeam: 'leave_team',
  AddAI: 'add_ai',
  RemoveAI: 'remove_ai',
  StartGame: 'start_game',
  SubmitClues: 'submit_clues',
  SubmitIntercept: 'submit_intercept',
  SubmitDecrypt: 'submit_decrypt',
  Progress: 'progress',
  RequestSync: 'request_sync',
} as const;

// --- Server -> Client ---
export const S = {
  RoomCreated: 'room_created',
  RoomState: 'room_state',
  GameStart: 'game_start',
  PhaseChange: 'phase_change',
  CluesSubmitted: 'clues_submitted',
  RoundResult: 'round_result',
  GameOver: 'game_over',
  FullSync: 'full_sync',
  AIThinking: 'ai_thinking',
  AIActed: 'ai_acted',
  PlayerProgress: 'player_progress',
  Error: 'error',
} as const;

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

/** phase_change.phase values. "new_round" = round N is about to start. */
export type WirePhase = 'encrypting' | 'intercept' | 'decrypt' | 'new_round';

export type Role = 'encryptor' | 'teammate' | 'opponent' | 'observer' | '';

export interface PhaseChangeData {
  phase: WirePhase;
  round: number;
  your_role: Role;
  encryptor: string; // encryptor nickname
  secret_digits?: number[];
  secret_words?: string[];
  clues?: string[];
  history?: RoundHistoryRow[];
  waiting?: boolean;
  /** Server-side phase timeout, unix ms. Absent = untimed phase. */
  deadline?: number;
}

export interface RoundResultData {
  intercept_success?: boolean;
  decrypt_success?: boolean;
  score_a: ScoreInfo;
  score_b: ScoreInfo;
}

export interface ProgressPayload {
  action: 'encrypt' | 'intercept' | 'decrypt';
  state?: 'idle' | 'editing' | 'submitted';
  step: number; // completed count 0-3
  focus?: number; // active slot 1-3, 0 if none
  guesses?: number[]; // per-slot digits 1-4, 0 = unfilled
  total: number; // always 3
}

export interface PlayerProgressData extends ProgressPayload {
  player: string;
}

export interface Envelope<T = unknown> {
  type: string;
  data: T;
}
