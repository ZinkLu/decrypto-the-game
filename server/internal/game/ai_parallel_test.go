package game

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/ZinkLu/decrypto-the-game/server/internal/ai"
	"github.com/ZinkLu/decrypto-the-game/server/internal/core"
	"github.com/ZinkLu/decrypto-the-game/server/internal/room"
	"github.com/ZinkLu/decrypto-the-game/server/internal/ws"
)

func TestAIAttemptsFromEnv(t *testing.T) {
	for _, tc := range []struct {
		env  string
		want int
	}{
		{"", defaultAIAttempts},
		{" ", defaultAIAttempts},
		{"0", defaultAIAttempts},
		{"-3", defaultAIAttempts},
		{"three", defaultAIAttempts},
		{"1", 1},
		{" 4 ", 4},
	} {
		t.Setenv("DECRYPTO_AI_ATTEMPTS", tc.env)
		if got := aiAttempts(); got != tc.want {
			t.Fatalf("DECRYPTO_AI_ATTEMPTS=%q: got %d, want %d", tc.env, got, tc.want)
		}
	}
	t.Setenv("DECRYPTO_AI_ATTEMPTS", "3")
	b := &Bridge{Room: room.NewRoom("attempts", &room.PlayerInfo{ID: "p"}), Hub: ws.NewHub(nil), views: map[string]ws.GameSyncData{"p": {}}, Timing: Timings{Request: time.Minute}}
	calls := 0
	got := aiStep(context.Background(), b, "decrypt", "AI", 1, func(context.Context) (int, error) {
		calls++
		return 0, fmt.Errorf("no answer")
	}, 3)
	if got != 3 || calls != 3 {
		t.Fatalf("configured tries ignored: got=%d calls=%d", got, calls)
	}
	if v := b.Sync("p"); v.AIStatus["decrypt"].Notice != "AI 未能完成回答，已使用备用线索或合法猜测继续。" {
		t.Fatalf("missing visible fallback: %+v", v)
	}
}

func awaitSignals(t *testing.T, signals <-chan int, count int) {
	t.Helper()
	for range count {
		select {
		case <-signals:
		case <-time.After(time.Second):
			t.Fatal("AI workers did not reach the barrier concurrently")
		}
	}
}

