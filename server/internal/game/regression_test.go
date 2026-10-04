package game

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/ZinkLu/decrypto-the-game/server/internal/ai"
	"github.com/ZinkLu/decrypto-the-game/server/internal/room"
	"github.com/ZinkLu/decrypto-the-game/server/internal/ws"
)

func TestMain(m *testing.M) { RegisterHandlers(); os.Exit(m.Run()) }

func newTestBridge(t *testing.T) (*Bridge, []string) {
	t.Helper()
	ids := []string{"a1", "a2", "b1", "b2", "observer"}
	r := room.NewRoom(t.Name(), &room.PlayerInfo{ID: ids[0], Nickname: ids[0]})
	for i, id := range ids[1:] {
		p := &room.PlayerInfo{ID: id, Nickname: id}
		if _, err := r.Join(p); err != nil {
			t.Fatal(err)
		}
		if i < 3 {
			team := "B"
			if i == 0 {
				team = "A"
			}
			if err := r.AddToTeam(p, team); err != nil {
				t.Fatal(err)
			}
		}
	}
	b, err := NewBridge(context.Background(), r, ws.NewHub(nil))
	if err != nil {
		t.Fatal(err)
	}
	b.Timing = Timings{Encrypt: time.Second, Guess: time.Second, AI: time.Second, Request: 20 * time.Millisecond, BetweenRounds: time.Millisecond}
	t.Cleanup(func() { b.Stop(); RemoveBridge(b.Session.SessionID()) })
	return b, ids
}

