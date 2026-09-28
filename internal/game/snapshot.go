package game

import (
	"fmt"

	"github.com/ZinkLu/decrypto-the-game/internal/core"
	"github.com/ZinkLu/decrypto-the-game/internal/room"
	"github.com/ZinkLu/decrypto-the-game/internal/ws"
)

// SnapshotVersion is raised when a stored Snapshot can no longer be read as written.
const SnapshotVersion = 1

// Snapshot is a game as its players last saw it: the core session, and what
// the bridge showed each seat.
type Snapshot struct {
	Version     int                        `json:"v"`
	Session     core.SessionSnapshot       `json:"session"`
	Phase       string                     `json:"phase"`
	Round       int                        `json:"round"`
	Views       map[string]ws.GameSyncData `json:"views"`
	Timeouts    map[int][]string           `json:"timeouts,omitempty"`
	RoundNotice string                     `json:"round_notice,omitempty"`
	Timeout     *ws.TimeoutData            `json:"timeout,omitempty"`
}

// saveLocked hands the game to OnSave. The caller changed the views and still
// holds the lock, so nobody sees what a restart would forget. It reads the core
// session: once the game runs, only the game goroutine calls it.
func (b *Bridge) saveLocked() {
	if b.OnSave != nil {
		b.OnSave(b.snapshotLocked())
	}
	b.show()
}

func (b *Bridge) snapshotLocked() Snapshot {
	s := Snapshot{Version: SnapshotVersion, Session: b.Session.Snapshot()}
	s.Phase, s.Round, s.RoundNotice, s.Timeout = b.phase, b.round, b.roundNotice, b.timeout
	s.Views = make(map[string]ws.GameSyncData, len(b.views))
	for id, v := range b.views {
		s.Views[id] = v
	}
	s.Timeouts = make(map[int][]string, len(b.timeouts))
	for round, actions := range b.timeouts {
		s.Timeouts[round] = append([]string(nil), actions...)
	}
	return s
}

// Restore rebuilds the game a room was playing before a restart, and registers
// it. Nobody is connected yet, so the game waits for Start; the interrupted
// phase then begins again with its full time.
func Restore(r *room.Room, hub *ws.Hub, snap Snapshot) (*Bridge, error) {
	if snap.Version != SnapshotVersion {
		return nil, fmt.Errorf("game snapshot version %d, this server reads %d", snap.Version, SnapshotVersion)
	}
	session, err := core.Restore(snap.Session)
	if err != nil {
		return nil, err
	}
	roster := r.Snapshot()
	if !roster.Started || roster.SessionID != session.SessionID() {
		return nil, fmt.Errorf("room %s is not playing game %q", r.Code, session.SessionID())
	}
	for i, seats := range [][]*room.PlayerInfo{roster.TeamA, roster.TeamB} {
		players := session.GetTeams()[i].Members()
		if len(seats) != len(players) {
			return nil, fmt.Errorf("room %s seats %d players where the game has %d", r.Code, len(seats), len(players))
		}
		for j, p := range players {
			if seats[j].ID != p.UID {
				return nil, fmt.Errorf("room %s seats %s where the game has %s", r.Code, seats[j].ID, p.UID)
			}
		}
	}

	b := newBridge(r, hub, session, roster)
	b.phase, b.round, b.roundNotice, b.timeout = snap.Phase, snap.Round, snap.RoundNotice, snap.Timeout
	// No input is taken before the phase begins again.
	b.accepted = true
	for id, v := range snap.Views {
		v.Deadline = 0
		b.views[id] = v
	}
	for round, actions := range snap.Timeouts {
		b.timeouts[round] = actions
	}
	RegisterBridge(session.SessionID(), b)
	return b, nil
}