func awaitProgress(t *testing.T, b *Bridge, viewer string, ready func(map[string]*ws.PlayerProgressData) bool) map[string]*ws.PlayerProgressData {
	t.Helper()
	until := time.Now().Add(time.Second)
	for time.Now().Before(until) {
		progress := b.Sync(viewer).TeammateProgress
		if ready(progress) {
			return progress
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("progress never reached expected state: %+v", b.Sync(viewer).TeammateProgress)
	return nil
}

// Later digits depend on this worker's first answer, so shared result buffers
// or shared model histories would produce either repeated or illegal answers.
func nextIndependentDigit(messages []ai.Message) (string, bool) {
	content := messages[len(messages)-1].Content
	const marker = "你本轮已经猜测的编号："
	_, tail, hasPrevious := strings.Cut(content, marker)
	if !hasPrevious {
		return "", false
	}
	previous, _, _ := strings.Cut(tail, "。")
	used := map[int]bool{}
	last := 0
	for _, part := range strings.Split(previous, ", ") {
		last, _ = strconv.Atoi(part)
		used[last] = true
	}
	for n := last%4 + 1; ; n = n%4 + 1 {
		if !used[n] {
			return strconv.Itoa(n), true
		}
	}
}

func barrierAI(started chan<- int, release <-chan struct{}) *ai.AIPlayer {
	var mu sync.Mutex
	calls := 0
	return ai.NewAIPlayer(progressProvider(func(ctx context.Context, messages []ai.Message) (string, error) {
		if next, ok := nextIndependentDigit(messages); ok {
			return next, nil
		}
		mu.Lock()
		calls++
		ordinal := calls
		mu.Unlock()
		started <- ordinal
		select {
		case <-release:
			return strconv.Itoa((ordinal-1)%4 + 1), nil
		case <-ctx.Done():
			return "", ctx.Err()
		}
	}))
}

// Arrange a real room and a valid guessing snapshot without running the game
// goroutine, so worker counts and submission authority can be observed directly.
func aiGuessBridge(t *testing.T, teamA, teamB []bool, round int) (*Bridge, *core.Round) {
	t.Helper()
	t.Setenv("OPENAI_API_KEY", "")
	t.Setenv("ANTHROPIC_API_KEY", "")
	r := room.NewRoom(t.Name(), &room.PlayerInfo{ID: "observer", Nickname: "observer"})
	if err := r.LeaveTeam("observer"); err != nil {
		t.Fatal(err)
	}
	for index, seats := range [][]bool{teamA, teamB} {
		team := []string{"A", "B"}[index]
		for seat, isAI := range seats {
			if isAI {
				if err := r.AddAI(team); err != nil {
					t.Fatal(err)
				}
			} else {
				p := &room.PlayerInfo{ID: team + strconv.Itoa(seat+1), Nickname: "same-name"}
				if _, err := r.Join(p); err != nil {
					t.Fatal(err)
				}
				if err := r.AddToTeam(p, team); err != nil {
					t.Fatal(err)
				}
			}
		}
	}
	b, err := NewBridge(context.Background(), r, ws.NewHub(nil))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { b.Stop(); RemoveBridge(b.Session.SessionID()) })
	b.Timing = patientTimings
	snap := b.Session.Snapshot()
	for n := 1; n <= round; n++ {
		rs := core.RoundSnapshot{Number: uint8(n), Phase: core.DONE,
			Encryptor: uint8((n - 1) / 2 % len(snap.Teams[(n-1)%2].Players)),
			Secret:    [3]int{1, 2, 3}, Clues: [3]string{"first", "second", "third"},
			Decrypt: [3]int{1, 2, 3}, Decrypted: true}
		if n > 2 {
			rs.Intercepted = true
		}
		if n == round {
			rs.Phase, rs.Decrypted, rs.Intercepted = core.GUESSING, false, false
			rs.Decrypt = [3]int{}
		}
		snap.Rounds = append(snap.Rounds, rs)
	}
	b.Session, err = core.Restore(snap)
	if err != nil {
		t.Fatal(err)
	}
	current := b.Session.GetCurrentRound()
	b.setPhase("guess", current)
	return b, current
}

func TestGuessingSelectsOnlyOneAIForEachTeam(t *testing.T) {
	for _, tc := range []struct {
		name                   string
		a, b                   []bool
		round                  int
		decrypt, intercept     int // selected seat, -1 for no AI worker
		decryptAI, interceptAI bool
	}{
		{"all-ai", []bool{true, true, true}, []bool{true, true, true}, 1, 1, -1, true, false},
		{"all-ai-rotated-encryptor", []bool{true, true, true}, []bool{true, true, true}, 3, 0, 0, true, true},
		{"mixed", []bool{false, false, true, true}, []bool{false, true, true}, 3, 2, 1, false, false},
		{"human-encryptor-only-ai-decoders", []bool{false, true, true}, []bool{true, true}, 1, 1, -1, true, false},
		{"ai-encryptor-human-decoder", []bool{true, false, true}, []bool{false, false}, 1, 2, -1, false, false},
		{"human-only", []bool{false, false}, []bool{false, false}, 3, -1, -1, false, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			b, round := aiGuessBridge(t, tc.a, tc.b, tc.round)
			seats := [][]*room.PlayerInfo{b.Room.Snapshot().TeamA, b.Room.Snapshot().TeamB}
			for index, slot := range []int{tc.decrypt, tc.intercept} {
				name, maySubmit := "decrypt", tc.decryptAI
				if index == 1 {
					name, maySubmit = "intercept", tc.interceptAI
				}
				job, ok := b.newAIGuess(round, index == 1)
				if ok != (slot >= 0) {
					t.Fatalf("%s worker exists=%v, selected seat=%d", name, ok, slot)
				}
				if !ok {
					continue
				}
				selected := seats[index][slot].ID
				if job.playerID != selected || job.canSubmit != maySubmit || job.suggestion == maySubmit {
					t.Fatalf("wrong selected worker for %s: %+v", name, job)
				}
				for _, person := range seats[index] {
					if !person.IsAI || person.ID == round.EncryptPlayer().UID {
						continue
					}
					p := b.Sync("observer").TeammateProgress[person.ID]
					if person.ID == selected {
						if p == nil || p.State != "thinking" || p.Focus != 1 || p.CanSubmit != maySubmit {
							t.Fatalf("selected AI was not seeded: %+v", p)
						}
						continue
					}
					if p != nil {
						t.Fatalf("unselected AI was seeded: %+v", p)
					}
					forged := job
					forged.playerID = person.ID
					if b.broadcastAIProgress(forged, "thinking", 0, 1, nil) ||
						b.acceptAIGuess(aiAnswer{job: forged, guess: [3]int{1, 2, 3}}) {
						t.Fatal("unselected AI could act")
					}
					if err := b.SubmitGuess(person.ID, name, ws.SubmitGuessData{Round: tc.round, Guess: [3]int{1, 2, 3}}); err == nil {
						t.Fatal("unselected AI could submit through the socket")
					}
				}
				if got := b.acceptAIGuess(aiAnswer{job: job, guess: [3]int{1, 2, 3}}); got != maySubmit {
					t.Fatalf("selected AI submission for %s accepted=%v, want=%v", name, got, maySubmit)
				}
			}
		})
	}
}