func TestGameValidationAndAllEndings(t *testing.T) {
	for _, ending := range []string{"16-round-draw", "two-decrypt-errors", "two-interceptions"} {
		t.Run(ending, func(t *testing.T) {
			b, ids := newTestBridge(t)
			if _, err := NewBridge(context.Background(), b.Room, b.Hub); err == nil {
				t.Fatal("duplicate start accepted")
			}
			b.Start()
			secrets := map[int][3]int{}
			acted := map[string]bool{}
			checked, checkedGuess := false, false
			deadline := time.Now().Add(5 * time.Second)
			for time.Now().Before(deadline) {
				observer := b.Sync(ids[4])
				if observer == nil {
					time.Sleep(time.Millisecond)
					continue
				}
				if observer.YourTeam != "" || len(observer.Words) != 0 || len(observer.SecretDigits) != 0 {
					t.Fatal("observer received secrets")
				}
				if observer.Phase == "game_over" {
					wantRounds := 16
					wantWinner := ""
					if ending == "two-decrypt-errors" {
						wantRounds = 3
						wantWinner = "B"
					}
					if ending == "two-interceptions" {
						wantRounds = 5
						wantWinner = "B"
					}
					if observer.Round != wantRounds || len(observer.History) != wantRounds {
						t.Fatalf("incomplete final history: round %d, rows %d", observer.Round, len(observer.History))
					}
					if observer.RoundResult == nil {
						t.Fatal("missing final round result in sync")
					}
					if observer.GameOver == nil {
						t.Fatal("missing final sync")
					}
					winner := ""
					if observer.GameOver.Winner != nil {
						winner = *observer.GameOver.Winner
					}
					if winner != wantWinner {
						t.Fatalf("winner = %q, want %q", winner, wantWinner)
					}
					return
				}
				if observer.Phase == "guess" && observer.Round == 1 && !checkedGuess {
					// Team B has nothing to intercept yet, and nobody answers for the other team.
					if b.SubmitGuess(ids[2], "intercept", ws.SubmitGuessData{Round: 1, Guess: [3]int{1, 2, 3}}) == nil {
						t.Fatal("an interception was taken in round 1")
					}
					if b.SubmitGuess(ids[2], "decrypt", ws.SubmitGuessData{Round: 1, Guess: [3]int{1, 2, 3}}) == nil {
						t.Fatal("the opponents decoded for team A")
					}
					if b.SubmitGuess(ids[4], "decrypt", ws.SubmitGuessData{Round: 1, Guess: [3]int{1, 2, 3}}) == nil {
						t.Fatal("observer guess accepted")
					}
					checkedGuess = true
				}
				for _, id := range ids[:4] {
					v := b.Sync(id)
					if v == nil || v.Submitted {
						continue
					}
					name := seatAction(v.YourRole, v.Phase, v.Round)
					key := fmt.Sprintf("%d:%s", v.Round, name)
					if name == "" || acted[key] {
						continue
					}
					if name == "encrypt" {
						if !checked {
							if b.SubmitGuess(ids[2], "decrypt", ws.SubmitGuessData{Round: v.Round, Guess: [3]int{1, 2, 3}}) == nil {
								t.Fatal("early opponent decrypt accepted")
							}
							if b.SubmitClues(ids[4], ws.SubmitCluesData{Round: v.Round, Clues: [3]string{"a", "b", "c"}}) == nil {
								t.Fatal("observer submit accepted")
							}
							if b.SubmitClues(id, ws.SubmitCluesData{Round: v.Round}) == nil {
								t.Fatal("empty clues accepted")
							}
							if b.SubmitClues(id, ws.SubmitCluesData{Round: 0, Clues: [3]string{"a", "b", "c"}}) == nil {
								t.Fatal("stale round accepted")
							}
							if err := b.ValidateProgress(ids[2], ws.ProgressData{Round: v.Round, Action: "encrypt", Step: 3}); err == nil {
								t.Fatal("spoofed progress accepted")
							}
							drafting := ws.ProgressData{Round: v.Round, Action: "encrypt", State: "editing", Step: 2, Focus: 3, Filled: []bool{true, false, true}}
							if err := b.ValidateProgress(id, drafting); err != nil {
								t.Fatalf("out-of-order drafting progress rejected: %v", err)
							}
							drafting.Filled = make([]bool, 4)
							if b.ValidateProgress(id, drafting) == nil {
								t.Fatal("oversized progress accepted")
							}
							checked = true
						}
						var digits [3]int
						copy(digits[:], v.SecretDigits)
						secrets[v.Round] = digits
						d := ws.SubmitCluesData{Round: v.Round, Clues: [3]string{"one", "two", "three"}}
						if err := b.SubmitClues(id, d); err != nil {
							t.Fatal(err)
						}
						if b.SubmitClues(id, d) == nil {
							t.Fatal("duplicate clues accepted")
						}
					} else {
						if b.SubmitGuess(id, name, ws.SubmitGuessData{Round: v.Round, Guess: [3]int{1, 1, 9}}) == nil {
							t.Fatal("invalid guess accepted")
						}
						guess := secrets[v.Round]
						wrong := name == "intercept" || ending == "two-decrypt-errors" && v.Round%2 == 1
						if ending == "two-interceptions" && name == "intercept" && v.Round%2 == 1 {
							wrong = false
						}
						if wrong {
							guess[0], guess[1] = guess[1], guess[0]
						}
						if err := b.SubmitGuess(id, name, ws.SubmitGuessData{Round: v.Round, Guess: guess}); err != nil {
							t.Fatal(err)
						}
						if b.SubmitGuess(id, name, ws.SubmitGuessData{Round: v.Round, Guess: guess}) == nil {
							t.Fatal("duplicate guess accepted")
						}
					}
					acted[key] = true
				}
				time.Sleep(time.Millisecond)
			}
			t.Fatal("game stalled")
		})
	}
}

type constantProvider struct{}

func (constantProvider) Complete(context.Context, []ai.Message) (string, error) { return "1", nil }

