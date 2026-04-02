# WebSocket Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the Go backend game engine with the React frontend via WebSocket, enabling real-time multiplayer Decrypto gameplay with room management and AI teammates.

**Architecture:** WebSocket hub routes messages to rooms. Room layer manages player/team state pre-game. Game bridge registers channel-based handlers into `core.AutoForward()`, so each game session runs in its own goroutine. Frontend uses Zustand as a render cache driven by server-pushed WebSocket messages.

**Tech Stack:** Go 1.20 + gorilla/websocket (already in go.mod), React 19 + Zustand 5 + TypeScript

---

## File Structure

### Backend (new files)

| File | Responsibility |
|---|---|
| `internal/ws/message.go` | WebSocket message type constants and JSON structs |
| `internal/ws/client.go` | Single WebSocket connection: read/write goroutines, send helper |
| `internal/ws/hub.go` | Connection registry, room-scoped broadcast, message routing |
| `internal/room/room.go` | Room state: players, teams, owner, AI slots |
| `internal/room/manager.go` | Room registry, room code generation, lookup |
| `internal/game/bridge.go` | Registers channel-based handlers into core API, broadcasts phase changes |
| `internal/game/registry.go` | Global `sync.Map` of sessionID to Bridge |
| `internal/ai/provider.go` | `LLMProvider` interface definition |
| `internal/ai/player.go` | AI player: prompt construction, response parsing, channel integration |
| `internal/ai/providers/claude.go` | Claude API implementation via `net/http` |

### Backend (modified files)

| File | Change |
|---|---|
| `cmd/server/main.go` | Add WebSocket endpoint, wire up hub + room manager |
| `go.mod` | May need `go get` to update dependencies |

### Frontend (new files)

| File | Responsibility |
|---|---|
| `web/src/services/websocket.ts` | WebSocket connection, reconnection, message send/receive |
| `web/src/store/gameStore.ts` | Zustand store: connection state, room state, game state, actions |
| `web/src/pages/Room.tsx` | Room lobby: team selection, AI slots, start button |
| `web/src/pages/RoundResult.tsx` | Brief round result overlay |
| `web/src/pages/GameOver.tsx` | Game over screen with final scores |

### Frontend (modified files)

| File | Change |
|---|---|
| `web/src/App.tsx` | Replace debug routing with store-driven routing |
| `web/src/pages/Home.tsx` | Wire CREATE/JOIN buttons to store actions |
| `web/src/pages/Encryptor.tsx` | Replace mock data with store, submit via WebSocket |
| `web/src/pages/TeammateWaiting.tsx` | Read clues/state from store |
| `web/src/pages/OpponentWaiting.tsx` | Read state from store |
| `web/src/pages/EncryptorWatching.tsx` | Read state from store |
| `web/src/pages/TeammateDecoding.tsx` | Replace mock data with store, submit via WebSocket |
| `web/src/pages/OpponentAnalyzing.tsx` | Read state from store |
| `web/src/pages/InterceptedWaiting.tsx` | Read state from store |
| `web/src/pages/OpponentIntercepting.tsx` | Replace mock data with store, submit via WebSocket |

---

### Task 1: WebSocket Message Types

**Files:**
- Create: `internal/ws/message.go`

- [ ] **Step 1: Create the message types file**

```go
// internal/ws/message.go
package ws

import "encoding/json"

// Client -> Server message types
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
)

// Server -> Client message types
const (
	MsgRoomCreated    = "room_created"
	MsgRoomState      = "room_state"
	MsgGameStart      = "game_start"
	MsgPhaseChange    = "phase_change"
	MsgCluesSubmitted = "clues_submitted"
	MsgRoundResult    = "round_result"
	MsgGameOver       = "game_over"
	MsgFullSync       = "full_sync"
	MsgError          = "error"
)

// ClientMessage is the envelope for all client-to-server messages.
type ClientMessage struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

// ServerMessage is the envelope for all server-to-client messages.
type ServerMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

// --- Client message data types ---

type CreateRoomData struct {
	Nickname string `json:"nickname"`
}

type JoinRoomData struct {
	RoomCode string `json:"room_code"`
	Nickname string `json:"nickname"`
}

type SelectTeamData struct {
	Team string `json:"team"` // "A" or "B"
}

type AddAIData struct {
	Team string `json:"team"`
}

type RemoveAIData struct {
	Team  string `json:"team"`
	Index int    `json:"index"`
}

type SubmitCluesData struct {
	Clues [3]string `json:"clues"`
}

type SubmitGuessData struct {
	Guess [3]int `json:"guess"`
}

// --- Server message data types ---

type RoomCreatedData struct {
	RoomCode string `json:"room_code"`
}

type PlayerInfo struct {
	ID       string `json:"id"`
	Nickname string `json:"nickname"`
	IsAI     bool   `json:"is_ai"`
}

type RoomStateData struct {
	RoomCode string       `json:"room_code"`
	Players  []PlayerInfo `json:"players"`
	TeamA    []PlayerInfo `json:"team_a"`
	TeamB    []PlayerInfo `json:"team_b"`
	OwnerID  string       `json:"owner_id"`
	CanStart bool         `json:"can_start"`
}

type GameStartData struct {
	Round    int      `json:"round"`
	YourRole string   `json:"your_role"` // "encryptor", "teammate", "opponent"
	YourTeam string   `json:"your_team"` // "A" or "B"
	Words    []string `json:"words"`     // your team's 4 words
}

type PhaseChangeData struct {
	Phase        string            `json:"phase"` // "encrypting", "intercept", "decrypt"
	Round        int               `json:"round"`
	YourRole     string            `json:"your_role"`
	Encryptor    string            `json:"encryptor,omitempty"`
	SecretDigits []int             `json:"secret_digits,omitempty"` // only for encryptor
	SecretWords  []string          `json:"secret_words,omitempty"`  // only for encryptor
	Clues        []string          `json:"clues,omitempty"`
	History      []RoundHistoryRow `json:"history,omitempty"`
	Waiting      bool              `json:"waiting,omitempty"`
}

type RoundHistoryRow struct {
	Round    int      `json:"round"`
	Team     string   `json:"team"`
	Clues    []string `json:"clues"`
	Secret   []int    `json:"secret,omitempty"`
	Intercept []int   `json:"intercept,omitempty"`
	Decrypt  []int    `json:"decrypt,omitempty"`
}

type RoundResultData struct {
	InterceptSuccess *bool  `json:"intercept_success,omitempty"` // nil if no intercept this round
	DecryptSuccess   *bool  `json:"decrypt_success,omitempty"`   // nil if skipped (intercept succeeded)
	ScoreA           ScoreInfo `json:"score_a"`
	ScoreB           ScoreInfo `json:"score_b"`
}

type ScoreInfo struct {
	Interceptions   int `json:"interceptions"`
	DecryptFailures int `json:"decrypt_failures"`
}

type GameOverData struct {
	Winner     *string   `json:"winner"` // "A", "B", or null for tie
	ScoreA     ScoreInfo `json:"score_a"`
	ScoreB     ScoreInfo `json:"score_b"`
}

type FullSyncData struct {
	Room  *RoomStateData  `json:"room,omitempty"`
	Game  *GameSyncData   `json:"game,omitempty"`
}

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

type ErrorData struct {
	Message string `json:"message"`
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/zinklu/code/decrypto-the-game && go build ./internal/ws/...`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add internal/ws/message.go
git commit -m "feat: add WebSocket message type definitions"
```

---

### Task 2: WebSocket Client & Hub

**Files:**
- Create: `internal/ws/client.go`
- Create: `internal/ws/hub.go`

- [ ] **Step 1: Create the Client**

```go
// internal/ws/client.go
package ws

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 4096
)

// Client wraps a single WebSocket connection.
type Client struct {
	hub      *Hub
	conn     *websocket.Conn
	send     chan []byte
	PlayerID string
	Nickname string
	RoomCode string
	mu       sync.Mutex
}

func NewClient(hub *Hub, conn *websocket.Conn) *Client {
	return &Client{
		hub:  hub,
		conn: conn,
		send: make(chan []byte, 256),
	}
}

// SendMessage sends a ServerMessage to this client.
func (c *Client) SendMessage(msg ServerMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("marshal error: %v", err)
		return
	}
	select {
	case c.send <- data:
	default:
		log.Printf("client %s send buffer full, dropping message", c.PlayerID)
	}
}

// SendError sends an error message to this client.
func (c *Client) SendError(message string) {
	c.SendMessage(ServerMessage{
		Type: MsgError,
		Data: ErrorData{Message: message},
	})
}

// ReadPump reads messages from the WebSocket connection.
// Must be run in its own goroutine.
func (c *Client) ReadPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()
	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})
	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("read error: %v", err)
			}
			break
		}
		var msg ClientMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			c.SendError("invalid message format")
			continue
		}
		c.hub.HandleMessage(c, msg)
	}
}

// WritePump writes messages to the WebSocket connection.
// Must be run in its own goroutine.
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
```

- [ ] **Step 2: Create the Hub**

```go
// internal/ws/hub.go
package ws

import (
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

// MessageHandler is the callback for processing client messages.
// Set by the server layer to dispatch messages to room/game logic.
type MessageHandler func(client *Client, msg ClientMessage)

// Hub manages all WebSocket connections and room-scoped broadcasting.
type Hub struct {
	clients    map[*Client]bool
	rooms      map[string]map[*Client]bool // roomCode -> set of clients
	register   chan *Client
	unregister chan *Client
	handler    MessageHandler
	mu         sync.RWMutex
}

func NewHub(handler MessageHandler) *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		rooms:      make(map[string]map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		handler:    handler,
	}
}

// Run starts the hub's event loop. Must be called in its own goroutine.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
				if client.RoomCode != "" {
					if room, ok := h.rooms[client.RoomCode]; ok {
						delete(room, client)
						if len(room) == 0 {
							delete(h.rooms, client.RoomCode)
						}
					}
				}
			}
			h.mu.Unlock()
			// Notify handler about disconnect
			if h.handler != nil && client.RoomCode != "" {
				h.handler(client, ClientMessage{Type: "_disconnect"})
			}
		}
	}
}

// JoinRoom adds a client to a room's broadcast group.
func (h *Hub) JoinRoom(client *Client, roomCode string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	// Leave old room if any
	if client.RoomCode != "" {
		if room, ok := h.rooms[client.RoomCode]; ok {
			delete(room, client)
			if len(room) == 0 {
				delete(h.rooms, client.RoomCode)
			}
		}
	}
	client.RoomCode = roomCode
	if _, ok := h.rooms[roomCode]; !ok {
		h.rooms[roomCode] = make(map[*Client]bool)
	}
	h.rooms[roomCode][client] = true
}

// BroadcastToRoom sends a message to all clients in a room.
func (h *Hub) BroadcastToRoom(roomCode string, msg ServerMessage) {
	h.mu.RLock()
	clients, ok := h.rooms[roomCode]
	if !ok {
		h.mu.RUnlock()
		return
	}
	// Copy client list to avoid holding lock during send
	clientList := make([]*Client, 0, len(clients))
	for c := range clients {
		clientList = append(clientList, c)
	}
	h.mu.RUnlock()
	for _, c := range clientList {
		c.SendMessage(msg)
	}
}

// SendToPlayer sends a message to a specific player in a room.
func (h *Hub) SendToPlayer(roomCode, playerID string, msg ServerMessage) {
	h.mu.RLock()
	clients, ok := h.rooms[roomCode]
	if !ok {
		h.mu.RUnlock()
		return
	}
	for c := range clients {
		if c.PlayerID == playerID {
			h.mu.RUnlock()
			c.SendMessage(msg)
			return
		}
	}
	h.mu.RUnlock()
}

