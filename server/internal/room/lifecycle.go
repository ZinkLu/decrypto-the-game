package room

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
)

// A member's token is known only to their browser and, until a restart, to
// this process. Storage keeps the hash, which is enough to recognise it.
type member struct {
	player *PlayerInfo
	token  string
	hash   string
}

func newMember(player *PlayerInfo) *member {
	token := newToken()
	return &member{player: player, token: token, hash: hashToken(token)}
}

func newToken() string {
	var token [32]byte
	if _, err := rand.Read(token[:]); err != nil {
		panic(err)
	}
	return hex.EncodeToString(token[:])
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// Snapshot owns its player copies; broadcasts never read mutable room slices.
type Snapshot struct {
	Code, OwnerID, SessionID string
	Started, CanStart        bool
	TeamA, TeamB, Players    []*PlayerInfo
}

func copyPlayers(players []*PlayerInfo) []*PlayerInfo {
	result := make([]*PlayerInfo, 0, len(players))
	for _, p := range players {
		cp := *p
		result = append(result, &cp)
	}
	return result
}

func (r *Room) snapshotLocked() Snapshot {
	s := Snapshot{Code: r.Code, OwnerID: r.OwnerID, SessionID: r.SessionID, Started: r.Started,
		CanStart: r.canStartLocked(), TeamA: copyPlayers(r.TeamA), TeamB: copyPlayers(r.TeamB)}
	s.Players = append(copyPlayers(r.TeamA), copyPlayers(r.TeamB)...)
	seen := map[string]bool{}
	for _, p := range s.Players {
		seen[p.ID] = true
	}
	var ids []string
	for id, m := range r.members {
		if !seen[id] && !m.player.Disconnected {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	for _, id := range ids {
		p := *r.members[id].player
		s.Players = append(s.Players, &p)
	}
	return s
}

func (r *Room) Snapshot() Snapshot { r.mu.Lock(); defer r.mu.Unlock(); return r.snapshotLocked() }

func (r *Room) canStartLocked() bool {
	if r.Started || len(r.TeamA) < 2 || len(r.TeamB) < 2 {
		return false
	}
	for _, team := range [][]*PlayerInfo{r.TeamA, r.TeamB} {
		for _, p := range team {
			if p.Disconnected {
				return false
			}
		}
	}
	return true
}

// BeginGame atomically freezes the roster. A second start cannot replace it.
func (r *Room) BeginGame() (Snapshot, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.Started {
		return Snapshot{}, fmt.Errorf("game already started")
	}
	if !r.canStartLocked() {
		return Snapshot{}, fmt.Errorf("not enough players to start (need at least 2 per team)")
	}
	r.Started = true
	r.SessionID = r.Code
	return r.snapshotLocked(), nil
}

func (r *Room) AbortStart() { r.mu.Lock(); defer r.mu.Unlock(); r.Started = false; r.SessionID = "" }

func (r *Room) Join(player *PlayerInfo) (string, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.Started {
		return "", fmt.Errorf("game already started")
	}
	if len(r.members) >= 32 {
		return "", fmt.Errorf("room is full")
	}
	m := newMember(player)
	r.members[player.ID] = m
	if r.OwnerID == "" {
		r.OwnerID = player.ID
	}
	return m.token, nil
}

func (r *Room) Token(playerID string) string {
	r.mu.Lock()
	defer r.mu.Unlock()
	if m := r.members[playerID]; m != nil {
		return m.token
	}
	return ""
}

// Resume authenticates a seat with an unguessable credential, never a nickname.
func (r *Room) Resume(token string) (*PlayerInfo, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	hash := hashToken(token)
	for _, m := range r.members {
		if token != "" && m.hash == hash {
			m.player.Disconnected = false
			if r.OwnerID == "" {
				r.OwnerID = m.player.ID
			}
			p := *m.player
			return &p, nil
		}
	}
	return nil, fmt.Errorf("room resume expired; please create or join a room")
}

func (r *Room) LeaveTeam(playerID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.Started {
		return fmt.Errorf("game already started")
	}
	r.TeamA = removeByID(r.TeamA, playerID)
	r.TeamB = removeByID(r.TeamB, playerID)
	return nil
}

// Disconnect marks the seat offline. The seat and the host role are kept, so a
// refresh or a short network drop changes nothing; Release frees them later.
func (r *Room) Disconnect(playerID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if m := r.members[playerID]; m != nil {
		m.player.Disconnected = true
	}
}

// Release frees a seat that stayed offline: before the game the player leaves
// their team, and a host hands the room to someone still here. It reports
// whether anything changed.
func (r *Room) Release(playerID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	m := r.members[playerID]
	if m == nil || !m.player.Disconnected {
		return false
	}
	changed := false
	if !r.Started {
		before := len(r.TeamA) + len(r.TeamB)
		r.TeamA = removeByID(r.TeamA, playerID)
		r.TeamB = removeByID(r.TeamB, playerID)
		changed = before != len(r.TeamA)+len(r.TeamB)
	}
	if r.OwnerID == playerID {
		r.OwnerID = ""
		for _, p := range r.snapshotLocked().Players {
			if !p.IsAI && !p.Disconnected {
				r.OwnerID = p.ID
				break
			}
		}
		changed = true
	}
	return changed
}

// AutoSeat puts a new arrival on the team with fewer players, if either has room.
func (r *Room) AutoSeat(playerID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	m := r.members[playerID]
	if r.Started || m == nil {
		return
	}
	for _, team := range [][]*PlayerInfo{r.TeamA, r.TeamB} {
		for _, p := range team {
			if p.ID == playerID {
				return
			}
		}
	}
	if len(r.TeamB) < len(r.TeamA) && len(r.TeamB) < maxTeamSize {
		r.TeamB = append(r.TeamB, m.player)
	} else if len(r.TeamA) < maxTeamSize {
		r.TeamA = append(r.TeamA, m.player)
	} else if len(r.TeamB) < maxTeamSize {
		r.TeamB = append(r.TeamB, m.player)
	}
}

// Reopen returns a finished room to its lobby with the same teams. Players
// who left during the game give up their seats.
func (r *Room) Reopen() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if !r.Started {
		return nil
	}
	r.Started = false
	r.SessionID = ""
	keep := func(team []*PlayerInfo) []*PlayerInfo {
		out := team[:0]
		for _, p := range team {
			if !p.Disconnected {
				out = append(out, p)
			}
		}
		return out
	}
	r.TeamA, r.TeamB = keep(r.TeamA), keep(r.TeamB)
	return nil
}

func (r *Room) OnlineHumans() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	n := 0
	for _, m := range r.members {
		if !m.player.Disconnected {
			n++
		}
	}
	return n
}
