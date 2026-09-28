package ws

import "encoding/json"

// Client -> Server message type constants
const (
	MsgCreateRoom      = "create_room"
	MsgJoinRoom        = "join_room"
	MsgResumeRoom      = "resume_room"
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
	MsgReopenRoom      = "reopen_room"
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
	MsgAIActed        = "ai_acted"
	MsgPlayerProgress = "player_progress"
	MsgTimeout        = "timeout"
	MsgError          = "error"
)

// ClientMessage is a message sent from client to server.
type ClientMessage struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

// ServerMessage is a message sent from server to client. ServerTime is the
// server clock (Unix ms) when the message left, so clients can convert
// deadlines to their own clock whatever their system time says.
type ServerMessage struct {
	Type       string      `json:"type"`
	Data       interface{} `json:"data"`
	ServerTime int64       `json:"server_time,omitempty"`
}

// --- Client message data types ---

// CreateRoomData is the data payload for MsgCreateRoom. DeviceToken is a
// secret the browser keeps for good: it tells which rooms one browser opened
// and entered. It is optional, and never sent to other players.
type CreateRoomData struct {
	Nickname    string `json:"nickname"`
	DeviceToken string `json:"device_token,omitempty"`
}

// JoinRoomData is the data payload for MsgJoinRoom.
type JoinRoomData struct {
	RoomCode    string `json:"room_code"`
	Nickname    string `json:"nickname"`
	DeviceToken string `json:"device_token,omitempty"`
}

// SelectTeamData is the data payload for MsgSelectTeam.
type ResumeRoomData struct {
	RoomCode string `json:"room_code"`
	Token    string `json:"resume_token"`
}

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
	Round int       `json:"round"`
	Clues [3]string `json:"clues"`
}

// SubmitGuessData is the data payload for MsgSubmitIntercept and MsgSubmitDecrypt.
type SubmitGuessData struct {
	Round int    `json:"round"`
	Guess [3]int `json:"guess"`
}

// --- Server message data types ---

// RoomCreatedData is the data payload for MsgRoomCreated.
type RoomCreatedData struct {
	RoomCode    string `json:"room_code"`
	MyPlayerID  string `json:"my_player_id"`
	ResumeToken string `json:"resume_token,omitempty"`
}

// PlayerInfo represents a player in the room.
type PlayerInfo struct {
	ID           string `json:"id"`
	Nickname     string `json:"nickname"`
	IsAI         bool   `json:"is_ai"`
	Disconnected bool   `json:"disconnected,omitempty"`
}

// RoomStateData is the data payload for MsgRoomState.
type RoomStateData struct {
	Started    bool         `json:"started"`
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
	Round     int      `json:"round"`
	Team      string   `json:"team"`
	Clues     []string `json:"clues"`
	Secret    []int    `json:"secret,omitempty"`
	Intercept []int    `json:"intercept,omitempty"`
	Decrypt   []int    `json:"decrypt,omitempty"`
	// Timeouts lists the actions of this round that ran out of time.
	Timeouts []string `json:"timeouts,omitempty"`
}

// PhaseChangeData is the data payload for MsgPhaseChange.
type PhaseChangeData struct {
	Notice       string            `json:"notice,omitempty"`
	Deadline     int64             `json:"deadline"`
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
	Notice           string            `json:"notice,omitempty"`
	Round            int               `json:"round"`
	History          []RoundHistoryRow `json:"history,omitempty"`
	Complete         bool              `json:"complete,omitempty"`
	InterceptSuccess *bool             `json:"intercept_success,omitempty"`
	DecryptSuccess   *bool             `json:"decrypt_success,omitempty"`
	ScoreA           ScoreInfo         `json:"score_a"`
	ScoreB           ScoreInfo         `json:"score_b"`
}