// GetRoomClients returns all clients in a room.
func (h *Hub) GetRoomClients(roomCode string) []*Client {
	h.mu.RLock()
	defer h.mu.RUnlock()
	clients, ok := h.rooms[roomCode]
	if !ok {
		return nil
	}
	result := make([]*Client, 0, len(clients))
	for c := range clients {
		result = append(result, c)
	}
	return result
}

// HandleMessage dispatches a message to the configured handler.
func (h *Hub) HandleMessage(client *Client, msg ClientMessage) {
	if h.handler != nil {
		h.handler(client, msg)
	}
}

// ServeWS handles WebSocket upgrade requests.
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("upgrade error: %v", err)
		return
	}
	client := NewClient(h, conn)
	h.register <- client
	go client.WritePump()
	go client.ReadPump()
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /Users/zinklu/code/decrypto-the-game && go build ./internal/ws/...`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add internal/ws/client.go internal/ws/hub.go
git commit -m "feat: add WebSocket client and hub infrastructure"
```

---

### Task 3: Room Model & Manager

**Files:**
- Create: `internal/room/room.go`
- Create: `internal/room/manager.go`

- [ ] **Step 1: Create the Room model**

```go
// internal/room/room.go
package room

import (
	"fmt"
	"sync"
)

type PlayerInfo struct {
	ID       string
	Nickname string
	IsAI     bool
}

type Room struct {
	Code      string
	OwnerID   string
	TeamA     []*PlayerInfo
	TeamB     []*PlayerInfo
	Started   bool
	SessionID string // set when game starts
	mu        sync.Mutex
}

func NewRoom(code string, owner *PlayerInfo) *Room {
	return &Room{
		Code:    code,
		OwnerID: owner.ID,
		TeamA:   make([]*PlayerInfo, 0),
		TeamB:   make([]*PlayerInfo, 0),
	}
}

// AddToTeam adds a player to the specified team.
func (r *Room) AddToTeam(player *PlayerInfo, team string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.Started {
		return fmt.Errorf("game already started")
	}
	// Remove from other team first
	r.removePlayerLocked(player.ID)
	switch team {
	case "A":
		if len(r.TeamA) >= 4 {
			return fmt.Errorf("team A is full")
		}
		r.TeamA = append(r.TeamA, player)
	case "B":
		if len(r.TeamB) >= 4 {
			return fmt.Errorf("team B is full")
		}
		r.TeamB = append(r.TeamB, player)
	default:
		return fmt.Errorf("invalid team: %s", team)
	}
	return nil
}

// RemovePlayer removes a player from whatever team they're on.
func (r *Room) RemovePlayer(playerID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.removePlayerLocked(playerID)
}

func (r *Room) removePlayerLocked(playerID string) {
	r.TeamA = removeFromSlice(r.TeamA, playerID)
	r.TeamB = removeFromSlice(r.TeamB, playerID)
}

// AddAI adds an AI player to the specified team.
func (r *Room) AddAI(team string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.Started {
		return fmt.Errorf("game already started")
	}
	ai := &PlayerInfo{
		ID:       fmt.Sprintf("ai-%s-%d", team, r.countAILocked(team)+1),
		Nickname: fmt.Sprintf("AI Agent %d", r.countAILocked(team)+1),
		IsAI:     true,
	}
	switch team {
	case "A":
		if len(r.TeamA) >= 4 {
			return fmt.Errorf("team A is full")
		}
		r.TeamA = append(r.TeamA, ai)
	case "B":
		if len(r.TeamB) >= 4 {
			return fmt.Errorf("team B is full")
		}
		r.TeamB = append(r.TeamB, ai)
	default:
		return fmt.Errorf("invalid team: %s", team)
	}
	return nil
}

// RemoveAI removes an AI player at the given index from the specified team.
func (r *Room) RemoveAI(team string, index int) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.Started {
		return fmt.Errorf("game already started")
	}
	switch team {
	case "A":
		if index < 0 || index >= len(r.TeamA) || !r.TeamA[index].IsAI {
			return fmt.Errorf("invalid AI index")
		}
		r.TeamA = append(r.TeamA[:index], r.TeamA[index+1:]...)
	case "B":
		if index < 0 || index >= len(r.TeamB) || !r.TeamB[index].IsAI {
			return fmt.Errorf("invalid AI index")
		}
		r.TeamB = append(r.TeamB[:index], r.TeamB[index+1:]...)
	default:
		return fmt.Errorf("invalid team: %s", team)
	}
	return nil
}

// CanStart returns true if both teams have at least 2 players.
func (r *Room) CanStart() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.TeamA) >= 2 && len(r.TeamB) >= 2
}

// GetAllPlayers returns all players in the room (both teams).
func (r *Room) GetAllPlayers() []*PlayerInfo {
	r.mu.Lock()
	defer r.mu.Unlock()
	all := make([]*PlayerInfo, 0, len(r.TeamA)+len(r.TeamB))
	all = append(all, r.TeamA...)
	all = append(all, r.TeamB...)
	return all
}

// FindPlayer returns the player info and which team they are on.
func (r *Room) FindPlayer(playerID string) (*PlayerInfo, string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, p := range r.TeamA {
		if p.ID == playerID {
			return p, "A"
		}
	}
	for _, p := range r.TeamB {
		if p.ID == playerID {
			return p, "B"
		}
	}
	return nil, ""
}

// HasPlayer checks if a player is in the room (on any team).
func (r *Room) HasPlayer(playerID string) bool {
	p, _ := r.FindPlayer(playerID)
	return p != nil
}

func (r *Room) countAILocked(team string) int {
	var list []*PlayerInfo
	if team == "A" {
		list = r.TeamA
	} else {
		list = r.TeamB
	}
	count := 0
	for _, p := range list {
		if p.IsAI {
			count++
		}
	}
	return count
}

func removeFromSlice(slice []*PlayerInfo, playerID string) []*PlayerInfo {
	result := make([]*PlayerInfo, 0, len(slice))
	for _, p := range slice {
		if p.ID != playerID {
			result = append(result, p)
		}
	}
	return result
}
```

- [ ] **Step 2: Create the Room Manager**

```go
// internal/room/manager.go
package room

import (
	"math/rand"
	"sync"
)

const roomCodeChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no I/O/0/1 to avoid confusion

type Manager struct {
	rooms map[string]*Room
	mu    sync.RWMutex
}

func NewManager() *Manager {
	return &Manager{
		rooms: make(map[string]*Room),
	}
}

// CreateRoom generates a unique room code and creates a new room.
func (m *Manager) CreateRoom(owner *PlayerInfo) *Room {
	m.mu.Lock()
	defer m.mu.Unlock()
	code := m.generateCodeLocked()
	r := NewRoom(code, owner)
	m.rooms[code] = r
	return r
}

// GetRoom returns the room with the given code, or nil.
func (m *Manager) GetRoom(code string) *Room {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.rooms[code]
}

// RemoveRoom deletes a room by code.
func (m *Manager) RemoveRoom(code string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.rooms, code)
}

// FindRoomByPlayer returns the room a player is in, or nil.
func (m *Manager) FindRoomByPlayer(playerID string) *Room {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, r := range m.rooms {
		if r.HasPlayer(playerID) {
			return r
		}
	}
	return nil
}

func (m *Manager) generateCodeLocked() string {
	for {
		code := make([]byte, 4)
		for i := range code {
			code[i] = roomCodeChars[rand.Intn(len(roomCodeChars))]
		}
		s := string(code)
		if _, exists := m.rooms[s]; !exists {
			return s
		}
	}
}
```

- [ ] **Step 3: Write a test for room operations**

```go
// internal/room/room_test.go
package room

import "testing"

func TestRoomTeamOperations(t *testing.T) {
	owner := &PlayerInfo{ID: "p1", Nickname: "Alice"}
	r := NewRoom("TEST", owner)

	// Add to team A
	if err := r.AddToTeam(owner, "A"); err != nil {
		t.Fatalf("AddToTeam failed: %v", err)
	}
	if len(r.TeamA) != 1 || r.TeamA[0].ID != "p1" {
		t.Fatal("expected p1 in team A")
	}

	// Add p2 to team B
	p2 := &PlayerInfo{ID: "p2", Nickname: "Bob"}
	if err := r.AddToTeam(p2, "B"); err != nil {
		t.Fatalf("AddToTeam failed: %v", err)
	}

	// Can't start with 1v1
	if r.CanStart() {
		t.Fatal("should not be able to start with 1v1")
	}

	// Add AI to both teams
	if err := r.AddAI("A"); err != nil {
		t.Fatalf("AddAI failed: %v", err)
	}
	if err := r.AddAI("B"); err != nil {
		t.Fatalf("AddAI failed: %v", err)
	}

	// Now 2v2, can start
	if !r.CanStart() {
		t.Fatal("should be able to start with 2v2")
	}

	// Switch team: move p1 from A to B
	if err := r.AddToTeam(owner, "B"); err != nil {
		t.Fatalf("AddToTeam switch failed: %v", err)
	}
	if len(r.TeamA) != 1 { // only AI remains
		t.Fatalf("expected 1 in team A, got %d", len(r.TeamA))
	}
	if len(r.TeamB) != 3 {
		t.Fatalf("expected 3 in team B, got %d", len(r.TeamB))
	}

	// Remove AI
	if err := r.RemoveAI("A", 0); err != nil {
		t.Fatalf("RemoveAI failed: %v", err)
	}
	if len(r.TeamA) != 0 {
		t.Fatal("expected team A empty after removing AI")
	}
}

func TestManagerCreateAndFind(t *testing.T) {
	m := NewManager()
	owner := &PlayerInfo{ID: "p1", Nickname: "Alice"}
	r := m.CreateRoom(owner)

	if r.Code == "" {
		t.Fatal("room code should not be empty")
	}
	if len(r.Code) != 4 {
		t.Fatalf("room code should be 4 chars, got %d", len(r.Code))
	}

	// Get by code
	found := m.GetRoom(r.Code)
	if found != r {
		t.Fatal("GetRoom should return the same room")
	}

	// Add player to team and find by player
	r.AddToTeam(owner, "A")
	foundByPlayer := m.FindRoomByPlayer("p1")
	if foundByPlayer != r {
		t.Fatal("FindRoomByPlayer should find the room")
	}
}
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/zinklu/code/decrypto-the-game && go test ./internal/room/ -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/room/
git commit -m "feat: add room model and manager with team/AI operations"
```

---

### Task 4: Game Bridge & Registry

**Files:**
- Create: `internal/game/registry.go`
- Create: `internal/game/bridge.go`

- [ ] **Step 1: Create the bridge registry**

```go
// internal/game/registry.go
package game

import "sync"

// bridges maps sessionID -> *Bridge for active game sessions.
var bridges sync.Map

func RegisterBridge(sessionID string, b *Bridge) {
	bridges.Store(sessionID, b)
}

func GetBridge(sessionID string) (*Bridge, bool) {
	v, ok := bridges.Load(sessionID)
	if !ok {
		return nil, false
	}
	return v.(*Bridge), true
}

func RemoveBridge(sessionID string) {
	bridges.Delete(sessionID)
}
```

- [ ] **Step 2: Create the Bridge**

The bridge connects the room/WebSocket layer to the core game engine. It:
1. Creates a `core.Session` from room teams
2. Registers channel-based handlers
3. Runs `AutoForward()` in a goroutine
4. Broadcasts phase changes via the hub

