package game

import (
	"encoding/json"
	"fmt"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/ZinkLu/decrypto-the-game/server/internal/room"
	"github.com/ZinkLu/decrypto-the-game/server/internal/ws"
)

var patientTimings = Timings{Encrypt: 5 * time.Second, Guess: 5 * time.Second, AI: 5 * time.Second,
	Request: 20 * time.Millisecond, BetweenRounds: time.Millisecond, AfterIntercept: time.Millisecond}

// A plan says which rounds are intercepted and which are decoded wrongly.
type plan struct{ rightIntercept, wrongDecrypt map[int]bool }

// Team B intercepts rounds 3 and 5, and wins there; it decodes round 4 wrongly.
var shortGame = plan{rightIntercept: map[int]bool{3: true, 5: true}, wrongDecrypt: map[int]bool{4: true}}

// disk keeps every state the game saved, as the JSON the server would store.
type disk struct {
	mu     sync.Mutex
	states [][]byte
}

func (d *disk) save(s Snapshot) {
	data, err := json.Marshal(s)
	if err != nil {
		panic(err)
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	d.states = append(d.states, data)
}

func (d *disk) saved() [][]byte {
	d.mu.Lock()
	defer d.mu.Unlock()
	return append([][]byte(nil), d.states...)
}

// restart rebuilds the room and its game from what was stored, as a new
// process would. Every player then resumes their seat.
func restart(t *testing.T, before *room.Room, tokens map[string]string, state []byte) (*Bridge, error) {
	t.Helper()
	stored, err := json.Marshal(before.State())
	if err != nil {
		t.Fatal(err)
	}
	var roomState room.State
	if err := json.Unmarshal(stored, &roomState); err != nil {
		t.Fatal(err)
	}
	r, err := room.Restore(roomState)
	if err != nil {
		t.Fatal(err)
	}
	var snap Snapshot
	if err := json.Unmarshal(state, &snap); err != nil {
		t.Fatal(err)
	}
	b, err := Restore(r, ws.NewHub(nil), snap)
	if err != nil {
		return nil, err
	}
	t.Cleanup(func() { b.Stop(); RemoveBridge(b.Session.SessionID()) })
	b.Timing = patientTimings
	for id, token := range tokens {
		if p, err := r.Resume(token); err != nil || p.ID != id {
			t.Fatalf("%s resumed as %+v: %v", id, p, err)
		}
	}
	return b, nil
}

func tokensOf(r *room.Room, ids []string) map[string]string {
	tokens := map[string]string{}
	for _, id := range ids {
		tokens[id] = r.Token(id)
	}
	return tokens
}

// play acts for the four seats until the game is over or stop says so, and
// returns the last view of the first seat.
func play(t *testing.T, b *Bridge, ids []string, p plan, stop func(ws.GameSyncData) bool) ws.GameSyncData {
	t.Helper()
	acted := map[string]bool{}
	until := time.Now().Add(10 * time.Second)
	for time.Now().Before(until) {
		if v := b.Sync(ids[0]); v != nil && (v.Phase == "game_over" || stop != nil && stop(*v)) {
			return *v
		}
		for _, id := range ids[:4] {
			v := b.Sync(id)
			if v == nil || !canAct(v.YourRole, v.Phase) || v.Submitted || acted[fmt.Sprintf("%d:%s", v.Round, v.Phase)] {
				continue
			}
			var err error
			if v.Phase == "encrypting" {
				clue := fmt.Sprintf("round-%d", v.Round)
				err = b.SubmitClues(id, ws.SubmitCluesData{Round: v.Round, Clues: [3]string{clue + "-a", clue + "-b", clue + "-c"}})
			} else {
				right := !p.wrongDecrypt[v.Round]
				if v.Phase == "intercept" {
					right = p.rightIntercept[v.Round]
				}
				var guess [3]int
				for _, other := range ids[:4] {
					if e := b.Sync(other); e != nil && e.YourRole == "encryptor" {
						copy(guess[:], e.SecretDigits)
					}
				}
				if !right {
					guess[0], guess[1] = guess[1], guess[0]
				}
				err = b.SubmitGuess(id, v.Phase, ws.SubmitGuessData{Round: v.Round, Guess: guess})
			}
			// A paused or just finished phase refuses; the seat tries again.
			if err == nil {
				acted[fmt.Sprintf("%d:%s", v.Round, v.Phase)] = true
			}
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("game stalled at %+v", b.Sync(ids[0]))
	return ws.GameSyncData{}
}

func asJSON(t *testing.T, v any) string {
	t.Helper()
	data, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func TestRestoredGameContinuesFromEverySavedState(t *testing.T) {
	original, ids := newTestBridge(t)
	original.Timing = patientTimings
	stored := &disk{}
	original.OnSave = stored.save
	tokens := tokensOf(original.Room, ids)
	original.Start()
	want := play(t, original, ids, shortGame, nil)
	if want.GameOver == nil || want.GameOver.Winner == nil || *want.GameOver.Winner != "B" || want.GameOver.Reason != "interceptions" ||
		want.Round != 5 || want.ScoreB != (ws.ScoreInfo{Interceptions: 2, DecryptFailures: 1}) || want.ScoreA != (ws.ScoreInfo{}) {
		t.Fatalf("the game did not follow the plan: %s", asJSON(t, want))
	}

	states := stored.saved()
	// Before the first round, four states in each round without interception,
	// six in each later round, and the end.
	if len(states) != 1+2*4+3*6+1 {
		t.Fatalf("%d states saved", len(states))
	}
	for i, state := range states {
		var snap Snapshot
		if err := json.Unmarshal(state, &snap); err != nil {
			t.Fatal(err)
		}
		t.Run(fmt.Sprintf("%02d-round-%d-%s", i, snap.Round, snap.Phase), func(t *testing.T) {
			b, err := restart(t, original.Room, tokens, state)
			if err != nil {
				t.Fatal(err)
			}

			// Until it starts, the game shows what was saved and takes no input.
			for id, saved := range snap.Views {
				saved.Deadline = 0
				if got := b.Sync(id); got == nil || asJSON(t, got) != asJSON(t, saved) {
					t.Fatalf("%s sees %s, saw %s", id, asJSON(t, got), asJSON(t, saved))
				}
			}
			for _, id := range ids[:4] {
				v := b.Sync(id)
				if v == nil || !canAct(v.YourRole, v.Phase) {
					continue
				}
				if v.Phase == "encrypting" {
					err = b.SubmitClues(id, ws.SubmitCluesData{Round: v.Round, Clues: [3]string{"a", "b", "c"}})
				} else {
					err = b.SubmitGuess(id, v.Phase, ws.SubmitGuessData{Round: v.Round, Guess: [3]int{1, 2, 3}})
				}
				if err == nil {
					t.Fatalf("%s acted in a paused game", id)
				}
			}
			if b.Finished() != (snap.Phase == "game_over") {
				t.Fatalf("finished=%v in phase %q", b.Finished(), snap.Phase)
			}

			b.Start()
			got := play(t, b, ids, shortGame, nil)
			if asJSON(t, got.GameOver) != asJSON(t, want.GameOver) && snap.Phase == "game_over" {
				t.Fatalf("the finished game changed: %s, was %s", asJSON(t, got.GameOver), asJSON(t, want.GameOver))
			}
			if got.Round != want.Round || got.ScoreA != want.ScoreA || got.ScoreB != want.ScoreB ||
				got.GameOver == nil || got.GameOver.Reason != want.GameOver.Reason || *got.GameOver.Winner != "B" {
				t.Fatalf("ended as %s, want %s", asJSON(t, got), asJSON(t, want))
			}
			if len(got.History) != len(want.History) {
				t.Fatalf("%d rounds of history, want %d", len(got.History), len(want.History))
			}
			// Rounds settled or begun before the restart are the ones that were
			// played then; later rounds draw their own codes.
			for j, round := range snap.Session.Rounds {
				row, was := got.History[j], want.History[j]
				if round.Phase == 5 && asJSON(t, row) != asJSON(t, was) {
					t.Errorf("round %d changed: %s, was %s", j+1, asJSON(t, row), asJSON(t, was))
				}
				if !reflect.DeepEqual(row.Secret, was.Secret) {
					t.Errorf("round %d drew a new code: %v, was %v", j+1, row.Secret, was.Secret)
				}
			}
			for j, row := range got.History {
				if was := want.History[j]; row.Round != was.Round || row.Team != was.Team || !reflect.DeepEqual(row.Clues, was.Clues) {
					t.Errorf("round %d played as %s, want %s", j+1, asJSON(t, row), asJSON(t, was))
				}
			}
		})
	}
}

func TestRestoredGameKeepsTimeoutsAndNotices(t *testing.T) {
	original, ids := newTestBridge(t)
	original.Timing = patientTimings
	original.Timing.Encrypt = 150 * time.Millisecond
	stored := &disk{}
	original.OnSave = stored.save
	tokens := tokensOf(original.Room, ids)
	original.Start()

	// Nobody writes the clues of round 1: its time runs out.
	var decrypt ws.GameSyncData
	until := time.Now().Add(3 * time.Second)
	for decrypt.Phase != "decrypt" {
		if time.Now().After(until) {
			t.Fatal("the clues never timed out")
		}
		if v := original.Sync(ids[0]); v != nil {
			decrypt = *v
		}
		time.Sleep(time.Millisecond)
	}
	// A notice set during the round, as an AI falling back would.
	original.aiStatus("decrypt", "AI", "fallback", 1, 1, "fallback used")
	original.Stop()

	states := stored.saved()
	b, err := restart(t, original.Room, tokens, states[len(states)-1])
	if err != nil {
		t.Fatal(err)
	}
	v := b.Sync(ids[2])
	if v == nil || v.Phase != "decrypt" || v.Timeout == nil || v.Timeout.Action != "encrypt" || v.Timeout.Outcome != "blank" || v.Timeout.Round != 1 {
		t.Fatalf("the restored game forgot the timeout: %s", asJSON(t, v))
	}
	// The notice came after the last saved state: the restart forgets it.
	if v.Notice != "" {
		t.Fatalf("a notice appeared: %q", v.Notice)
	}

	after := &disk{}
	b.OnSave = after.save
	b.Start()
	round2 := play(t, b, ids, plan{}, func(v ws.GameSyncData) bool { return v.Round == 2 && v.Phase == "decrypt" })
	if round2.Timeout != nil {
		t.Fatalf("round 2 still announces %+v", round2.Timeout)
	}
	// The row of the round that timed out, as its result showed it.
	var settled []ws.RoundHistoryRow
	for _, state := range after.saved() {
		var snap Snapshot
		if err := json.Unmarshal(state, &snap); err != nil {
			t.Fatal(err)
		}
		if v := snap.Views[ids[2]]; snap.Round == 1 && v.Phase == "round_result" && len(v.History) == 1 {
			settled = v.History
		}
	}
	want := []ws.RoundHistoryRow{{Round: 1, Team: "A", Clues: []string{"—", "—", "—"}, Secret: decrypt.SecretDigits,
		Intercept: []int{0, 0, 0}, Decrypt: decrypt.SecretDigits, Timeouts: []string{"encrypt"}}}
	if !reflect.DeepEqual(settled, want) {
		t.Fatalf("round 1 settled as %s, want %s", asJSON(t, settled), asJSON(t, want))
	}
}

func TestRestoreRefusesAGameTheRoomIsNotPlaying(t *testing.T) {
	original, ids := newTestBridge(t)
	original.Timing = patientTimings
	stored := &disk{}
	original.OnSave = stored.save
	tokens := tokensOf(original.Room, ids)
	original.Start()
	play(t, original, ids, plan{}, func(v ws.GameSyncData) bool { return v.Round == 3 && v.Phase == "intercept" })
	original.Stop()
	states := stored.saved()
	valid := states[len(states)-1]
	if _, err := restart(t, original.Room, tokens, valid); err != nil {
		t.Fatal(err)
	}

	tests := map[string]func(*Snapshot){
		"other version":  func(s *Snapshot) { s.Version++ },
		"other session":  func(s *Snapshot) { s.Session.ID = "elsewhere" },
		"impossible":     func(s *Snapshot) { s.Session.Rounds[2].Secret = [3]int{9, 9, 9} },
		"missing player": func(s *Snapshot) { s.Session.Teams[0].Players = s.Session.Teams[0].Players[:1] },
		"other player":   func(s *Snapshot) { s.Session.Teams[1].Players[0].UID = "stranger" },
		"swapped seats": func(s *Snapshot) {
			p := s.Session.Teams[1].Players
			p[0], p[1] = p[1], p[0]
		},
	}
	for name, breakIt := range tests {
		t.Run(name, func(t *testing.T) {
			var snap Snapshot
			if err := json.Unmarshal(valid, &snap); err != nil {
				t.Fatal(err)
			}
			breakIt(&snap)
			if b, err := restart(t, original.Room, tokens, []byte(asJSON(t, snap))); err == nil {
				t.Fatalf("accepted: %s", asJSON(t, b.Session.Snapshot()))
			}
		})
	}

	t.Run("room in its lobby", func(t *testing.T) {
		lobby := room.NewRoom(original.Room.Code, &room.PlayerInfo{ID: ids[0], Nickname: ids[0]})
		var snap Snapshot
		if err := json.Unmarshal(valid, &snap); err != nil {
			t.Fatal(err)
		}
		if _, err := Restore(lobby, ws.NewHub(nil), snap); err == nil {
			t.Fatal("a game was restored into a lobby")
		}
	})
}
