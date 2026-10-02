package room

import (
	"fmt"
	"sort"
)

// StateVersion is raised when a stored State can no longer be read as written.
const StateVersion = 1

// State is what a room keeps across a restart. Connections are not part of it:
// after a restart every human is offline until they resume.
type State struct {
	Version   int           `json:"v"`
	ID        string        `json:"id"`
	Code      string        `json:"code"`
	OwnerID   string        `json:"owner_id"`
	Started   bool          `json:"started"`
	SessionID string        `json:"session_id,omitempty"`
	TeamA     []string      `json:"team_a"`
	TeamB     []string      `json:"team_b"`
	Players   []SavedPlayer `json:"players"`
}

// SavedPlayer is a human in the room, seated or not, or an AI seat.
type SavedPlayer struct {
	ID        string `json:"id"`
	Nickname  string `json:"nickname"`
	IsAI      bool   `json:"is_ai,omitempty"`
	TokenHash string `json:"token_hash,omitempty"` // humans only
}

// State lists players in a fixed order, so an unchanged room always reads the same.
func (r *Room) State() State {
	r.mu.Lock()
	defer r.mu.Unlock()
	s := State{Version: StateVersion, ID: r.ID, Code: r.Code, OwnerID: r.OwnerID, Started: r.Started, SessionID: r.SessionID,
		TeamA: []string{}, TeamB: []string{}, Players: []SavedPlayer{}}
	listed := map[string]bool{}
	list := func(p *PlayerInfo) {
		if listed[p.ID] {
			return
		}
		listed[p.ID] = true
		saved := SavedPlayer{ID: p.ID, Nickname: p.Nickname, IsAI: p.IsAI}
		if m := r.members[p.ID]; m != nil {
			saved.TokenHash = m.hash
		}
		s.Players = append(s.Players, saved)
	}
	for _, p := range r.TeamA {
		s.TeamA = append(s.TeamA, p.ID)
		list(p)
	}
	for _, p := range r.TeamB {
		s.TeamB = append(s.TeamB, p.ID)
		list(p)
	}
	ids := make([]string, 0, len(r.members))
	for id := range r.members {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		list(r.members[id].player)
	}
	return s
}

// Restore rebuilds a room from its stored state, with every human offline. It
// refuses a state the room could not have been in.
func Restore(s State) (*Room, error) {
	if s.Version != StateVersion {
		return nil, fmt.Errorf("room state version %d, this server reads %d", s.Version, StateVersion)
	}
	if s.ID == "" || s.Code == "" {
		return nil, fmt.Errorf("room state lacks an id or a code")
	}
	r := &Room{ID: s.ID, Code: s.Code, OwnerID: s.OwnerID, Started: s.Started, SessionID: s.SessionID, members: map[string]*member{}}
	players := map[string]*PlayerInfo{}
	for _, p := range s.Players {
		if p.ID == "" || players[p.ID] != nil {
			return nil, fmt.Errorf("room %s: player %q is unnamed or listed twice", s.Code, p.ID)
		}
		info := &PlayerInfo{ID: p.ID, Nickname: p.Nickname, IsAI: p.IsAI, Disconnected: !p.IsAI}
		players[p.ID] = info
		if p.IsAI {
			continue
		}
		if p.TokenHash == "" {
			return nil, fmt.Errorf("room %s: player %s has no token", s.Code, p.ID)
		}
		r.members[p.ID] = &member{player: info, hash: p.TokenHash}
	}
	seated := map[string]bool{}
	seat := func(ids []string) ([]*PlayerInfo, error) {
		if len(ids) > maxTeamSize {
			return nil, fmt.Errorf("room %s: a team of %d", s.Code, len(ids))
		}
		team := make([]*PlayerInfo, 0, len(ids))
		for _, id := range ids {
			if players[id] == nil || seated[id] {
				return nil, fmt.Errorf("room %s: seat %q is unknown or taken twice", s.Code, id)
			}
			seated[id] = true
			team = append(team, players[id])
		}
		return team, nil
	}
	var err error
	if r.TeamA, err = seat(s.TeamA); err != nil {
		return nil, err
	}
	if r.TeamB, err = seat(s.TeamB); err != nil {
		return nil, err
	}
	for id, p := range players {
		if p.IsAI && !seated[id] {
			return nil, fmt.Errorf("room %s: AI %s has no seat", s.Code, id)
		}
	}
	if s.OwnerID != "" && r.members[s.OwnerID] == nil {
		return nil, fmt.Errorf("room %s: owner %s is not in the room", s.Code, s.OwnerID)
	}
	return r, nil
}