```go
// internal/game/bridge.go
package game

import (
	"context"
	"log"
	"time"

	core "github.com/ZinkLu/decrypto-the-game/internal/core/api"
	"github.com/ZinkLu/decrypto-the-game/internal/room"
	"github.com/ZinkLu/decrypto-the-game/internal/ws"
)

const (
	encryptTimeout  = 90 * time.Second
	interceptTimeout = 60 * time.Second
	decryptTimeout  = 60 * time.Second
)

// Bridge connects a room's game session to the WebSocket layer.
type Bridge struct {
	Room      *room.Room
	Session   *core.Session
	Hub       *ws.Hub
	CluesCh   chan [3]string
	InterceptCh chan [3]int
	DecryptCh chan [3]int
	cancel    context.CancelFunc
}

// NewBridge creates a bridge and starts the game.
func NewBridge(r *room.Room, hub *ws.Hub) (*Bridge, error) {
	// Build core players from room teams
	teamAPlayers := make([]*core.Player, len(r.TeamA))
	for i, p := range r.TeamA {
		teamAPlayers[i] = &core.Player{UID: p.ID, NickName: p.Nickname}
	}
	teamBPlayers := make([]*core.Player, len(r.TeamB))
	for i, p := range r.TeamB {
		teamBPlayers[i] = &core.Player{UID: p.ID, NickName: p.Nickname}
	}

	session, err := core.NewWithTeams(r.Code, teamAPlayers, teamBPlayers)
	if err != nil {
		return nil, err
	}

	r.SessionID = session.SessionID()
	r.Started = true

	b := &Bridge{
		Room:        r,
		Session:     session,
		Hub:         hub,
		CluesCh:     make(chan [3]string, 1),
		InterceptCh: make(chan [3]int, 1),
		DecryptCh:   make(chan [3]int, 1),
	}

	RegisterBridge(session.SessionID(), b)
	return b, nil
}

// Start runs AutoForward in a goroutine, driving the game loop.
func (b *Bridge) Start() {
	ctx, cancel := context.WithCancel(context.Background())
	b.cancel = cancel

	go func() {
		defer RemoveBridge(b.Session.SessionID())
		b.Session.AutoForward(ctx)
	}()
}

// Stop cancels the game loop.
func (b *Bridge) Stop() {
	if b.cancel != nil {
		b.cancel()
	}
}

// playerTeamLabel returns "A" or "B" for a given player ID.
func (b *Bridge) playerTeamLabel(playerID string) string {
	teams := b.Session.GetTeams()
	for _, p := range teams[0].Members() {
		if p.UID == playerID {
			return "A"
		}
	}
	return "B"
}

// playerRole returns the role of a player in the current round.
func (b *Bridge) playerRole(playerID string, round *core.Round) string {
	if round.EncryptPlayer().UID == playerID {
		return "encryptor"
	}
	playerTeam := b.playerTeamLabel(playerID)
	currentTeamLabel := b.teamLabel(round.GetCurrentTeam())
	if playerTeam == currentTeamLabel {
		return "teammate"
	}
	return "opponent"
}

// teamLabel returns "A" or "B" for a team.
func (b *Bridge) teamLabel(team *core.Team) string {
	if team == b.Session.GetTeams()[0] {
		return "A"
	}
	return "B"
}

// buildHistory builds the round history visible to a player.
func (b *Bridge) buildHistory(currentRound *core.Round) []ws.RoundHistoryRow {
	var rows []ws.RoundHistoryRow
	r := currentRound.GetPreviousRound()
	for r != nil {
		row := ws.RoundHistoryRow{
			Round: int(r.GetNumberOfRounds()),
			Team:  b.teamLabel(r.GetCurrentTeam()),
			Clues: r.GetEncryptedMessage()[:],
		}
		secret := r.GetSecretDigits()
		row.Secret = secret[:]
		intercept := r.GetInterceptSecret()
		if intercept != [3]int{} {
			row.Intercept = intercept[:]
		}
		decrypt := r.GetDecryptSecret()
		if decrypt != [3]int{} {
			row.Decrypt = decrypt[:]
		}
		rows = append([]ws.RoundHistoryRow{row}, rows...) // prepend for chronological order
		r = r.GetPreviousRound()
	}
	return rows
}

// buildScores returns current scores.
func (b *Bridge) buildScores() (ws.ScoreInfo, ws.ScoreInfo) {
	teams := b.Session.GetTeams()
	return ws.ScoreInfo{
			Interceptions:   int(teams[0].InterceptedCounts),
			DecryptFailures: int(teams[0].DecryptWrongCounts),
		}, ws.ScoreInfo{
			Interceptions:   int(teams[1].InterceptedCounts),
			DecryptFailures: int(teams[1].DecryptWrongCounts),
		}
}

// broadcastToEachPlayer sends a personalized message to each player in the room.
func (b *Bridge) broadcastToEachPlayer(buildMsg func(playerID string) *ws.ServerMessage) {
	clients := b.Hub.GetRoomClients(b.Room.Code)
	for _, c := range clients {
		msg := buildMsg(c.PlayerID)
		if msg != nil {
			c.SendMessage(*msg)
		}
	}
}

// broadcastGameStart sends game_start to each player with their role and words.
func (b *Bridge) broadcastGameStart(round *core.Round) {
	b.broadcastToEachPlayer(func(playerID string) *ws.ServerMessage {
		teamLabel := b.playerTeamLabel(playerID)
		var words []string
		if teamLabel == "A" {
			w := b.Session.GetTeams()[0].GetWords()
			words = w[:]
		} else {
			w := b.Session.GetTeams()[1].GetWords()
			words = w[:]
		}
		return &ws.ServerMessage{
			Type: ws.MsgGameStart,
			Data: ws.GameStartData{
				Round:    int(round.GetNumberOfRounds()),
				YourRole: b.playerRole(playerID, round),
				YourTeam: teamLabel,
				Words:    words,
			},
		}
	})
}

// broadcastPhaseChange sends phase_change to each player, filtering sensitive data by role.
func (b *Bridge) broadcastPhaseChange(phase string, round *core.Round) {
	history := b.buildHistory(round)
	b.broadcastToEachPlayer(func(playerID string) *ws.ServerMessage {
		role := b.playerRole(playerID, round)
		data := ws.PhaseChangeData{
			Phase:     phase,
			Round:     int(round.GetNumberOfRounds()),
			YourRole:  role,
			Encryptor: round.EncryptPlayer().NickName,
			History:   history,
		}
		switch phase {
		case "encrypting":
			if role == "encryptor" {
				digits := round.GetSecretDigits()
				data.SecretDigits = digits[:]
				words := round.GetSecretWords()
				data.SecretWords = words[:]
			} else {
				data.Waiting = true
			}
		case "intercept":
			if role == "opponent" {
				clues := round.GetEncryptedMessage()
				data.Clues = clues[:]
			} else {
				data.Waiting = true
			}
		case "decrypt":
			if role == "opponent" {
				data.Waiting = true
			} else {
				clues := round.GetEncryptedMessage()
				data.Clues = clues[:]
			}
		}
		return &ws.ServerMessage{
			Type: ws.MsgPhaseChange,
			Data: data,
		}
	})
}

// broadcastRoundResult sends round_result to all players.
func (b *Bridge) broadcastRoundResult(round *core.Round, intercepted bool, interceptSuccess *bool, decryptSuccess *bool) {
	scoreA, scoreB := b.buildScores()
	data := ws.RoundResultData{
		InterceptSuccess: interceptSuccess,
		DecryptSuccess:   decryptSuccess,
		ScoreA:           scoreA,
		ScoreB:           scoreB,
	}
	b.Hub.BroadcastToRoom(b.Room.Code, ws.ServerMessage{
		Type: ws.MsgRoundResult,
		Data: data,
	})
}

// broadcastGameOver sends game_over to all players.
func (b *Bridge) broadcastGameOver(winner *core.Team) {
	scoreA, scoreB := b.buildScores()
	data := ws.GameOverData{
		ScoreA: scoreA,
		ScoreB: scoreB,
	}
	if winner != nil {
		label := b.teamLabel(winner)
		data.Winner = &label
	}
	b.Hub.BroadcastToRoom(b.Room.Code, ws.ServerMessage{
		Type: ws.MsgGameOver,
		Data: data,
	})
}

// RegisterHandlers registers the channel-based handlers into the core API.
// This must be called ONCE at server startup.
func RegisterHandlers() {
	core.RegisterInitHandler(func(ctx context.Context, r *core.Round, ts core.TeamState) bool {
		b, ok := GetBridge(r.GetGameSession().SessionID())
		if !ok {
			return true
		}
		// First round: broadcast game_start; subsequent rounds: broadcast phase init
		if r.GetNumberOfRounds() == 1 {
			b.broadcastGameStart(r)
		}
		// Small delay between rounds for result display
		if r.GetNumberOfRounds() > 1 {
			time.Sleep(5 * time.Second)
			// Broadcast new round start with role updates
			b.broadcastToEachPlayer(func(playerID string) *ws.ServerMessage {
				return &ws.ServerMessage{
					Type: ws.MsgPhaseChange,
					Data: ws.PhaseChangeData{
						Phase:     "new_round",
						Round:     int(r.GetNumberOfRounds()),
						YourRole:  b.playerRole(playerID, r),
						Encryptor: r.EncryptPlayer().NickName,
					},
				}
			})
		}
		return false
	})

	core.RegisterEncryptHandler(func(ctx context.Context, r *core.Round, t *core.Team, p *core.Player, ts core.TeamState) ([3]string, bool) {
		b, ok := GetBridge(r.GetGameSession().SessionID())
		if !ok {
			return [3]string{}, true
		}
		b.broadcastPhaseChange("encrypting", r)

		// Check if encryptor is AI
		if isAI(p.UID) {
			clues := handleAIEncrypt(ctx, b, r)
			// Broadcast clues to all
			b.Hub.BroadcastToRoom(b.Room.Code, ws.ServerMessage{
				Type: ws.MsgCluesSubmitted,
				Data: map[string]interface{}{"clues": clues[:]},
			})
			return clues, false
		}

		select {
		case clues := <-b.CluesCh:
			b.Hub.BroadcastToRoom(b.Room.Code, ws.ServerMessage{
				Type: ws.MsgCluesSubmitted,
				Data: map[string]interface{}{"clues": clues[:]},
			})
			return clues, false
		case <-time.After(encryptTimeout):
			log.Printf("encrypt timeout for session %s", r.GetGameSession().SessionID())
			return [3]string{"...", "...", "..."}, false
		case <-ctx.Done():
			return [3]string{}, true
		}
	})

	core.RegisterInterceptHandler(func(ctx context.Context, r *core.Round, t *core.Team, ts core.TeamState) ([3]int, bool) {
		b, ok := GetBridge(r.GetGameSession().SessionID())
		if !ok {
			return [3]int{}, true
		}
		b.broadcastPhaseChange("intercept", r)

		// Check if all opponent team members are AI
		if b.isTeamAllAI(t) {
			guess := handleAIIntercept(ctx, b, r)
			return guess, false
		}

		select {
		case guess := <-b.InterceptCh:
			return guess, false
		case <-time.After(interceptTimeout):
			log.Printf("intercept timeout for session %s", r.GetGameSession().SessionID())
			return [3]int{0, 0, 0}, false
		case <-ctx.Done():
			return [3]int{}, true
		}
	})

	core.RegisterInterceptSuccessHandler(func(ctx context.Context, r *core.Round, t *core.Team, ts core.TeamState) bool {
		b, ok := GetBridge(r.GetGameSession().SessionID())
		if !ok {
			return true
		}
		success := true
		b.broadcastRoundResult(r, true, &success, nil)
		return false
	})

	core.RegisterInterceptFailHandler(func(ctx context.Context, r *core.Round, t *core.Team, ts core.TeamState) bool {
		b, ok := GetBridge(r.GetGameSession().SessionID())
		if !ok {
			return true
		}
		fail := false
		b.broadcastRoundResult(r, true, &fail, nil)
		// Small pause so players can see the result before decrypt phase
		time.Sleep(3 * time.Second)
		return false
	})

	core.RegisterDecryptHandler(func(ctx context.Context, r *core.Round, t *core.Team, ts core.TeamState) ([3]int, bool) {
		b, ok := GetBridge(r.GetGameSession().SessionID())
		if !ok {
			return [3]int{}, true
		}
		b.broadcastPhaseChange("decrypt", r)

		// Check if all current team non-encryptor members are AI
		if b.isTeamAllAI(t) {
			guess := handleAIDecrypt(ctx, b, r)
			return guess, false
		}

		select {
		case guess := <-b.DecryptCh:
			return guess, false
		case <-time.After(decryptTimeout):
			log.Printf("decrypt timeout for session %s", r.GetGameSession().SessionID())
			return [3]int{0, 0, 0}, false
		case <-ctx.Done():
			return [3]int{}, true
		}
	})

	core.RegisterDecryptSuccessHandler(func(ctx context.Context, r *core.Round, t *core.Team, ts core.TeamState) bool {
		b, ok := GetBridge(r.GetGameSession().SessionID())
		if !ok {
			return true
		}
		success := true
		b.broadcastRoundResult(r, false, nil, &success)
		return false
	})

	core.RegisterDecryptFailHandler(func(ctx context.Context, r *core.Round, t *core.Team, ts core.TeamState) bool {
		b, ok := GetBridge(r.GetGameSession().SessionID())
		if !ok {
			return true
		}
		fail := false
		b.broadcastRoundResult(r, false, nil, &fail)
		return false
	})

	core.RegisterDoneHandler(func(ctx context.Context, r *core.Round, ts core.TeamState) bool {
		return false
	})

	core.RegisterGameOverHandler(func(ctx context.Context, s *core.Session, t *core.Team) bool {
		b, ok := GetBridge(s.SessionID())
		if !ok {
			return true
		}
		b.broadcastGameOver(t)
		return true
	})
}

// isAI checks if a player ID belongs to an AI player.
func isAI(uid string) bool {
	return len(uid) > 3 && uid[:3] == "ai-"
}

// isTeamAllAI checks if all non-encryptor players on a team are AI.
func (b *Bridge) isTeamAllAI(team *core.Team) bool {
	for _, p := range team.Members() {
		if !isAI(p.UID) {
			return false
		}
	}
	return true
}

// AI stubs - will be implemented in Task 11 (AI Player).
// For now, return random/default values.

func handleAIEncrypt(ctx context.Context, b *Bridge, r *core.Round) [3]string {
	time.Sleep(2 * time.Second) // simulate thinking
	return [3]string{"提示1", "提示2", "提示3"}
}

func handleAIIntercept(ctx context.Context, b *Bridge, r *core.Round) [3]int {
	time.Sleep(2 * time.Second)
	return [3]int{1, 2, 3} // random guess
}

func handleAIDecrypt(ctx context.Context, b *Bridge, r *core.Round) [3]int {
	time.Sleep(2 * time.Second)
	return r.GetSecretDigits() // for now, AI always guesses correctly on decrypt
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /Users/zinklu/code/decrypto-the-game && go build ./internal/game/...`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add internal/game/
git commit -m "feat: add game bridge connecting WebSocket to core AutoForward"
```

---

### Task 5: Server Wiring & Message Dispatch

**Files:**
- Modify: `cmd/server/main.go`
- Create: `internal/server/handler.go`

- [ ] **Step 1: Create the message dispatch handler**

This is the central router that receives all WebSocket messages and dispatches them to the appropriate room/game logic.

```go
// internal/server/handler.go
package server