func TestAIInvalidRepeatedAnswersRemainLegalAndFinish(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "")
	t.Setenv("ANTHROPIC_API_KEY", "")
	r := room.NewRoom(t.Name(), &room.PlayerInfo{ID: "observer", Nickname: "observer"})
	if err := r.LeaveTeam("observer"); err != nil {
		t.Fatal(err)
	}
	for _, team := range []string{"A", "A", "B", "B"} {
		if err := r.AddAI(team); err != nil {
			t.Fatal(err)
		}
	}
	b, err := NewBridge(context.Background(), r, ws.NewHub(nil))
	if err != nil {
		t.Fatal(err)
	}
	b.Timing = Timings{Encrypt: time.Second, Guess: time.Second, AI: time.Second, Request: 10 * time.Millisecond, BetweenRounds: time.Millisecond}
	b.AIPlayer = ai.NewAIPlayer(constantProvider{})
	defer func() { b.Stop(); RemoveBridge(b.Session.SessionID()) }()
	b.Start()
	until := time.Now().Add(3 * time.Second)
	for time.Now().Before(until) {
		v := b.Sync("observer")
		if v != nil && v.Phase == "game_over" {
			if v.Notice == "" || v.GameOver.Notice == "" {
				t.Fatal("fallback warning missing from final result")
			}
			for _, row := range v.History {
				for _, guess := range [][]int{row.Intercept, row.Decrypt} {
					if len(guess) == 3 && guess[0] != 0 && !validGuess([3]int{guess[0], guess[1], guess[2]}) {
						t.Fatalf("illegal AI guess %v", guess)
					}
				}
			}
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("AI game stalled")
}

func TestAIRequestAndActionDeadlines(t *testing.T) {
	b := &Bridge{Room: room.NewRoom("deadline", &room.PlayerInfo{ID: "p"}), Hub: ws.NewHub(nil), views: map[string]ws.GameSyncData{"p": {}}, Timing: Timings{Request: 10 * time.Millisecond}}
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Millisecond)
	defer cancel()
	calls := 0
	started := time.Now()
	got := aiStep(ctx, b, "decrypt", "AI", 1, func(ctx context.Context) (int, error) { calls++; <-ctx.Done(); return 0, ctx.Err() }, 3)
	if got != 3 || calls != 2 || time.Since(started) > 200*time.Millisecond {
		t.Fatalf("unbounded fallback: got=%d calls=%d", got, calls)
	}
	v := b.Sync("p")
	if status := v.AIStatus["decrypt"]; status == nil || status.State != "fallback" || status.Completed != 1 || v.Notice == "" {
		t.Fatalf("missing visible fallback: %+v", v)
	}
	b.aiStatus("decrypt", "AI", "thinking", 2, 1, "")
	if b.Sync("p").Notice == "" {
		t.Fatal("fallback warning disappeared")
	}
}