// GameOverData is the data payload for MsgGameOver.
type GameOverData struct {
	Notice  string            `json:"notice,omitempty"`
	Round   int               `json:"round"`
	History []RoundHistoryRow `json:"history"`
	Winner  *string           `json:"winner,omitempty"`
	ScoreA  ScoreInfo         `json:"score_a"`
	ScoreB  ScoreInfo         `json:"score_b"`
	// Reason: "interceptions", "errors", "score" or "draw".
	Reason string `json:"reason,omitempty"`
	// Both teams' keywords, revealed once the game is over.
	WordsA []string `json:"words_a,omitempty"`
	WordsB []string `json:"words_b,omitempty"`
}

// TimeoutData tells everyone that an action ran out of time and how it was settled.
// Outcome: "draft" (the written draft was sent), "blank" (nothing was written),
// "guess" (the chosen digits were sent) or "none" (no complete guess).
type TimeoutData struct {
	Round   int    `json:"round"`
	Action  string `json:"action"` // "encrypt", "intercept", "decrypt"
	Team    string `json:"team"`
	Player  string `json:"player,omitempty"`
	Outcome string `json:"outcome"`
}

// GameSyncData holds the in-game state for a full sync.
type GameSyncData struct {
	RoundResult  *RoundResultData  `json:"round_result,omitempty"`
	Deadline     int64             `json:"deadline"`
	Encryptor    string            `json:"encryptor"`
	Waiting      bool              `json:"waiting"`
	Submitted    bool              `json:"submitted"`
	GameOver     *GameOverData     `json:"game_over,omitempty"`
	AIStatus     *AIStatusData     `json:"ai_status,omitempty"`
	Timeout      *TimeoutData      `json:"timeout,omitempty"`
	Notice       string            `json:"notice,omitempty"`
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
	Completed int    `json:"completed"`
	State     string `json:"state"`
	Notice    string `json:"notice,omitempty"`
	Action    string `json:"action"` // "encrypt", "intercept", "decrypt"
	Player    string `json:"player"` // AI player nickname
	Step      int    `json:"step"`   // current step (1-based)
	Total     int    `json:"total"`  // total steps
}

// ProgressData is the client payload for MsgProgress.
// State distinguishes "idle" (user hasn't interacted yet), "editing" (actively
// on slot Focus), and "submitted" (pressed dispatch). Step is the count of
// completed items (0-3); Focus is the slot the user is on (1-3), 0 otherwise.
// Guesses carries the current per-slot choice for decrypt/intercept actions
// (0 for unfilled); used to light up the receiving slots on observer pages.
// Filled marks which clue lines hold text while encrypting (never the text
// itself), so a draft written out of order still reads correctly elsewhere.
type ProgressData struct {
	Round   int    `json:"round"`
	Action  string `json:"action"`            // "encrypt", "intercept", "decrypt"
	State   string `json:"state,omitempty"`   // "idle" | "editing" | "submitted"
	Step    int    `json:"step"`              // completed count (0-3)
	Focus   int    `json:"focus,omitempty"`   // active slot 1-3, 0 if none
	Guesses []int  `json:"guesses,omitempty"` // per-slot digits 1-4, 0 unfilled
	Filled  []bool `json:"filled,omitempty"`  // per-slot clue drafted (encrypt only)
	Total   int    `json:"total"`             // total steps (always 3)
	// Clues is the encryptor's draft. It stays on the server, which sends it if
	// time runs out; it is never relayed to other players.
	Clues []string `json:"clues,omitempty"`
}

// PlayerProgressData is the server broadcast payload for MsgPlayerProgress.
type PlayerProgressData struct {
	Action  string `json:"action"` // "encrypt", "intercept", "decrypt"
	Player  string `json:"player"` // player nickname
	State   string `json:"state,omitempty"`
	Step    int    `json:"step"`
	Focus   int    `json:"focus,omitempty"`
	Guesses []int  `json:"guesses,omitempty"`
	Filled  []bool `json:"filled,omitempty"`
	Total   int    `json:"total"`
}

// ErrorData is the data payload for MsgError.
type ErrorData struct {
	Code    string `json:"code,omitempty"`
	Message string `json:"message"`
}