import (
	"encoding/json"
	"log"

	"github.com/ZinkLu/decrypto-the-game/internal/game"
	"github.com/ZinkLu/decrypto-the-game/internal/room"
	"github.com/ZinkLu/decrypto-the-game/internal/ws"
	"github.com/google/uuid"
)

// Handler dispatches WebSocket messages to room/game logic.
type Handler struct {
	RoomManager *room.Manager
	Hub         *ws.Hub
}

func NewHandler(roomManager *room.Manager, hub *ws.Hub) *Handler {
	return &Handler{
		RoomManager: roomManager,
		Hub:         hub,
	}
}

// HandleMessage is the MessageHandler for the Hub.
func (h *Handler) HandleMessage(client *ws.Client, msg ws.ClientMessage) {
	switch msg.Type {
	case ws.MsgCreateRoom:
		h.handleCreateRoom(client, msg.Data)
	case ws.MsgJoinRoom:
		h.handleJoinRoom(client, msg.Data)
	case ws.MsgSelectTeam:
		h.handleSelectTeam(client, msg.Data)
	case ws.MsgLeaveTeam:
		h.handleLeaveTeam(client)
	case ws.MsgAddAI:
		h.handleAddAI(client, msg.Data)
	case ws.MsgRemoveAI:
		h.handleRemoveAI(client, msg.Data)
	case ws.MsgStartGame:
		h.handleStartGame(client)
	case ws.MsgSubmitClues:
		h.handleSubmitClues(client, msg.Data)
	case ws.MsgSubmitIntercept:
		h.handleSubmitIntercept(client, msg.Data)
	case ws.MsgSubmitDecrypt:
		h.handleSubmitDecrypt(client, msg.Data)
	case ws.MsgRequestSync:
		h.handleRequestSync(client)
	case "_disconnect":
		h.handleDisconnect(client)
	default:
		client.SendError("unknown message type: " + msg.Type)
	}
}

func (h *Handler) handleCreateRoom(client *ws.Client, data json.RawMessage) {
	var req ws.CreateRoomData
	if err := json.Unmarshal(data, &req); err != nil {
		client.SendError("invalid create_room data")
		return
	}
	if req.Nickname == "" {
		client.SendError("nickname is required")
		return
	}
	client.PlayerID = uuid.NewString()
	client.Nickname = req.Nickname

	owner := &room.PlayerInfo{ID: client.PlayerID, Nickname: req.Nickname}
	r := h.RoomManager.CreateRoom(owner)
	h.Hub.JoinRoom(client, r.Code)

	client.SendMessage(ws.ServerMessage{
		Type: ws.MsgRoomCreated,
		Data: ws.RoomCreatedData{RoomCode: r.Code},
	})

	log.Printf("Room %s created by %s (%s)", r.Code, req.Nickname, client.PlayerID)
}

func (h *Handler) handleJoinRoom(client *ws.Client, data json.RawMessage) {
	var req ws.JoinRoomData
	if err := json.Unmarshal(data, &req); err != nil {
		client.SendError("invalid join_room data")
		return
	}
	r := h.RoomManager.GetRoom(req.RoomCode)
	if r == nil {
		client.SendError("room not found")
		return
	}
	if r.Started {
		client.SendError("game already started")
		return
	}
	client.PlayerID = uuid.NewString()
	client.Nickname = req.Nickname
	h.Hub.JoinRoom(client, r.Code)

	log.Printf("Player %s (%s) joined room %s", req.Nickname, client.PlayerID, r.Code)
	h.broadcastRoomState(r)
}

func (h *Handler) handleSelectTeam(client *ws.Client, data json.RawMessage) {
	var req ws.SelectTeamData
	if err := json.Unmarshal(data, &req); err != nil {
		client.SendError("invalid select_team data")
		return
	}
	r := h.RoomManager.GetRoom(client.RoomCode)
	if r == nil {
		client.SendError("not in a room")
		return
	}
	player := &room.PlayerInfo{ID: client.PlayerID, Nickname: client.Nickname}
	if err := r.AddToTeam(player, req.Team); err != nil {
		client.SendError(err.Error())
		return
	}
	h.broadcastRoomState(r)
}

func (h *Handler) handleLeaveTeam(client *ws.Client) {
	r := h.RoomManager.GetRoom(client.RoomCode)
	if r == nil {
		client.SendError("not in a room")
		return
	}
	r.RemovePlayer(client.PlayerID)
	h.broadcastRoomState(r)
}

func (h *Handler) handleAddAI(client *ws.Client, data json.RawMessage) {
	var req ws.AddAIData
	if err := json.Unmarshal(data, &req); err != nil {
		client.SendError("invalid add_ai data")
		return
	}
	r := h.RoomManager.GetRoom(client.RoomCode)
	if r == nil {
		client.SendError("not in a room")
		return
	}
	if client.PlayerID != r.OwnerID {
		client.SendError("only room owner can add AI")
		return
	}
	if err := r.AddAI(req.Team); err != nil {
		client.SendError(err.Error())
		return
	}
	h.broadcastRoomState(r)
}

func (h *Handler) handleRemoveAI(client *ws.Client, data json.RawMessage) {
	var req ws.RemoveAIData
	if err := json.Unmarshal(data, &req); err != nil {
		client.SendError("invalid remove_ai data")
		return
	}
	r := h.RoomManager.GetRoom(client.RoomCode)
	if r == nil {
		client.SendError("not in a room")
		return
	}
	if client.PlayerID != r.OwnerID {
		client.SendError("only room owner can remove AI")
		return
	}
	if err := r.RemoveAI(req.Team, req.Index); err != nil {
		client.SendError(err.Error())
		return
	}
	h.broadcastRoomState(r)
}

func (h *Handler) handleStartGame(client *ws.Client) {
	r := h.RoomManager.GetRoom(client.RoomCode)
	if r == nil {
		client.SendError("not in a room")
		return
	}
	if client.PlayerID != r.OwnerID {
		client.SendError("only room owner can start game")
		return
	}
	if !r.CanStart() {
		client.SendError("both teams need at least 2 players")
		return
	}

	bridge, err := game.NewBridge(r, h.Hub)
	if err != nil {
		client.SendError("failed to start game: " + err.Error())
		return
	}
	bridge.Start()
	log.Printf("Game started in room %s", r.Code)
}

func (h *Handler) handleSubmitClues(client *ws.Client, data json.RawMessage) {
	var req ws.SubmitCluesData
	if err := json.Unmarshal(data, &req); err != nil {
		client.SendError("invalid submit_clues data")
		return
	}
	r := h.RoomManager.GetRoom(client.RoomCode)
	if r == nil || r.SessionID == "" {
		client.SendError("no active game")
		return
	}
	b, ok := game.GetBridge(r.SessionID)
	if !ok {
		client.SendError("game session not found")
		return
	}
	// Validate: is this player the current encryptor?
	round := b.Session.GetCurrentRound()
	if round == nil || round.EncryptPlayer().UID != client.PlayerID {
		client.SendError("you are not the encryptor")
		return
	}
	select {
	case b.CluesCh <- req.Clues:
	default:
		client.SendError("clues not expected at this time")
	}
}

func (h *Handler) handleSubmitIntercept(client *ws.Client, data json.RawMessage) {
	var req ws.SubmitGuessData
	if err := json.Unmarshal(data, &req); err != nil {
		client.SendError("invalid submit_intercept data")
		return
	}
	r := h.RoomManager.GetRoom(client.RoomCode)
	if r == nil || r.SessionID == "" {
		client.SendError("no active game")
		return
	}
	b, ok := game.GetBridge(r.SessionID)
	if !ok {
		client.SendError("game session not found")
		return
	}
	select {
	case b.InterceptCh <- req.Guess:
	default:
		client.SendError("intercept not expected at this time")
	}
}

func (h *Handler) handleSubmitDecrypt(client *ws.Client, data json.RawMessage) {
	var req ws.SubmitGuessData
	if err := json.Unmarshal(data, &req); err != nil {
		client.SendError("invalid submit_decrypt data")
		return
	}
	r := h.RoomManager.GetRoom(client.RoomCode)
	if r == nil || r.SessionID == "" {
		client.SendError("no active game")
		return
	}
	b, ok := game.GetBridge(r.SessionID)
	if !ok {
		client.SendError("game session not found")
		return
	}
	select {
	case b.DecryptCh <- req.Guess:
	default:
		client.SendError("decrypt not expected at this time")
	}
}