func TestTimeoutSendsDraftAndTellsEveryone(t *testing.T) {
	b, ids := newTestBridge(t)
	b.Timing.Encrypt = 150 * time.Millisecond
	b.Start()
	until := time.Now().Add(3 * time.Second)
	drafted := false
	for time.Now().Before(until) {
		v := b.Sync(ids[0])
		if v == nil {
			time.Sleep(time.Millisecond)
			continue
		}
		if v.Phase == "encrypting" && !drafted {
			d := ws.ProgressData{Round: v.Round, Action: "encrypt", State: "editing", Step: 2, Clues: []string{"harbor", "", "snow"}}
			if err := b.ValidateProgress(ids[0], d); err != nil {
				t.Fatal(err)
			}
			b.RecordDraft(d)
			drafted = true
		}
		if v.Phase == "guess" {
			if len(v.SecretDigits) != 3 {
				t.Fatal("the encryptor lost the code after sending")
			}
			if len(v.Timeouts) != 1 || v.Timeouts[0].Action != "encrypt" || v.Timeouts[0].Outcome != "draft" || v.Timeouts[0].Player != ids[0] {
				t.Fatalf("timeout not announced: %+v", v.Timeouts)
			}
			if got := v.Clues; len(got) != 3 || got[0] != "harbor" || got[1] != "—" || got[2] != "snow" {
				t.Fatalf("draft not sent: %v", got)
			}
			if len(b.Sync(ids[2]).Timeouts) != 1 {
				t.Fatal("the other team was not told about the timeout")
			}
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("timeout never settled")
}

// untilView waits until a seat's view satisfies holds.
func untilView(t *testing.T, b *Bridge, id, what string, holds func(ws.GameSyncData) bool) ws.GameSyncData {
	t.Helper()
	until := time.Now().Add(3 * time.Second)
	for time.Now().Before(until) {
		if v := b.Sync(id); v != nil && holds(*v) {
			return *v
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("%s never saw %s: %s", id, what, asJSON(t, b.Sync(id)))
	return ws.GameSyncData{}
}

// settled is a seat's view of a round's result, as the game stored it.
func settled(t *testing.T, d *disk, round int, id string) ws.GameSyncData {
	t.Helper()
	until := time.Now().Add(3 * time.Second)
	for time.Now().Before(until) {
		for _, state := range d.saved() {
			var snap Snapshot
			if err := json.Unmarshal(state, &snap); err != nil {
				t.Fatal(err)
			}
			if snap.Round == round && snap.Phase == "round_result" {
				return snap.Views[id]
			}
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("round %d was never settled", round)
	return ws.GameSyncData{}
}

// codeOf reads the round's code from the encryptor's view.
func codeOf(t *testing.T, b *Bridge, ids []string) [3]int {
	t.Helper()
	for _, id := range ids[:4] {
		if v := b.Sync(id); v != nil && v.YourRole == "encryptor" && len(v.SecretDigits) == 3 {
			return [3]int(v.SecretDigits)
		}
	}
	t.Fatal("no encryptor holds the code")
	return [3]int{}
}

func TestBothTeamsGuessAtOnce(t *testing.T) {
	for _, first := range []string{"intercept", "decrypt"} {
		t.Run(first+" first", func(t *testing.T) {
			b, ids := newTestBridge(t)
			b.Timing = patientTimings
			stored := &disk{}
			b.OnSave = stored.save
			b.Start()
			// Round 3: a2 encrypts, a1 decodes, b1 and b2 intercept.
			play(t, b, ids, plan{}, func(v ws.GameSyncData) bool { return v.Round == 3 && v.Phase == "guess" })
			a1, a2, b1, b2, observer := ids[0], ids[1], ids[2], ids[3], ids[4]
			code := codeOf(t, b, ids)
			wrong := [3]int{code[1], code[0], code[2]}
			for id, waiting := range map[string]bool{a1: false, a2: true, b1: false, b2: false, observer: true} {
				v := b.Sync(id)
				actions := v.Actions
				if v.Waiting != waiting || v.Deadline == 0 || len(actions) != 2 || actions["decrypt"].Team != "A" || actions["intercept"].Team != "B" ||
					actions["decrypt"].Submitted || actions["intercept"].Submitted {
					t.Fatalf("%s sees the guessing as %s", id, asJSON(t, v))
				}
			}
			answer := func(name string) {
				t.Helper()
				id, guess := b1, code
				if name == "decrypt" {
					id, guess = a1, wrong
				}
				if err := b.SubmitGuess(id, name, ws.SubmitGuessData{Round: 3, Guess: guess}); err != nil {
					t.Fatal(err)
				}
			}
			answer(first)
			other := map[string]string{"intercept": "decrypt", "decrypt": "intercept"}[first]
			v := untilView(t, b, observer, first+" recorded", func(v ws.GameSyncData) bool { return v.Actions[first].Submitted })
			// The phase goes on for the other team, and nothing is revealed yet.
			if v.Phase != "guess" || v.Actions[other].Submitted || v.RoundResult != nil || v.ScoreA != (ws.ScoreInfo{}) || v.ScoreB != (ws.ScoreInfo{}) {
				t.Fatalf("the first answer settled something: %s", asJSON(t, v))
			}
			for id, can := range map[string]bool{a1: other == "decrypt", b1: other == "intercept", b2: other == "intercept"} {
				if v := b.Sync(id); v.Waiting == can || v.Submitted == can {
					t.Fatalf("%s may act: %v, sees %s", id, can, asJSON(t, v))
				}
			}
			if first == "intercept" && b.SubmitGuess(b2, "intercept", ws.SubmitGuessData{Round: 3, Guess: code}) == nil {
				t.Fatal("team B answered twice")
			}
			answer(other)
			v = settled(t, stored, 3, observer)
			if r := v.RoundResult; r == nil || r.InterceptSuccess == nil || !*r.InterceptSuccess || r.DecryptSuccess == nil || *r.DecryptSuccess {
				t.Fatalf("round 3 settled as %s", asJSON(t, v.RoundResult))
			}
			// Both guesses count in the same round.
			if v.ScoreA != (ws.ScoreInfo{DecryptFailures: 1}) || v.ScoreB != (ws.ScoreInfo{Interceptions: 1}) {
				t.Fatalf("score %+v / %+v", v.ScoreA, v.ScoreB)
			}
			if row := v.History[2]; [3]int(row.Intercept) != code || [3]int(row.Decrypt) != wrong {
				t.Fatalf("round 3 recorded as %s", asJSON(t, row))
			}
		})
	}
}

func TestOneTeamRunsOutOfTimeWhileTheOtherAnswered(t *testing.T) {
	for _, drafted := range []bool{false, true} {
		t.Run(fmt.Sprintf("drafted=%v", drafted), func(t *testing.T) {
			b, ids := newTestBridge(t)
			b.Timing = patientTimings
			b.Timing.Guess = 400 * time.Millisecond
			stored := &disk{}
			b.OnSave = stored.save
			b.Start()
			play(t, b, ids, plan{}, func(v ws.GameSyncData) bool { return v.Round == 3 && v.Phase == "guess" })
			a1, b1 := ids[0], ids[2]
			code := codeOf(t, b, ids)
			if err := b.SubmitGuess(b1, "intercept", ws.SubmitGuessData{Round: 3, Guess: code}); err != nil {
				t.Fatal(err)
			}
			if drafted {
				d := ws.ProgressData{Round: 3, Action: "decrypt", State: "editing", Step: 3, Guesses: code[:]}
				if err := b.ValidateProgress(a1, d); err != nil {
					t.Fatal(err)
				}
				b.RecordDraft(d)
			}
			v := settled(t, stored, 3, a1)
			outcome := map[bool]string{false: "none", true: "guess"}[drafted]
			if len(v.Timeouts) != 1 || v.Timeouts[0].Action != "decrypt" || v.Timeouts[0].Team != "A" || v.Timeouts[0].Outcome != outcome {
				t.Fatalf("timeouts %s", asJSON(t, v.Timeouts))
			}
			if r := v.RoundResult; r == nil || !*r.InterceptSuccess || *r.DecryptSuccess != drafted {
				t.Fatalf("round 3 settled as %s", asJSON(t, v.RoundResult))
			}
			if row := v.History[2]; len(row.Timeouts) != 1 || row.Timeouts[0] != "decrypt" {
				t.Fatalf("round 3 recorded as %s", asJSON(t, row))
			}
		})
	}
}

func TestGuessDigitsStayWithTheirTeam(t *testing.T) {
	b, ids := newTestBridge(t)
	b.Timing = patientTimings
	b.Start()
	play(t, b, ids, plan{}, func(v ws.GameSyncData) bool { return v.Round == 3 && v.Phase == "guess" })
	// Round 3: a2 encrypts and may check both guesses against the code.
	want := map[string]map[string]bool{
		"decrypt":   {"a1": true, "a2": true, "b1": false, "b2": false, "observer": false},
		"intercept": {"a1": false, "a2": true, "b1": true, "b2": true, "observer": false},
	}
	for name, readers := range want {
		b.mu.Lock()
		got := b.progressReadersLocked(name)
		b.mu.Unlock()
		for id, reads := range readers {
			if got[id] != reads {
				t.Errorf("%s reads the %s digits: %v, want %v", id, name, got[id], reads)
			}
		}
	}
}
