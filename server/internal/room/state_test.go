package room

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

// savedRoom is a lobby with the owner and an AI on team A, a peer and an AI on
// team B, and a watcher without a seat. It returns the humans' tokens by ID.
func savedRoom(t *testing.T) (*Room, map[string]string) {
	t.Helper()
	r := NewRoom("1234", &PlayerInfo{ID: "owner", Nickname: "Owner"})
	tokens := map[string]string{"owner": r.Token("owner")}
	for _, id := range []string{"peer", "watcher"} {
		token, err := r.Join(&PlayerInfo{ID: id, Nickname: strings.ToUpper(id)})
		if err != nil {
			t.Fatal(err)
		}
		tokens[id] = token
	}
	r.AutoSeat("peer")
	for _, team := range []string{"A", "B"} {
		if err := r.AddAI(team); err != nil {
			t.Fatal(err)
		}
	}
	return r, tokens
}

// reload stores and restores the room the way the server does.
func reload(t *testing.T, r *Room) (*Room, string) {
	t.Helper()
	data, err := json.Marshal(r.State())
	if err != nil {
		t.Fatal(err)
	}
	var s State
	if err := json.Unmarshal(data, &s); err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(s)
	if err != nil {
		t.Fatal(err)
	}
	return restored, string(data)
}

func TestRestoredRoomKeepsSeatsAndTokens(t *testing.T) {
	original, tokens := savedRoom(t)
	r, stored := reload(t, original)

	for id, token := range tokens {
		if strings.Contains(stored, token) {
			t.Fatalf("the token of %s is stored in the clear", id)
		}
	}
	if !reflect.DeepEqual(r.State(), original.State()) {
		t.Fatalf("restored state differs:\n got %+v\nwant %+v", r.State(), original.State())
	}
	before, after := original.Snapshot(), r.Snapshot()
	if after.Code != before.Code || after.OwnerID != "owner" || r.ID != original.ID {
		t.Fatalf("restored as room %s (%s) of %s", after.Code, r.ID, after.OwnerID)
	}
	for _, team := range [][2][]*PlayerInfo{{before.TeamA, after.TeamA}, {before.TeamB, after.TeamB}} {
		if len(team[0]) != 2 || len(team[1]) != 2 {
			t.Fatalf("teams of %d and %d", len(team[0]), len(team[1]))
		}
		for i, p := range team[1] {
			if want := team[0][i]; p.ID != want.ID || p.Nickname != want.Nickname || p.IsAI != want.IsAI {
				t.Errorf("seat %d holds %+v, held %+v", i, p, want)
			}
			if p.Disconnected == p.IsAI {
				t.Errorf("%s: disconnected=%v after the restart", p.ID, p.Disconnected)
			}
		}
	}
	if r.OnlineHumans() != 0 || r.CanStart() {
		t.Fatal("humans are online before anyone resumed")
	}

	if _, err := r.Resume("not a token"); err == nil {
		t.Fatal("unknown token accepted")
	}
	if _, err := r.Resume(""); err == nil {
		t.Fatal("empty token accepted")
	}
	for id, token := range tokens {
		p, err := r.Resume(token)
		if err != nil || p.ID != id {
			t.Fatalf("%s resumed as %+v: %v", id, p, err)
		}
	}
	// The seat and the member are one player: resuming brings the seat online.
	s := r.Snapshot()
	if s.TeamA[0].Disconnected || s.TeamB[0].Disconnected || len(s.Players) != 5 || r.OnlineHumans() != 3 {
		t.Fatalf("after resuming: %d online, %d listed", r.OnlineHumans(), len(s.Players))
	}
	if !r.CanStart() {
		t.Fatal("the restored lobby cannot start")
	}
	if !reflect.DeepEqual(r.State(), original.State()) {
		t.Fatal("connections changed the stored state")
	}
}

func TestRestoredGameKeepsItsRosterFrozen(t *testing.T) {
	original, tokens := savedRoom(t)
	if _, err := original.BeginGame(); err != nil {
		t.Fatal(err)
	}
	r, _ := reload(t, original)
	s := r.Snapshot()
	if !s.Started || s.SessionID != "1234" {
		t.Fatalf("restored with started=%v session=%q", s.Started, s.SessionID)
	}
	if _, err := r.Resume(tokens["watcher"]); err != nil {
		t.Fatal(err)
	}
	if r.AddToTeam(&PlayerInfo{ID: "watcher"}, "A") == nil || r.AddAI("B") == nil {
		t.Fatal("the roster of a running game changed")
	}
	if _, err := r.Join(&PlayerInfo{ID: "late", Nickname: "late"}); err == nil {
		t.Fatal("joined a running game")
	}
}

func TestRestoreRefusesImpossibleRooms(t *testing.T) {
	original, _ := savedRoom(t)
	tests := map[string]func(*State){
		"other version":       func(s *State) { s.Version++ },
		"no id":               func(s *State) { s.ID = "" },
		"no code":             func(s *State) { s.Code = "" },
		"unnamed player":      func(s *State) { s.Players[0].ID = "" },
		"player listed twice": func(s *State) { s.Players = append(s.Players, s.Players[0]) },
		"human without token": func(s *State) { s.Players[0].TokenHash = "" },
		"unknown seat":        func(s *State) { s.TeamA[0] = "stranger" },
		"seat on both teams":  func(s *State) { s.TeamB[0] = s.TeamA[0] },
		"team of five": func(s *State) {
			for _, id := range []string{"x1", "x2", "x3"} {
				s.Players = append(s.Players, SavedPlayer{ID: id, IsAI: true})
				s.TeamA = append(s.TeamA, id)
			}
		},
		"AI without seat":   func(s *State) { s.TeamB = s.TeamB[:1] },
		"owner not in room": func(s *State) { s.OwnerID = "stranger" },
		"AI owner":          func(s *State) { s.OwnerID = s.TeamA[1] },
	}
	for name, breakIt := range tests {
		t.Run(name, func(t *testing.T) {
			s := original.State()
			breakIt(&s)
			if r, err := Restore(s); err == nil {
				t.Fatalf("accepted: %+v", r.State())
			}
		})
	}
}

func TestManagerAddsRestoredRooms(t *testing.T) {
	m := NewManager()
	original, _ := savedRoom(t)
	r, _ := reload(t, original)
	if err := m.Add(r); err != nil {
		t.Fatal(err)
	}
	if m.GetRoom("1234") != r {
		t.Fatal("the restored room is not served")
	}
	if m.Add(r) == nil {
		t.Fatal("a second room took the same code")
	}
	for i := 0; i < 200; i++ {
		if created := m.CreateRoom(&PlayerInfo{ID: "p", Nickname: "p"}); created.Code == "1234" {
			t.Fatal("a new room reused the code of a restored one")
		}
	}
}
