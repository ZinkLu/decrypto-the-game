package api

import (
	"encoding/json"
	"net/http"

	core "github.com/ZinkLu/decrypto-the-game/internal/core/api"
)

// PlayerRequest represents a player in API requests
type PlayerRequest struct {
	ID       string `json:"id"`
	NickName string `json:"nick_name"`
}

// CreateGameRequest represents the request to create a game
type CreateGameRequest struct {
	SessionID string          `json:"session_id"`
	Players   []PlayerRequest `json:"players"`
}

// CreateGameResponse represents the response after creating a game
type CreateGameResponse struct {
	SessionID  string `json:"session_id"`
	TeamAID    string `json:"team_a_id"`
	TeamBID    string `json:"team_b_id"`
	TeamAMembers []string `json:"team_a_members"`
	TeamBMembers []string `json:"team_b_members"`
}

// HandleCreateGame handles creating a new game session
func (a *GameAPI) HandleCreateGame(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req CreateGameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	players := make([]*core.Player, len(req.Players))
	for i, p := range req.Players {
		players[i] = &core.Player{UID: p.ID, NickName: p.NickName}
	}

	session, err := a.sessionManager.CreateSession(req.SessionID, players)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	a.sessionManager.AddSession(session)

	teamAMembers := make([]string, len(session.GetTeams()[0].Members()))
	teamBMembers := make([]string, len(session.GetTeams()[1].Members()))
	for i, m := range session.GetTeams()[0].Members() {
		teamAMembers[i] = m.UID
	}
	for i, m := range session.GetTeams()[1].Members() {
		teamBMembers[i] = m.UID
	}

	resp := CreateGameResponse{
		SessionID:    session.SessionID(),
		TeamAID:      session.GetTeams()[0].TeamID(),
		TeamBID:      session.GetTeams()[1].TeamID(),
		TeamAMembers: teamAMembers,
		TeamBMembers: teamBMembers,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// HandleJoinGame handles joining an existing game
func (a *GameAPI) HandleJoinGame(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement join game logic
	w.Write([]byte("Join game endpoint"))
}

// HandleGameStatus returns the current status of a game
func (a *GameAPI) HandleGameStatus(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Query().Get("session_id")
	if sessionID == "" {
		http.Error(w, "session_id is required", http.StatusBadRequest)
		return
	}

	session := a.sessionManager.GetSession(sessionID)
	if session == nil {
		http.Error(w, "Session not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(session)
}