func TestTeamsStartOneAIConcurrentlyWithIndependentChoices(t *testing.T) {
	b, round := aiGuessBridge(t, []bool{true, true, true}, []bool{true, true, true}, 3)
	started, release := make(chan int, 6), make(chan struct{})
	b.AIPlayer = barrierAI(started, release)
	b.Timing.Request = time.Minute
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	answers := make(chan aiAnswer, 2)
	b.startAIGuess(ctx, round, false, answers)
	b.startAIGuess(ctx, round, true, answers)
	awaitSignals(t, started, 2) // Both teams enter their first call before either finishes.
	before := b.Sync("observer")
	if len(before.TeammateProgress) != 2 || len(started) != 0 {
		t.Fatalf("expected one AI per team: %+v", before.TeammateProgress)
	}
	close(release)
	distinct := map[[3]int]bool{}
	for range 2 {
		select {
		case answer := <-answers:
			if !validGuess(answer.guess) || !b.acceptAIGuess(answer) {
				t.Fatalf("invalid or unauthorized AI answer: %+v", answer)
			}
			distinct[answer.guess] = true
			viewer := b.Room.Snapshot().TeamA[0].ID
			if answer.job.action == "intercept" {
				viewer = b.Room.Snapshot().TeamB[0].ID
			}
			p := b.Sync(viewer).TeammateProgress[answer.job.playerID]
			if p.State != "submitted" || !reflect.DeepEqual(p.Guesses, answer.guess[:]) {
				t.Fatalf("selected AI answer not visible to its own team: %+v", p)
			}
			opponentID := round.GetOpponent().Members()[0].UID
			if answer.job.action == "intercept" {
				opponentID = round.GetCurrentTeam().Members()[0].UID
			}
			for _, opponent := range []string{"observer", opponentID} {
				if b.Sync(opponent).TeammateProgress[answer.job.playerID].Guesses != nil {
					t.Fatal("AI guess leaked outside its team and encryptor")
				}
			}
		case <-time.After(time.Second):
			t.Fatal("selected AI did not complete")
		}
	}
	if len(distinct) != 2 || len(started) != 0 {
		t.Fatalf("teams shared choices or started extra AI workers: %v", distinct)
	}
	for _, p := range before.TeammateProgress {
		if p.State != "thinking" {
			t.Fatal("AI completion mutated an earlier sync")
		}
	}
}

