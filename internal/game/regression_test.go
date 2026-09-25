package game

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/ZinkLu/decrypto-the-game/internal/ai"
	"github.com/ZinkLu/decrypto-the-game/internal/room"
	"github.com/ZinkLu/decrypto-the-game/internal/ws"
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
	b, err := NewBridge(r, ws.NewHub(nil))
	if err != nil {
		t.Fatal(err)
	}
	b.Timing = Timings{time.Second, time.Second, time.Second, 20 * time.Millisecond, time.Millisecond, time.Millisecond}
	t.Cleanup(func() { b.Stop(); RemoveBridge(b.Session.SessionID()) })
	return b, ids
}

func TestGameValidationAndAllEndings(t *testing.T) {
	for _, ending := range []string{"16-round-draw", "two-decrypt-errors", "two-interceptions"} {
		t.Run(ending, func(t *testing.T) {
			b, ids := newTestBridge(t)
			if _, err := NewBridge(b.Room, b.Hub); err == nil {
				t.Fatal("duplicate start accepted")
			}
			b.Start()
			secrets := map[int][3]int{}
			acted := map[string]bool{}
			checked := false
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
				for _, id := range ids[:4] {
					v := b.Sync(id)
					if v == nil || !canAct(v.YourRole, v.Phase) || v.Submitted {
						continue
					}
					key := fmt.Sprintf("%d:%s", v.Round, v.Phase)
					if acted[key] {
						continue
					}
					if v.Phase == "encrypting" {
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
						if b.SubmitGuess(id, v.Phase, ws.SubmitGuessData{Round: v.Round, Guess: [3]int{1, 1, 9}}) == nil {
							t.Fatal("invalid guess accepted")
						}
						guess := secrets[v.Round]
						wrong := v.Phase == "intercept" || ending == "two-decrypt-errors" && v.Round%2 == 1
						if ending == "two-interceptions" && v.Phase == "intercept" && v.Round%2 == 1 {
							wrong = false
						}
						if wrong {
							guess[0], guess[1] = guess[1], guess[0]
						}
						if err := b.SubmitGuess(id, v.Phase, ws.SubmitGuessData{Round: v.Round, Guess: guess}); err != nil {
							t.Fatal(err)
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
	b, err := NewBridge(r, ws.NewHub(nil))
	if err != nil {
		t.Fatal(err)
	}
	b.Timing = Timings{time.Second, time.Second, time.Second, 10 * time.Millisecond, time.Millisecond, time.Millisecond}
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
	if v.AIStatus.State != "fallback" || v.AIStatus.Completed != 1 || v.Notice == "" {
		t.Fatalf("missing visible fallback: %+v", v)
	}
	b.aiStatus("decrypt", "AI", "thinking", 2, 1, "")
	if b.Sync("p").Notice == "" {
		t.Fatal("fallback warning disappeared")
	}
}