func (h *Handler) handleRequestSync(client *ws.Client) {
	r := h.RoomManager.GetRoom(client.RoomCode)
	if r == nil {
		client.SendError("not in a room")
		return
	}
	syncData := ws.FullSyncData{
		Room: h.buildRoomStateData(r),
	}
	if r.SessionID != "" {
		b, ok := game.GetBridge(r.SessionID)
		if ok {
			round := b.Session.GetCurrentRound()
			if round != nil {
				teamLabel := b.playerTeamLabel(client.PlayerID)
				var words []string
				if teamLabel == "A" {
					w := b.Session.GetTeams()[0].GetWords()
					words = w[:]
				} else {
					w := b.Session.GetTeams()[1].GetWords()
					words = w[:]
				}
				scoreA, scoreB := b.buildScores()
				gameSyncData := &ws.GameSyncData{
					Phase:    stateToPhase(round.GetTeamState()),
					Round:    int(round.GetNumberOfRounds()),
					YourRole: b.playerRole(client.PlayerID, round),
					YourTeam: teamLabel,
					Words:    words,
					History:  b.buildHistory(round),
					ScoreA:   scoreA,
					ScoreB:   scoreB,
				}
				// Include clues if available
				clues := round.GetEncryptedMessage()
				if clues != [3]string{} {
					gameSyncData.Clues = clues[:]
				}
				syncData.Game = gameSyncData
			}
		}
	}
	client.SendMessage(ws.ServerMessage{
		Type: ws.MsgFullSync,
		Data: syncData,
	})
}

func (h *Handler) handleDisconnect(client *ws.Client) {
	r := h.RoomManager.GetRoom(client.RoomCode)
	if r == nil {
		return
	}
	if !r.Started {
		r.RemovePlayer(client.PlayerID)
		h.broadcastRoomState(r)
	}
	// During game, player slot is preserved (they can reconnect)
}

func (h *Handler) broadcastRoomState(r *room.Room) {
	h.Hub.BroadcastToRoom(r.Code, ws.ServerMessage{
		Type: ws.MsgRoomState,
		Data: h.buildRoomStateData(r),
	})
}

func (h *Handler) buildRoomStateData(r *room.Room) *ws.RoomStateData {
	allPlayers := r.GetAllPlayers()
	players := make([]ws.PlayerInfo, len(allPlayers))
	for i, p := range allPlayers {
		players[i] = ws.PlayerInfo{ID: p.ID, Nickname: p.Nickname, IsAI: p.IsAI}
	}
	teamA := make([]ws.PlayerInfo, len(r.TeamA))
	for i, p := range r.TeamA {
		teamA[i] = ws.PlayerInfo{ID: p.ID, Nickname: p.Nickname, IsAI: p.IsAI}
	}
	teamB := make([]ws.PlayerInfo, len(r.TeamB))
	for i, p := range r.TeamB {
		teamB[i] = ws.PlayerInfo{ID: p.ID, Nickname: p.Nickname, IsAI: p.IsAI}
	}
	return &ws.RoomStateData{
		RoomCode: r.Code,
		Players:  players,
		TeamA:    teamA,
		TeamB:    teamB,
		OwnerID:  r.OwnerID,
		CanStart: r.CanStart(),
	}
}

func stateToPhase(state core.TeamState) string {
	switch state {
	case core.ENCRYPTING:
		return "encrypting"
	case core.INTERCEPT:
		return "intercept"
	case core.DECRYPT:
		return "decrypt"
	default:
		return "waiting"
	}
}
```

- [ ] **Step 2: Update main.go**

```go
// cmd/server/main.go
package main

import (
	"log"
	"net/http"

	"github.com/ZinkLu/decrypto-the-game/internal/game"
	"github.com/ZinkLu/decrypto-the-game/internal/room"
	"github.com/ZinkLu/decrypto-the-game/internal/server"
	"github.com/ZinkLu/decrypto-the-game/internal/ws"
)

func main() {
	// Register game handlers (once at startup)
	game.RegisterHandlers()

	// Create room manager
	roomManager := room.NewManager()

	// Create handler (needs hub reference, set below)
	var hub *ws.Hub
	handler := server.NewHandler(roomManager, nil)

	// Create hub with handler
	hub = ws.NewHub(handler.HandleMessage)
	handler.Hub = hub

	// Start hub
	go hub.Run()

	// Serve static files from web directory
	http.Handle("/", http.FileServer(http.Dir("web/dist")))

	// WebSocket endpoint
	http.HandleFunc("/ws", hub.ServeWS)

	log.Println("Starting Decrypto server on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /Users/zinklu/code/decrypto-the-game && go build ./cmd/server/`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add internal/server/handler.go cmd/server/main.go
git commit -m "feat: wire up WebSocket server with message dispatch"
```

---

### Task 6: Frontend WebSocket Service & Zustand Store

**Files:**
- Create: `web/src/services/websocket.ts`
- Create: `web/src/store/gameStore.ts`

- [ ] **Step 1: Create the WebSocket service**

```typescript
// web/src/services/websocket.ts

type MessageHandler = (type: string, data: unknown) => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private handler: MessageHandler;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;

  constructor(url: string, handler: MessageHandler) {
    this.url = url;
    this.handler = handler;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.handler('_connected', {});
    };

    this.ws.onclose = () => {
      this.handler('_disconnected', {});
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handler(msg.type, msg.data);
      } catch {
        console.error('Failed to parse WebSocket message:', event.data);
      }
    };
  }

  send(type: string, data: unknown = {}) {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected, dropping message:', type);
      return;
    }
    this.ws.send(JSON.stringify({ type, data }));
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10000);
      this.connect();
    }, this.reconnectDelay);
  }
}
```

- [ ] **Step 2: Create the Zustand store**

```typescript
// web/src/store/gameStore.ts
import { create } from 'zustand';
import { WebSocketService } from '../services/websocket';

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

export type GamePhase = 'home' | 'room' | 'encrypting' | 'intercept' | 'decrypt' | 'round_result' | 'game_over';
export type PlayerRole = 'encryptor' | 'teammate' | 'opponent' | '';

interface RoundResult {
  intercept_success?: boolean;
  decrypt_success?: boolean;
}