func TestActionCompletionCancelsSelectedAIWorker(t *testing.T) {
	for _, end := range []string{"human-submission", "all-ai-submission", "timeout", "phase-end"} {
		t.Run(end, func(t *testing.T) {
			teamB := []bool{false, true, true}
			if end == "all-ai-submission" {
				teamB = []bool{true, true, true}
			}
			b, round := aiGuessBridge(t, []bool{false, false}, teamB, 3)
			job, ok := b.newAIGuess(round, true)
			if !ok {
				t.Fatal("missing selected AI")
			}
			started, canceled := make(chan int, 1), make(chan int, 1)
			b.Timing.Request = time.Minute
			b.AIPlayer = ai.NewAIPlayer(progressProvider(func(ctx context.Context, _ []ai.Message) (string, error) {
				started <- 1
				<-ctx.Done()
				canceled <- 1
				return "", ctx.Err()
			}))
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			b.runAIGuess(ctx, job, make(chan aiAnswer, 1))
			awaitSignals(t, started, 1)
			switch end {
			case "human-submission":
				id := b.Room.Snapshot().TeamB[0].ID
				if err := b.SubmitGuess(id, "intercept", ws.SubmitGuessData{Round: 3, Guess: [3]int{4, 2, 1}}); err != nil {
					t.Fatal(err)
				}
			case "all-ai-submission":
				if !b.acceptAIGuess(aiAnswer{job: job, guess: [3]int{4, 2, 1}}) {
					t.Fatal("selected AI could not submit")
				}
			case "timeout":
				b.mu.Lock()
				b.actions["intercept"].deadline = time.Now().Add(-time.Second)
				b.mu.Unlock()
				b.expired()
			case "phase-end":
				b.closeInput()
			}
			awaitSignals(t, canceled, 1)
			if b.broadcastAIProgress(job, "ready", 3, 0, []int{1, 2, 3}) {
				t.Fatalf("%s allowed late AI progress", end)
			}
		})
	}
}

func TestMixedTeamStartsOnlySelectedAIAndWaitsForHuman(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "")
	t.Setenv("ANTHROPIC_API_KEY", "")
	r := room.NewRoom(t.Name(), &room.PlayerInfo{ID: "encryptor", Nickname: "same-name"})
	for _, item := range []struct{ id, team string }{{"decoder", "A"}, {"b1", "B"}, {"b2", "B"}} {
		p := &room.PlayerInfo{ID: item.id, Nickname: "same-name"}
		if _, err := r.Join(p); err != nil {
			t.Fatal(err)
		}
		if err := r.AddToTeam(p, item.team); err != nil {
			t.Fatal(err)
		}
	}
	for range 2 {
		if err := r.AddAI("A"); err != nil {
			t.Fatal(err)
		}
	}
	b, err := NewBridge(context.Background(), r, ws.NewHub(nil))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { b.Stop(); RemoveBridge(b.Session.SessionID()) })
	b.Timing = patientTimings
	b.Timing.Request = time.Minute
	started, release := make(chan int, 2), make(chan struct{})
	b.AIPlayer = barrierAI(started, release)
	b.Start()
	if p := b.Sync("b1").TeammateProgress["encryptor"]; p == nil || p.State != "idle" || !p.CanSubmit || p.IsAI {
		t.Fatalf("human encryptor was not seeded: %+v", p)
	}
	if err := b.SubmitClues("encryptor", ws.SubmitCluesData{Round: 1, Clues: [3]string{"first", "second", "third"}}); err != nil {
		t.Fatal(err)
	}
	awaitSignals(t, started, 1)
	selected, idle := r.Snapshot().TeamA[2].ID, r.Snapshot().TeamA[3].ID
	v := b.Sync("decoder")
	if len(v.TeammateProgress) != 2 || v.TeammateProgress["encryptor"] != nil || v.TeammateProgress[idle] != nil ||
		v.TeammateProgress["decoder"].State != "idle" || !v.TeammateProgress["decoder"].CanSubmit {
		t.Fatalf("phase did not seed only human and selected AI: %+v", v.TeammateProgress)
	}
	if p := v.TeammateProgress[selected]; p == nil || p.State != "thinking" || p.CanSubmit || !p.Suggestion {
		t.Fatalf("selected AI is not an advisor: %+v", p)
	}
	for _, p := range r.Snapshot().TeamA[2:] {
		if err := b.SubmitGuess(p.ID, "decrypt", ws.SubmitGuessData{Round: 1, Guess: [3]int{1, 2, 3}}); err == nil {
			t.Fatal("mixed AI could submit")
		}
	}
	close(release)
	awaitProgress(t, b, "decoder", func(p map[string]*ws.PlayerProgressData) bool {
		return p[selected] != nil && p[selected].State == "ready"
	})
	if v := b.Sync("decoder"); v.Phase != "guess" || v.Submitted || v.Waiting || v.TeammateProgress[idle] != nil || len(started) != 0 {
		t.Fatalf("mixed team started extra AI or did not wait for human: %+v", v)
	}
}

