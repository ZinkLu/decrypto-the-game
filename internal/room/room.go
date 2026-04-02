package room

import (
	"fmt"
	"sync"
)

// PlayerInfo holds basic info about a room participant.
type PlayerInfo struct {
	ID       string
	Nickname string
	IsAI     bool
}

// Room represents a game lobby with two teams.
type Room struct {
	Code      string
	OwnerID   string
	TeamA     []*PlayerInfo
	TeamB     []*PlayerInfo
	Started   bool
	SessionID string // set when game starts
	mu        sync.Mutex
}

const maxTeamSize = 4

// NewRoom creates a new room with the given code and owner, placing the owner in Team A.
func NewRoom(code string, owner *PlayerInfo) *Room {
	r := &Room{
		Code:    code,
		OwnerID: owner.ID,
		TeamA:   []*PlayerInfo{owner},
		TeamB:   []*PlayerInfo{},
	}
	return r
}

// AddToTeam adds a player to the specified team ("A" or "B"), removing them from the
// other team first. Returns an error if the game has started or the team is full.
func (r *Room) AddToTeam(player *PlayerInfo, team string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.Started {
		return fmt.Errorf("game already started")
	}

	var target, other *[]*PlayerInfo
	switch team {
	case "A":
		target = &r.TeamA
		other = &r.TeamB
	case "B":
		target = &r.TeamB
		other = &r.TeamA
	default:
		return fmt.Errorf("invalid team %q: must be A or B", team)
	}

	// Remove from other team if present.
	*other = removeByID(*other, player.ID)

	// Check if already in target team.
	for _, p := range *target {
		if p.ID == player.ID {
			return nil // already on this team, no-op
		}
	}

	if len(*target) >= maxTeamSize {
		return fmt.Errorf("team %s is full (max %d players)", team, maxTeamSize)
	}

	*target = append(*target, player)
	return nil
}

// RemovePlayer removes the player from whichever team they are on.
func (r *Room) RemovePlayer(playerID string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.TeamA = removeByID(r.TeamA, playerID)
	r.TeamB = removeByID(r.TeamB, playerID)
}

// AddAI adds an AI player to the specified team ("A" or "B").
// The AI ID is generated as "ai-<team>-<n>" where n is a 1-based counter.
// Returns an error if the game has started or the team is full.
func (r *Room) AddAI(team string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.Started {
		return fmt.Errorf("game already started")
	}

	var target *[]*PlayerInfo
	switch team {
	case "A":
		target = &r.TeamA
	case "B":
		target = &r.TeamB
	default:
		return fmt.Errorf("invalid team %q: must be A or B", team)
	}

	if len(*target) >= maxTeamSize {
		return fmt.Errorf("team %s is full (max %d players)", team, maxTeamSize)
	}

	// Determine the AI index by counting existing AIs on this team.
	aiCount := 0
	for _, p := range *target {
		if p.IsAI {
			aiCount++
		}
	}

	ai := &PlayerInfo{
		ID:       fmt.Sprintf("ai-%s-%d", team, aiCount+1),
		Nickname: fmt.Sprintf("AI-%s-%d", team, aiCount+1),
		IsAI:     true,
	}
	*target = append(*target, ai)
	return nil
}

// RemoveAI removes the AI player at the given index (0-based among all players in the team,
// but only if that slot is an AI). Returns an error if the index is invalid, if the game
// has started, or if the player at that index is not an AI.
func (r *Room) RemoveAI(team string, index int) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.Started {
		return fmt.Errorf("game already started")
	}

	var target *[]*PlayerInfo
	switch team {
	case "A":
		target = &r.TeamA
	case "B":
		target = &r.TeamB
	default:
		return fmt.Errorf("invalid team %q: must be A or B", team)
	}

	if index < 0 || index >= len(*target) {
		return fmt.Errorf("index %d out of range for team %s (len %d)", index, team, len(*target))
	}

	if !(*target)[index].IsAI {
		return fmt.Errorf("player at index %d in team %s is not an AI", index, team)
	}

	*target = append((*target)[:index], (*target)[index+1:]...)
	return nil
}

// CanStart returns true when both teams have at least 2 players.
func (r *Room) CanStart() bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	return len(r.TeamA) >= 2 && len(r.TeamB) >= 2
}

// GetAllPlayers returns a flat slice of all players across both teams.
func (r *Room) GetAllPlayers() []*PlayerInfo {
	r.mu.Lock()
	defer r.mu.Unlock()

	all := make([]*PlayerInfo, 0, len(r.TeamA)+len(r.TeamB))
	all = append(all, r.TeamA...)
	all = append(all, r.TeamB...)
	return all
}

// FindPlayer searches both teams for a player by ID and returns the player and
// the team label ("A" or "B"). Returns (nil, "") if not found.
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

// HasPlayer returns true if the player is on either team.
func (r *Room) HasPlayer(playerID string) bool {
	p, _ := r.FindPlayer(playerID)
	return p != nil
}

// removeByID returns a new slice with the element matching playerID removed.
func removeByID(players []*PlayerInfo, playerID string) []*PlayerInfo {
	result := players[:0:0] // preserve underlying array to avoid allocation when nothing changes
	result = make([]*PlayerInfo, 0, len(players))
	for _, p := range players {
		if p.ID != playerID {
			result = append(result, p)
		}
	}
	return result
}