interface GameOverInfo {
  winner: string | null;
}

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
  roundResult: RoundResult | null;
  gameOver: GameOverInfo | null;

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
  scoreA: { interceptions: 0, decrypt_failures: 0 },
  scoreB: { interceptions: 0, decrypt_failures: 0 },
  roundResult: null as RoundResult | null,
  gameOver: null as GameOverInfo | null,
};

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,

  connect: () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;

    const service = new WebSocketService(url, (type, data) => {
      handleServerMessage(set, get, type, data);
    });
    service.connect();
    set({ wsService: service });
  },

  disconnect: () => {
    get().wsService?.disconnect();
    set({ ...initialState });
  },

  createRoom: (nickname) => {
    get().wsService?.send('create_room', { nickname });
  },

  joinRoom: (code, nickname) => {
    get().wsService?.send('join_room', { room_code: code, nickname });
  },

  selectTeam: (team) => {
    get().wsService?.send('select_team', { team });
  },

  leaveTeam: () => {
    get().wsService?.send('leave_team', {});
  },

  addAI: (team) => {
    get().wsService?.send('add_ai', { team });
  },

  removeAI: (team, index) => {
    get().wsService?.send('remove_ai', { team, index });
  },

  startGame: () => {
    get().wsService?.send('start_game', {});
  },

  submitClues: (clues) => {
    get().wsService?.send('submit_clues', { clues });
  },

  submitIntercept: (guess) => {
    get().wsService?.send('submit_intercept', { guess });
  },

  submitDecrypt: (guess) => {
    get().wsService?.send('submit_decrypt', { guess });
  },

  requestSync: () => {
    get().wsService?.send('request_sync', {});
  },

  reset: () => {
    get().wsService?.disconnect();
    set({ ...initialState });
  },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleServerMessage(set: any, get: any, type: string, data: any) {
  switch (type) {
    case '_connected':
      set({ connected: true });
      // If we were in a room, request sync
      if (get().roomCode) {
        get().wsService?.send('request_sync', {});
      }
      break;

    case '_disconnected':
      set({ connected: false });
      break;

    case 'room_created':
      set({ roomCode: data.room_code, phase: 'room' });
      break;

    case 'room_state':
      set({
        roomCode: data.room_code,
        players: data.players,
        teamA: data.team_a,
        teamB: data.team_b,
        ownerID: data.owner_id,
        canStart: data.can_start,
        phase: 'room',
      });
      break;

    case 'game_start':
      set({
        round: data.round,
        myRole: data.your_role,
        myTeam: data.your_team,
        myWords: data.words,
        // Phase will be set by the subsequent phase_change message
      });
      break;

    case 'phase_change':
      set({
        phase: data.phase === 'new_round' ? get().phase : data.phase,
        round: data.round,
        myRole: data.your_role,
        encryptor: data.encryptor || '',
        secretDigits: data.secret_digits || [],
        secretWords: data.secret_words || [],
        clues: data.clues || [],
        history: data.history || get().history,
        waiting: data.waiting || false,
        roundResult: null, // clear previous result
      });
      break;

    case 'clues_submitted':
      set({ clues: data.clues });
      break;

    case 'round_result':
      set({
        roundResult: {
          intercept_success: data.intercept_success,
          decrypt_success: data.decrypt_success,
        },
        scoreA: data.score_a,
        scoreB: data.score_b,
        phase: 'round_result',
      });
      break;

    case 'game_over':
      set({
        gameOver: { winner: data.winner },
        scoreA: data.score_a,
        scoreB: data.score_b,
        phase: 'game_over',
      });
      break;

    case 'full_sync':
      if (data.room) {
        set({
          roomCode: data.room.room_code,
          players: data.room.players,
          teamA: data.room.team_a,
          teamB: data.room.team_b,
          ownerID: data.room.owner_id,
          canStart: data.room.can_start,
        });
      }
      if (data.game) {
        set({
          phase: data.game.phase,
          round: data.game.round,
          myRole: data.game.your_role,
          myTeam: data.game.your_team,
          myWords: data.game.words,
          clues: data.game.clues || [],
          secretDigits: data.game.secret_digits || [],
          secretWords: data.game.secret_words || [],
          history: data.game.history || [],
          scoreA: data.game.score_a,
          scoreB: data.game.score_b,
        });
      } else {
        set({ phase: 'room' });
      }
      break;

    case 'error':
      console.error('Server error:', data.message);
      // Could add a toast notification system here later
      break;
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/zinklu/code/decrypto-the-game/web && npx tsc --noEmit`
Expected: no errors (or only pre-existing ones unrelated to new files)

- [ ] **Step 4: Commit**

```bash
git add web/src/services/websocket.ts web/src/store/gameStore.ts
git commit -m "feat: add frontend WebSocket service and Zustand store"
```

---

### Task 7: Frontend Room Page

**Files:**
- Create: `web/src/pages/Room.tsx`

- [ ] **Step 1: Create the Room page**

This is the lobby/team selection page. Players see two team columns, can click to join a team, the room owner can add AI and start the game.

```tsx
// web/src/pages/Room.tsx
import { useState } from 'react';
import { rawColors } from '../theme/colors';
import {
  ManilaFolder, RubberStamp, TypewriterText, DossierButton,
  WaxSeal, DossierEffectLayer, AgentPanel,
} from '../components/dossier';
import { useGameStore } from '../store/gameStore';
import type { PlayerInfo } from '../store/gameStore';

function TeamColumn({ team, label, players, isOwner, onJoin, onAddAI, onRemoveAI }: {
  team: string;
  label: string;
  players: PlayerInfo[];
  isOwner: boolean;
  onJoin: () => void;
  onAddAI: () => void;
  onRemoveAI: (index: number) => void;
}) {
  const color = team === 'A' ? rawColors.teamFriendly : rawColors.intelRed;
  const dimColor = team === 'A' ? `${rawColors.teamFriendly}40` : `${rawColors.intelRed}40`;

  return (
    <div
      className="flex-1 p-4 rounded-lg"
      style={{ background: `${color}08`, border: `2px solid ${dimColor}` }}
    >
      <div className="text-center mb-4">
        <span
          className="text-lg tracking-widest"
          style={{ fontFamily: "'Bebas Neue', sans-serif", color }}
        >
          TEAM {label}
        </span>
        <div className="text-xs mt-1" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.brassDim }}>
          {players.length}/4 特工
        </div>
      </div>

      <div className="space-y-2 min-h-[120px]">
        {players.map((p, i) => (
          <div
            key={p.id}
            className="flex items-center gap-2 px-3 py-2 rounded"
            style={{ background: `${color}10`, border: `1px solid ${dimColor}` }}
          >
            <span className="text-sm" style={{ color: p.is_ai ? rawColors.brass : rawColors.cream }}>
              {p.is_ai ? '🤖' : '👤'}
            </span>
            <span
              className="flex-1 text-sm truncate"
              style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.cream }}
            >
              {p.nickname}
            </span>
            {p.is_ai && isOwner && (
              <button
                className="text-xs cursor-pointer"
                style={{ color: rawColors.intelRed, background: 'none', border: 'none' }}
                onClick={() => onRemoveAI(i)}
              >
                [移除]
              </button>
            )}
          </div>
        ))}

        {players.length < 4 && (
          <div className="flex gap-2 mt-2">
            <button
              className="flex-1 py-2 rounded text-xs cursor-pointer"
              style={{
                fontFamily: "'Courier Prime', monospace",
                color,
                background: 'transparent',
                border: `1px dashed ${dimColor}`,
              }}
              onClick={onJoin}
            >
              + 加入
            </button>
            {isOwner && (
              <button
                className="flex-1 py-2 rounded text-xs cursor-pointer"
                style={{
                  fontFamily: "'Courier Prime', monospace",
                  color: rawColors.brass,
                  background: 'transparent',
                  border: `1px dashed ${rawColors.brass}40`,
                }}
                onClick={onAddAI}
              >
                + AI
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Room() {
  const {
    roomCode, teamA, teamB, ownerID, canStart, myPlayerID,
    selectTeam, addAI, removeAI, startGame,
  } = useGameStore();
  const [copied, setCopied] = useState(false);

  const isOwner = myPlayerID === ownerID;

  const handleCopyCode = () => {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ backgroundColor: rawColors.bgBase }}
    >
      <DossierEffectLayer />
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${rawColors.navyDark} 0%, ${rawColors.navy} 30%, ${rawColors.deskWoodDark} 100%)`,
        }}
      />

      <div className="relative z-10 flex items-center justify-center h-full p-4">
        <ManilaFolder tabLabel="BRIEFING ROOM" className="max-w-2xl w-full">
          <div className="flex justify-between items-start mb-4">
            <WaxSeal size="small" />
            <RubberStamp text="CLASSIFIED" color="red" size="small" rotation={-6} />
          </div>

          {/* Room code */}
          <div className="text-center mb-4">
            <TypewriterText text="ROOM CODE" size="medium" color="dark" />
            <div className="mt-2 flex items-center justify-center gap-2">
              <span
                className="text-3xl tracking-[0.5em] font-bold"
                style={{ fontFamily: "'Bebas Neue', sans-serif", color: rawColors.brass }}
              >
                {roomCode}
              </span>
              <button
                className="text-xs px-2 py-1 rounded cursor-pointer"
                style={{
                  fontFamily: "'Courier Prime', monospace",
                  color: copied ? rawColors.teamFriendly : rawColors.brass,
                  background: 'transparent',
                  border: `1px solid ${rawColors.brass}40`,
                }}
                onClick={handleCopyCode}
              >
                {copied ? '已复制' : '复制'}
              </button>
            </div>
          </div>

          <div className="mx-4 my-3 border-t border-dashed" style={{ borderColor: rawColors.creamDark }} />

          {/* Teams */}
          <div className="flex gap-4">
            <TeamColumn
              team="A"
              label="ALPHA"
              players={teamA}
              isOwner={isOwner}
              onJoin={() => selectTeam('A')}
              onAddAI={() => addAI('A')}
              onRemoveAI={(i) => removeAI('A', i)}
            />
            <TeamColumn
              team="B"
              label="BRAVO"
              players={teamB}
              isOwner={isOwner}
              onJoin={() => selectTeam('B')}
              onAddAI={() => addAI('B')}
              onRemoveAI={(i) => removeAI('B', i)}
            />
          </div>

          {/* Start button */}
          {isOwner && (
            <div className="flex justify-center mt-6">
              <DossierButton
                variant="stamp"
                team="friendly"
                size="large"
                onClick={startGame}
                disabled={!canStart}
              >
                {canStart ? 'COMMENCE OPERATION' : 'AWAITING OPERATIVES...'}
              </DossierButton>
            </div>
          )}

          {!isOwner && (
            <div className="mt-6">
              <AgentPanel emoji="⏳" message="等待房主开始行动…" theme="friendly" />
            </div>
          )}
        </ManilaFolder>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/zinklu/code/decrypto-the-game/web && npx tsc --noEmit`
Expected: no errors related to Room.tsx

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/Room.tsx
git commit -m "feat: add Room lobby page with team selection and AI controls"
```

---

### Task 8: Frontend RoundResult & GameOver Pages

**Files:**
- Create: `web/src/pages/RoundResult.tsx`
- Create: `web/src/pages/GameOver.tsx`

- [ ] **Step 1: Create RoundResult page**

A brief overlay that shows for a few seconds after each round.

```tsx
// web/src/pages/RoundResult.tsx
import { rawColors } from '../theme/colors';
import { DossierEffectLayer, AgentPanel, RubberStamp } from '../components/dossier';
import { useGameStore } from '../store/gameStore';

export default function RoundResult() {
  const { roundResult, scoreA, scoreB, round } = useGameStore();

  if (!roundResult) return null;

  const intercepted = roundResult.intercept_success !== undefined;
  const interceptSuccess = roundResult.intercept_success === true;
  const decryptSuccess = roundResult.decrypt_success === true;
  const decryptFailed = roundResult.decrypt_success === false;

  let stampText = '';
  let stampColor: 'red' | 'green' = 'green';
  let emoji = '📋';
  let message = '';

  if (interceptSuccess) {
    stampText = 'INTERCEPTED';
    stampColor = 'red';
    emoji = '🚨';
    message = '密码被拦截！';
  } else if (decryptFailed) {
    stampText = 'DECRYPT FAIL';
    stampColor = 'red';
    emoji = '❌';
    message = '解密失败！';
  } else if (decryptSuccess) {
    stampText = 'DECODED';
    stampColor = 'green';
    emoji = '✅';
    message = '解密成功！';
  } else if (intercepted && !interceptSuccess) {
    stampText = 'SECURE';
    stampColor = 'green';
    emoji = '🛡️';
    message = '拦截未成功，进入解密阶段';
  }

  return (
    <div
      className="relative w-full h-full overflow-hidden flex items-center justify-center"
      style={{ background: `linear-gradient(180deg, ${rawColors.navyDark} 0%, ${rawColors.bgDark} 100%)` }}
    >
      <DossierEffectLayer />
      <div className="relative z-10 text-center space-y-6">
        <div className="text-sm tracking-widest" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.brassDim }}>
          第 {round} 轮结果
        </div>

        <RubberStamp text={stampText} color={stampColor} size="large" rotation={-4} animated />

        {/* Scoreboard */}
        <div className="flex justify-center gap-8 mt-6">
          <div className="text-center">
            <div className="text-xs tracking-widest mb-2" style={{ fontFamily: "'Bebas Neue', sans-serif", color: rawColors.teamFriendly }}>
              TEAM ALPHA
            </div>
            <div className="text-sm" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.cream }}>
              拦截 {scoreA.interceptions}/2 | 失误 {scoreA.decrypt_failures}/2
            </div>
          </div>
          <div className="w-px" style={{ background: rawColors.brassDim }} />
          <div className="text-center">
            <div className="text-xs tracking-widest mb-2" style={{ fontFamily: "'Bebas Neue', sans-serif", color: rawColors.intelRed }}>
              TEAM BRAVO
            </div>
            <div className="text-sm" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.cream }}>
              拦截 {scoreB.interceptions}/2 | 失误 {scoreB.decrypt_failures}/2
            </div>
          </div>
        </div>

        <div className="text-xs" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.brassDim }}>
          下一轮即将开始…
        </div>

        <AgentPanel emoji={emoji} message={message} theme="friendly" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create GameOver page**

```tsx
// web/src/pages/GameOver.tsx
import { rawColors } from '../theme/colors';
import { ManilaFolder, RubberStamp, TypewriterText, DossierButton, DossierEffectLayer } from '../components/dossier';
import { useGameStore } from '../store/gameStore';

export default function GameOver() {
  const { gameOver, scoreA, scoreB, myTeam, reset } = useGameStore();

  if (!gameOver) return null;

  const iWon = gameOver.winner === myTeam;
  const isDraw = gameOver.winner === null;

  let stampText = 'MISSION COMPLETE';
  let stampColor: 'red' | 'green' = 'green';
  if (isDraw) {
    stampText = 'STALEMATE';
    stampColor = 'red';
  } else if (!iWon) {
    stampText = 'COMPROMISED';
    stampColor = 'red';
  }

  return (
    <div
      className="relative w-full h-full overflow-hidden flex items-center justify-center"
      style={{ background: `linear-gradient(180deg, ${rawColors.navyDark} 0%, ${rawColors.bgDark} 100%)` }}
    >
      <DossierEffectLayer />

      <div className="relative z-10">
        <ManilaFolder tabLabel="AFTER ACTION REPORT" className="max-w-lg w-full">
          <div className="text-center mb-6">
            <RubberStamp text={stampText} color={stampColor} size="large" rotation={-3} animated />
          </div>

          <div className="text-center mb-6">
            <TypewriterText
              text={isDraw ? 'MISSION INCONCLUSIVE' : iWon ? 'VICTORY' : 'DEFEAT'}
              size="large"
              color="dark"
            />
            {!isDraw && (
              <div className="mt-2" style={{ fontFamily: "'Noto Serif SC', serif", color: rawColors.inkBlack }}>
                获胜方: Team {gameOver.winner === 'A' ? 'Alpha' : 'Bravo'}
              </div>
            )}
          </div>

          <div className="mx-4 my-4 border-t border-dashed" style={{ borderColor: rawColors.creamDark }} />

          {/* Final scores */}
          <div className="flex justify-center gap-8">
            <div className="text-center">
              <div className="text-sm tracking-widest mb-2" style={{ fontFamily: "'Bebas Neue', sans-serif", color: rawColors.teamFriendly }}>
                ALPHA
              </div>
              <div className="space-y-1">
                <div className="text-sm" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.inkBlack }}>
                  成功拦截: {scoreA.interceptions}
                </div>
                <div className="text-sm" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.inkBlack }}>
                  解密失误: {scoreA.decrypt_failures}
                </div>
              </div>
            </div>
            <div className="w-px" style={{ background: rawColors.creamDark }} />
            <div className="text-center">
              <div className="text-sm tracking-widest mb-2" style={{ fontFamily: "'Bebas Neue', sans-serif", color: rawColors.intelRed }}>
                BRAVO
              </div>
              <div className="space-y-1">
                <div className="text-sm" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.inkBlack }}>
                  成功拦截: {scoreB.interceptions}
                </div>
                <div className="text-sm" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.inkBlack }}>
                  解密失误: {scoreB.decrypt_failures}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-center mt-6">
            <DossierButton variant="primary" size="large" onClick={reset}>
              RETURN TO BASE
            </DossierButton>
          </div>
        </ManilaFolder>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/zinklu/code/decrypto-the-game/web && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/RoundResult.tsx web/src/pages/GameOver.tsx
git commit -m "feat: add RoundResult and GameOver frontend pages"
```