func TestAIEncryptorSynchronizesIdentityAndFilledSlotsWithoutClueText(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "")
	t.Setenv("ANTHROPIC_API_KEY", "")
	r := room.NewRoom(t.Name(), &room.PlayerInfo{ID: "observer", Nickname: "observer"})
	if err := r.LeaveTeam("observer"); err != nil {
		t.Fatal(err)
	}
	if err := r.AddAI("A"); err != nil {
		t.Fatal(err)
	}
	for _, item := range []struct{ id, team string }{{"decoder", "A"}, {"b1", "B"}, {"b2", "B"}} {
		p := &room.PlayerInfo{ID: item.id, Nickname: item.id}
		if _, err := r.Join(p); err != nil {
			t.Fatal(err)
		}
		if err := r.AddToTeam(p, item.team); err != nil {
			t.Fatal(err)
		}
	}
	aiID := r.Snapshot().TeamA[0].ID
	b, err := NewBridge(context.Background(), r, ws.NewHub(nil))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { b.Stop(); RemoveBridge(b.Session.SessionID()) })
	b.Timing = patientTimings
	b.Timing.Request = time.Minute
	started, releaseFirst := make(chan int, 2), make(chan struct{})
	calls := 0
	b.AIPlayer = ai.NewAIPlayer(progressProvider(func(ctx context.Context, _ []ai.Message) (string, error) {
		calls++
		started <- calls
		if calls == 1 {
			select {
			case <-releaseFirst:
				return "unpublished-private-clue", nil
			case <-ctx.Done():
				return "", ctx.Err()
			}
		}
		<-ctx.Done()
		return "", ctx.Err()
	}))
	b.Start()
	awaitSignals(t, started, 1)
	if p := b.Sync("observer").TeammateProgress[aiID]; p == nil || !p.IsAI || !p.CanSubmit || p.Suggestion || p.State != "thinking" || p.Focus != 1 {
		t.Fatalf("AI encryptor identity or state missing: %+v", p)
	}
	close(releaseFirst)
	awaitSignals(t, started, 1)
	for _, viewer := range []string{"observer", "decoder", "b1"} {
		v := b.Sync(viewer)
		p := v.TeammateProgress[aiID]
		if p.Step != 1 || p.Focus != 2 || p.State != "thinking" || p.Guesses != nil || !reflect.DeepEqual(p.Filled, []bool{true, false, false}) {
			t.Fatalf("invalid encryption progress for %s: %+v", viewer, p)
		}
		serialized, err := json.Marshal(v)
		if err != nil || strings.Contains(string(serialized), "unpublished-private-clue") {
			t.Fatalf("unpublished clue leaked in %s's sync: %s (%v)", viewer, serialized, err)
		}
	}
}
