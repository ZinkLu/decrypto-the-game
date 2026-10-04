package server

import (
	"encoding/json"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/ZinkLu/decrypto-the-game/server/internal/room"
	"github.com/ZinkLu/decrypto-the-game/server/internal/voice"
)

// switchboard records what the server asks of a voice service.
type switchboard struct {
	mu      sync.Mutex
	plans   map[string]voice.Plan
	signals []string
	hangups []string
	closed  []string
}

func (s *switchboard) Client() string { return "test" }

func (s *switchboard) Signal(code, player string, signal json.RawMessage) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var m struct{ Op string }
	_ = json.Unmarshal(signal, &m)
	s.signals = append(s.signals, player+" "+m.Op)
}

func (s *switchboard) Hear(code string, plan voice.Plan) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.plans == nil {
		s.plans = map[string]voice.Plan{}
	}
	s.plans[code] = plan
}

func (s *switchboard) Hangup(code, player string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.hangups = append(s.hangups, player)
}

func (s *switchboard) Close(code string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.closed = append(s.closed, code)
}

// hears lists what a player may hear, as "speaker/channel", by nickname.
func (s *switchboard) hears(code, player string, names map[string]string) []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := []string{}
	for _, src := range s.plans[code][player] {
		out = append(out, names[src.Speaker]+"/"+string(src.Channel))
	}
	sort.Strings(out)
	return out
}

func eventually(t *testing.T, what string, holds func() bool) {
	t.Helper()
	for deadline := time.Now().Add(3 * time.Second); !holds(); time.Sleep(10 * time.Millisecond) {
		if time.Now().After(deadline) {
			t.Fatalf("never: %s", what)
		}
	}
}

func TestVoicePlanKeepsEachTeamToItself(t *testing.T) {
	ann, alf, ai := &room.PlayerInfo{ID: "ann"}, &room.PlayerInfo{ID: "alf"}, &room.PlayerInfo{ID: "ai", IsAI: true}
	bob, bea, wat := &room.PlayerInfo{ID: "bob"}, &room.PlayerInfo{ID: "bea"}, &room.PlayerInfo{ID: "wat"}
	plan := voicePlan(room.Snapshot{TeamA: []*room.PlayerInfo{ann, alf, ai}, TeamB: []*room.PlayerInfo{bob, bea},
		Players: []*room.PlayerInfo{ann, alf, ai, bob, bea, wat}})
	hears := func(id string) []string {
		out := []string{}
		for _, src := range plan[id] {
			out = append(out, src.Speaker+"/"+string(src.Channel))
		}
		sort.Strings(out)
		return out
	}
	for id, want := range map[string][]string{
		"ann": {"alf/table", "alf/team", "bea/table", "bob/table", "wat/table"},
		"bob": {"alf/table", "ann/table", "bea/table", "bea/team", "wat/table"},
		"wat": {"alf/table", "ann/table", "bea/table", "bob/table"},
	} {
		if got := hears(id); !reflect.DeepEqual(got, want) {
			t.Errorf("%s hears %v, want %v", id, got, want)
		}
	}
	if _, ok := plan["ai"]; ok || len(plan) != 5 {
		t.Errorf("the plan covers %d players, AI included: %v", len(plan), ok)
	}
}

func TestVoiceFollowsTheRoom(t *testing.T) {
	p := bootWith(t, filepath.Join(t.TempDir(), "rooms.db"), 20*time.Second, 100*time.Millisecond)
	sb := &switchboard{}
	p.handler.Voice = sb
	ann := openRoom(t, p)
	if ann.Voice != "test" {
		t.Fatalf("the page is told of voice %q", ann.Voice)
	}
	alf, bob, bea := fillRoom(t, p, ann)
	names := map[string]string{ann.ID: "Ann", alf.ID: "Alf", bob.ID: "Bob", bea.ID: "Bea"}
	eventually(t, "Bob hears Bea on their team", func() bool {
		return reflect.DeepEqual(sb.hears(ann.Code, bob.ID, names), []string{"Alf/table", "Ann/table", "Bea/table", "Bea/team"})
	})
	if got := sb.hears(ann.Code, ann.ID, names); !reflect.DeepEqual(got, []string{"Alf/table", "Alf/team", "Bea/table", "Bob/table"}) {
		t.Fatalf("Ann hears %v", got)
	}

	// Bea changes sides: her team voice follows her at once.
	bea.send("select_team", map[string]any{"team": "A"})
	eventually(t, "Ann hears Bea on their team", func() bool {
		return reflect.DeepEqual(sb.hears(ann.Code, ann.ID, names), []string{"Alf/table", "Alf/team", "Bea/table", "Bea/team", "Bob/table"})
	})
	if got := sb.hears(ann.Code, bob.ID, names); !reflect.DeepEqual(got, []string{"Alf/table", "Ann/table", "Bea/table"}) {
		t.Fatalf("Bob hears %v", got)
	}

	// Signals reach the service as the player who sent them, however long.
	ann.send("voice_signal", map[string]any{"op": "publish", "sdp": strings.Repeat("a", 20000)})
	eventually(t, "Ann's signal arrives", func() bool {
		sb.mu.Lock()
		defer sb.mu.Unlock()
		return reflect.DeepEqual(sb.signals, []string{ann.ID + " publish"})
	})

	// Every other message keeps the old limit.
	bob.send("progress", map[string]any{"action": "decrypt", "state": strings.Repeat("b", 5000)})
	bob.conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	for {
		if _, _, err := bob.conn.ReadMessage(); err != nil {
			break
		}
	}
	eventually(t, "Bob's voice is hung up with his connection", func() bool {
		sb.mu.Lock()
		defer sb.mu.Unlock()
		return reflect.DeepEqual(sb.hangups, []string{bob.ID})
	})

	// The room closes once nobody is left in it, and its voice with it.
	for _, c := range []*client{ann, alf, bea} {
		c.conn.Close()
	}
	eventually(t, "the room's voice is closed", func() bool {
		sb.mu.Lock()
		defer sb.mu.Unlock()
		return reflect.DeepEqual(sb.closed, []string{ann.Code})
	})
}