---

### Task 9: Update App.tsx Routing

**Files:**
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Replace debug routing with store-driven routing**

Replace the entire `App.tsx` with store-driven page selection:

```tsx
// web/src/App.tsx
import { useEffect } from 'react';
import Home from './pages/Home';
import Room from './pages/Room';
import Encryptor from './pages/Encryptor';
import TeammateWaiting from './pages/TeammateWaiting';
import OpponentWaiting from './pages/OpponentWaiting';
import EncryptorWatching from './pages/EncryptorWatching';
import TeammateDecoding from './pages/TeammateDecoding';
import OpponentAnalyzing from './pages/OpponentAnalyzing';
import InterceptedWaiting from './pages/InterceptedWaiting';
import OpponentIntercepting from './pages/OpponentIntercepting';
import RoundResult from './pages/RoundResult';
import GameOver from './pages/GameOver';
import { useGameStore } from './store/gameStore';
import type { GamePhase, PlayerRole } from './store/gameStore';

function getPageComponent(phase: GamePhase, role: PlayerRole): React.FC {
  switch (phase) {
    case 'home':
      return Home;
    case 'room':
      return Room;
    case 'encrypting':
      if (role === 'encryptor') return Encryptor;
      if (role === 'teammate') return TeammateWaiting;
      return OpponentWaiting;
    case 'intercept':
      if (role === 'opponent') return OpponentIntercepting;
      return InterceptedWaiting;
    case 'decrypt':
      if (role === 'encryptor') return EncryptorWatching;
      if (role === 'teammate') return TeammateDecoding;
      return OpponentAnalyzing;
    case 'round_result':
      return RoundResult;
    case 'game_over':
      return GameOver;
    default:
      return Home;
  }
}

export default function App() {
  const { phase, myRole, connect } = useGameStore();

  useEffect(() => {
    connect();
  }, [connect]);

  const PageComponent = getPageComponent(phase, myRole);

  return (
    <main className="w-full h-full relative">
      <PageComponent />
    </main>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/zinklu/code/decrypto-the-game/web && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add web/src/App.tsx
git commit -m "feat: replace debug routing with store-driven page navigation"
```

---

### Task 10: Update Home Page

**Files:**
- Modify: `web/src/pages/Home.tsx`

- [ ] **Step 1: Wire Home page buttons to store actions**

Add a join dialog and connect CREATE/JOIN buttons to the Zustand store:

```tsx
// web/src/pages/Home.tsx
import { useState } from 'react';
import { rawColors } from '../theme/colors';
import {
  ManilaFolder, RubberStamp, TypewriterText, DossierButton,
  WaxSeal, DossierEffectLayer, TypewriterInput,
} from '../components/dossier';
import { useGameStore } from '../store/gameStore';

export default function Home() {
  const { connected, createRoom, joinRoom } = useGameStore();
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');

  const handleCreate = () => {
    if (nickname.trim()) {
      createRoom(nickname.trim());
    }
  };

  const handleJoin = () => {
    if (nickname.trim() && roomCode.trim()) {
      joinRoom(roomCode.trim().toUpperCase(), nickname.trim());
    }
  };

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ backgroundColor: rawColors.bgBase }}
    >
      <DossierEffectLayer />
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${rawColors.navyDark} 0%, ${rawColors.navy} 30%, ${rawColors.deskWoodDark} 100%)`,
        }}
      />

      <div className="relative z-10 flex items-center justify-center h-full p-6">
        <ManilaFolder tabLabel="CLASSIFIED" className="max-w-lg w-full">
          <div className="flex justify-between items-start mb-6">
            <WaxSeal size="medium" />
            <RubberStamp text="TOP SECRET" color="red" size="medium" rotation={-4} />
          </div>

          <div className="text-center mb-6">
            <TypewriterText text="OPERATION: DECRYPTO" size="large" color="dark" as="h1" />
            <div
              className="mt-2"
              style={{
                fontFamily: "'Noto Serif SC', serif",
                fontSize: '1rem',
                color: rawColors.inkBlack,
                opacity: 0.7,
              }}
            >
              团队暗号破解通信系统
            </div>
          </div>

          <div className="mx-8 my-4 border-t border-dashed" style={{ borderColor: rawColors.creamDark }} />

          {mode === 'menu' && (
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <DossierButton variant="primary" size="large" onClick={() => setMode('create')}>
                CREATE ROOM
              </DossierButton>
              <DossierButton variant="secondary" size="large" onClick={() => setMode('join')}>
                JOIN ROOM
              </DossierButton>
            </div>
          )}

          {mode === 'create' && (
            <div className="space-y-4 max-w-xs mx-auto">
              <TypewriterInput
                value={nickname}
                onChange={setNickname}
                placeholder="输入代号…"
                maxLength={12}
                color="dark"
              />
              <div className="flex gap-3 justify-center">
                <DossierButton variant="secondary" size="medium" onClick={() => setMode('menu')}>
                  BACK
                </DossierButton>
                <DossierButton
                  variant="primary"
                  size="medium"
                  onClick={handleCreate}
                  disabled={!nickname.trim()}
                >
                  CREATE
                </DossierButton>
              </div>
            </div>
          )}

          {mode === 'join' && (
            <div className="space-y-4 max-w-xs mx-auto">
              <TypewriterInput
                value={nickname}
                onChange={setNickname}
                placeholder="输入代号…"
                maxLength={12}
                color="dark"
              />
              <TypewriterInput
                value={roomCode}
                onChange={(v) => setRoomCode(v.toUpperCase())}
                placeholder="输入房间码…"
                maxLength={4}
                color="dark"
              />
              <div className="flex gap-3 justify-center">
                <DossierButton variant="secondary" size="medium" onClick={() => setMode('menu')}>
                  BACK
                </DossierButton>
                <DossierButton
                  variant="primary"
                  size="medium"
                  onClick={handleJoin}
                  disabled={!nickname.trim() || roomCode.trim().length !== 4}
                >
                  JOIN
                </DossierButton>
              </div>
            </div>
          )}

          {/* Status panel */}
          <div
            className="flex items-center justify-center gap-4 mt-6 p-3 rounded"
            style={{
              backgroundColor: rawColors.creamDark,
              border: `1px solid ${rawColors.brass}40`,
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.inkBlack }}>
                STATUS:
              </span>
              <span
                className="text-xs font-bold"
                style={{
                  fontFamily: "'Courier Prime', monospace",
                  color: connected ? rawColors.teamFriendly : rawColors.intelRed,
                }}
              >
                {connected ? 'CONNECTED' : 'CONNECTING...'}
              </span>
            </div>
          </div>

          <div className="mt-6 text-center">
            <span
              className="text-sm italic"
              style={{
                fontFamily: "'Courier Prime', monospace",
                color: rawColors.inkBlack,
                opacity: 0.5,
              }}
            >
              Awaiting operative instructions...
            </span>
          </div>
        </ManilaFolder>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/zinklu/code/decrypto-the-game/web && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/Home.tsx
git commit -m "feat: wire Home page to store with create/join room flows"
```

---

### Task 11: Update Existing Game Pages to Use Store

**Files:**
- Modify: `web/src/pages/Encryptor.tsx`
- Modify: `web/src/pages/TeammateDecoding.tsx`
- Modify: `web/src/pages/OpponentIntercepting.tsx`
- Modify: `web/src/pages/TeammateWaiting.tsx`
- Modify: `web/src/pages/OpponentWaiting.tsx`
- Modify: `web/src/pages/EncryptorWatching.tsx`
- Modify: `web/src/pages/OpponentAnalyzing.tsx`
- Modify: `web/src/pages/InterceptedWaiting.tsx`

All 8 existing game pages follow the same pattern:
1. Replace mock data `useState` calls with `useGameStore()` selectors
2. Replace local submit handlers with store action calls
3. Keep all existing UI/animation/theme logic untouched

- [ ] **Step 1: Update Encryptor.tsx**

Key changes:
- Remove mock `cards` and `history` state
- Read `secretDigits`, `secretWords`, `history` from store
- Call `submitClues()` on submit instead of `console.log`

In `Encryptor.tsx`, replace the mock card data initialization and submit handler:

Replace:
```tsx
const [cards, setCards] = useState<SecretCard[]>([
  { id: 1, number: 3, word: '咖啡', clue: '' },
  { id: 2, number: 1, word: '猫咪', clue: '' },
  { id: 3, number: 4, word: '钥匙', clue: '' },
]);
```

With data from the store:
```tsx
import { useGameStore } from '../store/gameStore';

// Inside component:
const { secretDigits, secretWords, history: gameHistory, submitClues } = useGameStore();

const [cards, setCards] = useState<SecretCard[]>(
  secretDigits.map((num, i) => ({
    id: i + 1,
    number: num,
    word: secretWords[i] || '',
    clue: '',
  }))
);
```

Replace the mock `history` state with `gameHistory` from the store.

Replace the `handleSubmit` function:
```tsx
const handleSubmit = () => {
  if (allCluesFilled) {
    setIsSubmitted(true);
    submitClues(cards.map((c) => c.clue) as [string, string, string]);
  }
};
```

- [ ] **Step 2: Update TeammateDecoding.tsx**

Key changes:
- Read `myWords`, `clues` from store
- Call `submitDecrypt()` on submit

Replace mock `codewords` and `slots` with store data:
```tsx
import { useGameStore } from '../store/gameStore';

const { myWords, clues, submitDecrypt } = useGameStore();

const codewords: CodeWord[] = myWords.map((word, i) => ({
  number: i + 1,
  word,
}));

const [slots, setSlots] = useState<ClueSlot[]>(
  clues.map((clue, i) => ({
    id: i + 1,
    clue,
    answer: null,
    status: 'empty',
    correctAnswer: 0, // server will validate, we don't know the answer
  }))
);
```

Replace `handleSubmit`:
```tsx
const handleSubmit = () => {
  if (!allFilled || submitted) return;
  setSubmitted(true);
  setMascotState('waitingResult');
  const guess = slots.map((s) => s.answer!) as [number, number, number];
  submitDecrypt(guess);
};
```

Remove the local `setTimeout` result simulation — the server will send `round_result`.

- [ ] **Step 3: Update OpponentIntercepting.tsx**

Key changes:
- Read `clues`, `history` from store
- Call `submitIntercept()` on submit

Replace mock `currentClues` and `intelData`:
```tsx
import { useGameStore } from '../store/gameStore';

const { clues: currentClues, history: gameHistory, submitIntercept } = useGameStore();
```

Replace `handleSubmit`:
```tsx
const handleSubmit = () => {
  if (!allFilled || submitted) return;
  setSubmitted(true);
  setMascotState('waiting');
  const guess = slots.map((s) => s.answer!) as [number, number, number];
  submitIntercept(guess);
};
```

- [ ] **Step 4: Update remaining 5 pages (waiting/watching pages)**

These pages are simpler — they mainly display status and don't take user input:

For **TeammateWaiting.tsx**, **OpponentWaiting.tsx**, **EncryptorWatching.tsx**, **OpponentAnalyzing.tsx**, **InterceptedWaiting.tsx**:

Add the store import and read relevant state:
```tsx
import { useGameStore } from '../store/gameStore';
const { round, encryptor, clues, history, scoreA, scoreB } = useGameStore();
```

Replace any hardcoded mock data with values from the store. The specific fields each page needs:

- **TeammateWaiting**: `encryptor` (who is encrypting), `round`
- **OpponentWaiting**: `encryptor`, `round`
- **EncryptorWatching**: `clues` (the clues you submitted), `round`
- **OpponentAnalyzing**: `clues`, `history`, `round`
- **InterceptedWaiting**: `round`

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd /Users/zinklu/code/decrypto-the-game/web && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/
git commit -m "feat: connect all game pages to Zustand store, remove mock data"
```

