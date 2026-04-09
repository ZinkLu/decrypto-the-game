package ws

import "encoding/json"

// Client -> Server message type constants
const (
	MsgCreateRoom      = "create_room"
	MsgJoinRoom        = "join_room"
	MsgSelectTeam      = "select_team"
	MsgLeaveTeam       = "leave_team"
	MsgAddAI           = "add_ai"
	MsgRemoveAI        = "remove_ai"
	MsgStartGame       = "start_game"
	MsgSubmitClues     = "submit_clues"
	MsgSubmitIntercept = "submit_intercept"
	MsgSubmitDecrypt   = "submit_decrypt"
	MsgRequestSync     = "request_sync"
	MsgProgress        = "progress"
)

// Server -> Client message type constants
const (
	MsgRoomCreated    = "room_created"
	MsgRoomState      = "room_state"
	MsgGameStart      = "game_start"
	MsgPhaseChange    = "phase_change"
	MsgCluesSubmitted = "clues_submitted"
	MsgRoundResult    = "round_result"
	MsgGameOver       = "game_over"
	MsgFullSync       = "full_sync"
	MsgAIThinking     = "ai_thinking"
	MsgAIActed          = "ai_acted"
	MsgPlayerProgress   = "player_progress"
	MsgError            = "error"
)

// ClientMessage is a message sent from client to server.
type ClientMessage struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

// ServerMessage is a message sent from server to client.
type ServerMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

// --- Client message data types ---

// CreateRoomData is the data payload for MsgCreateRoom.
type CreateRoomData struct {
	Nickname string `json:"nickname"`
}

// JoinRoomData is the data payload for MsgJoinRoom.
type JoinRoomData struct {
	RoomCode string `json:"room_code"`
	Nickname string `json:"nickname"`
}

// SelectTeamData is the data payload for MsgSelectTeam.
type SelectTeamData struct {
	Team string `json:"team"`
}

// AddAIData is the data payload for MsgAddAI.
type AddAIData struct {
	Team string `json:"team"`
}

// RemoveAIData is the data payload for MsgRemoveAI.
type RemoveAIData struct {
	Team  string `json:"team"`
	Index int    `json:"index"`
}

// SubmitCluesData is the data payload for MsgSubmitClues.
type SubmitCluesData struct {
	Clues [3]string `json:"clues"`
}

// SubmitGuessData is the data payload for MsgSubmitIntercept and MsgSubmitDecrypt.
type SubmitGuessData struct {
	Guess [3]int `json:"guess"`
}

// --- Server message data types ---

// RoomCreatedData is the data payload for MsgRoomCreated.
type RoomCreatedData struct {
	RoomCode   string `json:"room_code"`
	MyPlayerID string `json:"my_player_id"`
}

// PlayerInfo represents a player in the room.
type PlayerInfo struct {
	ID       string `json:"id"`
	Nickname string `json:"nickname"`
	IsAI     bool   `json:"is_ai"`
}

// RoomStateData is the data payload for MsgRoomState.
type RoomStateData struct {
	RoomCode   string       `json:"room_code"`
	Players    []PlayerInfo `json:"players"`
	TeamA      []PlayerInfo `json:"team_a"`
	TeamB      []PlayerInfo `json:"team_b"`
	OwnerID    string       `json:"owner_id"`
	CanStart   bool         `json:"can_start"`
	MyPlayerID string       `json:"my_player_id,omitempty"`
}

// GameStartData is the data payload for MsgGameStart.
type GameStartData struct {
	Round    int      `json:"round"`
	YourRole string   `json:"your_role"`
	YourTeam string   `json:"your_team"`
	Words    []string `json:"words"`
}

// RoundHistoryRow represents a single row in the round history.
type RoundHistoryRow struct {
	Round     int    `json:"round"`
	Team      string `json:"team"`
	Clues     []string `json:"clues"`
	Secret    []int  `json:"secret,omitempty"`
	Intercept []int  `json:"intercept,omitempty"`
	Decrypt   []int  `json:"decrypt,omitempty"`
}

// PhaseChangeData is the data payload for MsgPhaseChange.
type PhaseChangeData struct {
	Phase        string            `json:"phase"`
	Round        int               `json:"round"`
	YourRole     string            `json:"your_role"`
	Encryptor    string            `json:"encryptor"`
	SecretDigits []int             `json:"secret_digits,omitempty"`
	SecretWords  []string          `json:"secret_words,omitempty"`
	Clues        []string          `json:"clues,omitempty"`
	History      []RoundHistoryRow `json:"history,omitempty"`
	Waiting      bool              `json:"waiting,omitempty"`
}

// ScoreInfo holds scoring information for a team.
type ScoreInfo struct {
	Interceptions   int `json:"interceptions"`
	DecryptFailures int `json:"decrypt_failures"`
}

// RoundResultData is the data payload for MsgRoundResult.
type RoundResultData struct {
	InterceptSuccess *bool     `json:"intercept_success,omitempty"`
	DecryptSuccess   *bool     `json:"decrypt_success,omitempty"`
	ScoreA           ScoreInfo `json:"score_a"`
	ScoreB           ScoreInfo `json:"score_b"`
}

// GameOverData is the data payload for MsgGameOver.
type GameOverData struct {
	Winner *string   `json:"winner,omitempty"`
	ScoreA ScoreInfo `json:"score_a"`
	ScoreB ScoreInfo `json:"score_b"`
}

// GameSyncData holds the in-game state for a full sync.
type GameSyncData struct {
	Phase        string            `json:"phase"`
	Round        int               `json:"round"`
	YourRole     string            `json:"your_role"`
	YourTeam     string            `json:"your_team"`
	Words        []string          `json:"words"`
	Clues        []string          `json:"clues,omitempty"`
	SecretDigits []int             `json:"secret_digits,omitempty"`
	SecretWords  []string          `json:"secret_words,omitempty"`
	History      []RoundHistoryRow `json:"history,omitempty"`
	ScoreA       ScoreInfo         `json:"score_a"`
	ScoreB       ScoreInfo         `json:"score_b"`
}

// FullSyncData is the data payload for MsgFullSync.
type FullSyncData struct {
	Room *RoomStateData `json:"room,omitempty"`
	Game *GameSyncData  `json:"game,omitempty"`
}

// AIStatusData is the data payload for MsgAIThinking and MsgAIActed.
type AIStatusData struct {
	Action string `json:"action"` // "encrypt", "intercept", "decrypt"
	Player string `json:"player"` // AI player nickname
	Step   int    `json:"step"`   // current step (1-based)
	Total  int    `json:"total"`  // total steps
}

// ProgressData is the client payload for MsgProgress.
type ProgressData struct {
	Action string `json:"action"` // "encrypt", "intercept", "decrypt"
	Step   int    `json:"step"`   // 1-based step number
	Total  int    `json:"total"`  // total steps (always 3)
}

// PlayerProgressData is the server broadcast payload for MsgPlayerProgress.
type PlayerProgressData struct {
	Action string `json:"action"` // "encrypt", "intercept", "decrypt"
	Player string `json:"player"` // player nickname
	Step   int    `json:"step"`
	Total  int    `json:"total"`
}

// ErrorData is the data payload for MsgError.
type ErrorData struct {
	Message string `json:"message"`
}