---

### Task 12: AI Player System

**Files:**
- Create: `internal/ai/provider.go`
- Create: `internal/ai/player.go`
- Create: `internal/ai/providers/claude.go`
- Modify: `internal/game/bridge.go` (replace AI stubs)

- [ ] **Step 1: Create the LLM provider interface**

```go
// internal/ai/provider.go
package ai

import "context"

// Message represents a chat message for the LLM.
type Message struct {
	Role    string `json:"role"`    // "system", "user", "assistant"
	Content string `json:"content"`
}

// LLMProvider is the interface for LLM API calls.
type LLMProvider interface {
	Complete(ctx context.Context, messages []Message) (string, error)
}
```

- [ ] **Step 2: Create the AI player logic**

```go
// internal/ai/player.go
package ai

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"
)

// AIPlayer uses an LLMProvider to play Decrypto.
type AIPlayer struct {
	Provider LLMProvider
}

func NewAIPlayer(provider LLMProvider) *AIPlayer {
	return &AIPlayer{Provider: provider}
}

const systemPrompt = `你是一个正在玩 Decrypto（谍报风云）桌游的 AI 玩家。

游戏规则：
- 两支队伍各有 4 个密语词（编号 1-4）
- 每轮，一名加密者获得 3 个数字密码（如 [3,1,4]），需要为对应的密语词各给出一个线索词
- 对方队伍根据线索猜测密码序列（拦截）
- 己方队伍根据线索猜测密码序列（解密）
- 线索要让队友能猜到，但不能太明显让对手也猜到

你需要认真思考后给出答案。`

// GenerateClues generates 3 clue words for the given secret words.
func (a *AIPlayer) GenerateClues(ctx context.Context, secretDigits [3]int, words [4]string, history string) [3]string {
	time.Sleep(2 * time.Second) // simulate thinking

	secretWords := [3]string{
		words[secretDigits[0]-1],
		words[secretDigits[1]-1],
		words[secretDigits[2]-1],
	}

	prompt := fmt.Sprintf(`你是加密者。你的队伍的 4 个密语词是：
1. %s  2. %s  3. %s  4. %s

本轮密码是 [%d, %d, %d]，对应密语词：%s、%s、%s

%s

请为这 3 个词各给出一个线索词（一个中文词语），用逗号分隔。
格式：线索1,线索2,线索3
只输出 3 个线索词，不要解释。`,
		words[0], words[1], words[2], words[3],
		secretDigits[0], secretDigits[1], secretDigits[2],
		secretWords[0], secretWords[1], secretWords[2],
		history)

	resp, err := a.Provider.Complete(ctx, []Message{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: prompt},
	})
	if err != nil {
		log.Printf("AI encrypt error: %v", err)
		return [3]string{"提示1", "提示2", "提示3"}
	}

	return parseClues(resp)
}

// GuessSequence guesses a 3-digit sequence based on clues.
func (a *AIPlayer) GuessSequence(ctx context.Context, clues [3]string, words [4]string, isIntercept bool, history string) [3]int {
	time.Sleep(2 * time.Second)

	role := "己方解密者"
	if isIntercept {
		role = "对方拦截者"
	}

	prompt := fmt.Sprintf(`你是%s。`, role)
	if !isIntercept {
		prompt += fmt.Sprintf(`你的队伍的 4 个密语词是：
1. %s  2. %s  3. %s  4. %s
`, words[0], words[1], words[2], words[3])
	}
	prompt += fmt.Sprintf(`
本轮的 3 个线索是："%s"、"%s"、"%s"

%s

请猜测对应的 3 个数字序列（1-4），用逗号分隔。
格式：数字1,数字2,数字3
只输出 3 个数字，不要解释。`, clues[0], clues[1], clues[2], history)

	resp, err := a.Provider.Complete(ctx, []Message{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: prompt},
	})
	if err != nil {
		log.Printf("AI guess error: %v", err)
		return [3]int{1, 2, 3}
	}

	return parseGuess(resp)
}

func parseClues(resp string) [3]string {
	resp = strings.TrimSpace(resp)
	parts := strings.Split(resp, ",")
	if len(parts) < 3 {
		parts = strings.Split(resp, "，") // Chinese comma
	}
	var result [3]string
	for i := 0; i < 3 && i < len(parts); i++ {
		result[i] = strings.TrimSpace(parts[i])
	}
	for i := range result {
		if result[i] == "" {
			result[i] = fmt.Sprintf("提示%d", i+1)
		}
	}
	return result
}

func parseGuess(resp string) [3]int {
	resp = strings.TrimSpace(resp)
	parts := strings.Split(resp, ",")
	if len(parts) < 3 {
		parts = strings.Split(resp, "，")
	}
	var result [3]int
	for i := 0; i < 3 && i < len(parts); i++ {
		n, err := strconv.Atoi(strings.TrimSpace(parts[i]))
		if err != nil || n < 1 || n > 4 {
			n = i + 1
		}
		result[i] = n
	}
	return result
}
```

- [ ] **Step 3: Create the Claude provider**

```go
// internal/ai/providers/claude.go
package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/ZinkLu/decrypto-the-game/internal/ai"
)

type ClaudeProvider struct {
	APIKey string
	Model  string
}

func NewClaudeProvider(apiKey string) *ClaudeProvider {
	return &ClaudeProvider{
		APIKey: apiKey,
		Model:  "claude-sonnet-4-6",
	}
}

type claudeRequest struct {
	Model     string          `json:"model"`
	MaxTokens int             `json:"max_tokens"`
	Messages  []claudeMessage `json:"messages"`
	System    string          `json:"system,omitempty"`
}

type claudeMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type claudeResponse struct {
	Content []struct {
		Text string `json:"text"`
	} `json:"content"`
}

func (c *ClaudeProvider) Complete(ctx context.Context, messages []ai.Message) (string, error) {
	var systemMsg string
	var chatMsgs []claudeMessage

	for _, m := range messages {
		if m.Role == "system" {
			systemMsg = m.Content
		} else {
			chatMsgs = append(chatMsgs, claudeMessage{Role: m.Role, Content: m.Content})
		}
	}

	reqBody := claudeRequest{
		Model:     c.Model,
		MaxTokens: 256,
		Messages:  chatMsgs,
		System:    systemMsg,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.anthropic.com/v1/messages", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", c.APIKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("send request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("API error %d: %s", resp.StatusCode, string(respBody))
	}

	var claudeResp claudeResponse
	if err := json.Unmarshal(respBody, &claudeResp); err != nil {
		return "", fmt.Errorf("unmarshal response: %w", err)
	}

	if len(claudeResp.Content) == 0 {
		return "", fmt.Errorf("empty response from Claude")
	}

	return claudeResp.Content[0].Text, nil
}
```

- [ ] **Step 4: Update bridge.go to use real AI player**

Replace the AI stub functions in `internal/game/bridge.go`:

```go
// Add import
import "github.com/ZinkLu/decrypto-the-game/internal/ai"

// Add AI player field to Bridge
type Bridge struct {
	// ... existing fields ...
	AIPlayer *ai.AIPlayer // nil if no AI configured
}

// Replace handleAIEncrypt:
func handleAIEncrypt(ctx context.Context, b *Bridge, r *core.Round) [3]string {
	if b.AIPlayer == nil {
		time.Sleep(2 * time.Second)
		return [3]string{"提示1", "提示2", "提示3"}
	}
	words := r.GetCurrentTeam().GetWords()
	history := formatHistoryForAI(b, r)
	return b.AIPlayer.GenerateClues(ctx, r.GetSecretDigits(), words, history)
}

// Replace handleAIIntercept:
func handleAIIntercept(ctx context.Context, b *Bridge, r *core.Round) [3]int {
	if b.AIPlayer == nil {
		time.Sleep(2 * time.Second)
		return [3]int{1, 2, 3}
	}
	clues := r.GetEncryptedMessage()
	words := r.GetCurrentTeam().GetWords() // opponent's words (we don't know them for intercept)
	history := formatHistoryForAI(b, r)
	return b.AIPlayer.GuessSequence(ctx, clues, words, true, history)
}

// Replace handleAIDecrypt:
func handleAIDecrypt(ctx context.Context, b *Bridge, r *core.Round) [3]int {
	if b.AIPlayer == nil {
		time.Sleep(2 * time.Second)
		return r.GetSecretDigits()
	}
	clues := r.GetEncryptedMessage()
	words := r.GetCurrentTeam().GetWords()
	history := formatHistoryForAI(b, r)
	return b.AIPlayer.GuessSequence(ctx, clues, words, false, history)
}

func formatHistoryForAI(b *Bridge, r *core.Round) string {
	rows := b.buildHistory(r)
	if len(rows) == 0 {
		return "暂无历史记录。"
	}
	var sb strings.Builder
	sb.WriteString("历史记录：\n")
	for _, row := range rows {
		sb.WriteString(fmt.Sprintf("第%d轮 (Team %s): 线索=[%s], 密码=%v",
			row.Round, row.Team, strings.Join(row.Clues, ","), row.Secret))
		if len(row.Intercept) > 0 {
			sb.WriteString(fmt.Sprintf(", 拦截=%v", row.Intercept))
		}
		if len(row.Decrypt) > 0 {
			sb.WriteString(fmt.Sprintf(", 解密=%v", row.Decrypt))
		}
		sb.WriteString("\n")
	}
	return sb.String()
}
```

- [ ] **Step 5: Wire AI into NewBridge**

In `NewBridge`, add AI player initialization:

```go
// Add to imports
import (
	"os"
	"github.com/ZinkLu/decrypto-the-game/internal/ai/providers"
)

// In NewBridge, after creating the Bridge struct:
// Check if any team has AI players
hasAI := false
for _, p := range r.TeamA {
	if p.IsAI { hasAI = true; break }
}
if !hasAI {
	for _, p := range r.TeamB {
		if p.IsAI { hasAI = true; break }
	}
}

if hasAI {
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey != "" {
		provider := providers.NewClaudeProvider(apiKey)
		b.AIPlayer = ai.NewAIPlayer(provider)
	} else {
		log.Println("WARNING: AI players in room but ANTHROPIC_API_KEY not set, using dummy AI")
	}
}
```

- [ ] **Step 6: Verify it compiles**

Run: `cd /Users/zinklu/code/decrypto-the-game && go build ./...`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add internal/ai/ internal/game/bridge.go
git commit -m "feat: add AI player system with Claude LLM provider"
```

---

### Task 13: End-to-End Integration Test

**Files:**
- No new files — manual testing

- [ ] **Step 1: Build the frontend**

Run: `cd /Users/zinklu/code/decrypto-the-game/web && npm run build`
Expected: builds successfully to `web/dist/`

- [ ] **Step 2: Build and run the server**

Run: `cd /Users/zinklu/code/decrypto-the-game && go build -o decrypto-server ./cmd/server/ && ./decrypto-server`
Expected: "Starting Decrypto server on http://localhost:8080"

- [ ] **Step 3: Test the flow in browser**

Open `http://localhost:8080` in two browser tabs:
1. Tab 1: Click CREATE ROOM, enter nickname, get room code
2. Tab 2: Click JOIN ROOM, enter nickname + room code
3. Both tabs: Select teams (add AI to fill if needed)
4. Tab 1 (owner): Click start game
5. Play through a round: encrypting → intercept → decrypt → result

- [ ] **Step 4: Fix any issues found**

Address any bugs, then commit fixes.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "fix: integration fixes from end-to-end testing"
```
