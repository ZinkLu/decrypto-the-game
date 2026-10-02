package game

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/ZinkLu/decrypto-the-game/server/internal/ai"
	"github.com/ZinkLu/decrypto-the-game/server/internal/room"
	"github.com/ZinkLu/decrypto-the-game/server/internal/ws"
)

func parallelJobs(b *Bridge, count int, allAI bool) []aiGuessJob {
	a := b.actions["intercept"]
	a.ai = allAI
	if allAI {
		a.submitterID = "ai-B-1"
	}
	jobs := make([]aiGuessJob, count)
	for i := range jobs {
		id := "ai-B-" + strconv.Itoa(i+1)
		b.views[id] = ws.GameSyncData{Round: 3, Phase: "guess", YourRole: "opponent", YourTeam: "B"}
		jobs[i] = aiGuessJob{action: "intercept", intercept: true, playerID: id, player: "same-ai-name", round: 3,
			clues: [3]string{"first", "second", "third"}, deadline: a.deadline, actionState: a,
			canSubmit: allAI && i == 0, suggestion: !allAI || i != 0}
	}
	return jobs
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

func TestEveryAIStartsConcurrentlyWithIndependentChoices(t *testing.T) {
	b, ids := progressBridge(t)
	jobs := parallelJobs(b, 3, false)
	started, release := make(chan int, 3), make(chan struct{})
	b.AIPlayer = barrierAI(started, release)
	b.Timing.Request = time.Minute
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	answers := make(chan aiAnswer, 3)
	b.runAIGuesses(ctx, jobs, answers)
	awaitSignals(t, started, 3) // No worker can finish its first call before this.
	before := b.Sync(ids[2])
	for _, job := range jobs {
		p := before.TeammateProgress[job.playerID]
		if p == nil || p.State != "thinking" || p.Focus != 1 || p.CanSubmit || !p.Suggestion {
			t.Fatalf("AI did not have independent pending state: %+v", p)
		}
	}
	close(release)
	progress := awaitProgress(t, b, ids[2], func(p map[string]*ws.PlayerProgressData) bool {
		for _, job := range jobs {
			if p[job.playerID] == nil || p[job.playerID].State != "ready" {
				return false
			}
		}
		return true
	})
	distinct := map[[3]int]bool{}
	for _, job := range jobs {
		p := progress[job.playerID]
		guess := [3]int{p.Guesses[0], p.Guesses[1], p.Guesses[2]}
		if !validGuess(guess) || p.Step != 3 || p.Focus != 0 || p.PlayerID != job.playerID || p.CanSubmit {
			t.Fatalf("bad independent choice: %+v", p)
		}
		distinct[guess] = true
		if before.TeammateProgress[job.playerID].State != "thinking" {
			t.Fatal("an AI result mutated a previous sync")
		}
		for _, viewer := range []string{ids[1], ids[4]} {
			redacted := b.Sync(viewer).TeammateProgress[job.playerID]
			if redacted.Guesses != nil || !reflect.DeepEqual(redacted.Filled, []bool{true, true, true}) {
				t.Fatalf("individual AI digits leaked to %s: %+v", viewer, redacted)
			}
		}
	}
	if len(distinct) != 3 || len(answers) != 0 || b.Sync(ids[2]).Submitted {
		t.Fatalf("AI answers were collapsed or submitted: choices=%v answers=%d", distinct, len(answers))
	}
}

func TestParallelAIRetryAndFailureBelongOnlyToTheirSeat(t *testing.T) {
	b, ids := progressBridge(t)
	jobs := parallelJobs(b, 2, false)
	started := make(chan int, 3)
	firstRelease, peerRelease, retryRelease := make(chan struct{}), make(chan struct{}), make(chan struct{})
	var mu sync.Mutex
	calls := 0
	b.Timing.Request = time.Minute
	b.AIPlayer = ai.NewAIPlayer(progressProvider(func(ctx context.Context, messages []ai.Message) (string, error) {
		if next, ok := nextIndependentDigit(messages); ok {
			return next, nil
		}
		mu.Lock()
		calls++
		n := calls
		mu.Unlock()
		started <- n
		gate := firstRelease
		if n == 2 {
			gate = peerRelease
		} else if n == 3 {
			gate = retryRelease
		}
		select {
		case <-gate:
			if n == 2 {
				return "2", nil
			}
			return "", errors.New("only this worker failed")
		case <-ctx.Done():
			return "", ctx.Err()
		}
	}))
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	b.runAIGuesses(ctx, jobs, make(chan aiAnswer, 2))
	awaitSignals(t, started, 2)
	close(firstRelease)
	awaitSignals(t, started, 1)
	retrying := 0
	for _, job := range jobs {
		p := b.Sync(ids[2]).TeammateProgress[job.playerID]
		if p.State == "retrying" {
			retrying++
		} else if p.State != "thinking" {
			t.Fatalf("another worker inherited retry state: %+v", p)
		}
	}
	if retrying != 1 {
		t.Fatalf("expected exactly one retrying AI, got %d", retrying)
	}
	close(retryRelease)
	awaitProgress(t, b, ids[2], func(p map[string]*ws.PlayerProgressData) bool {
		return p[jobs[0].playerID].State == "unavailable" || p[jobs[1].playerID].State == "unavailable"
	})
	close(peerRelease)
	progress := awaitProgress(t, b, ids[2], func(p map[string]*ws.PlayerProgressData) bool {
		return p[jobs[0].playerID].State == "ready" || p[jobs[1].playerID].State == "ready"
	})
	states := map[string]int{}
	for _, job := range jobs {
		p := progress[job.playerID]
		states[p.State]++
		want := []int{2, 3, 4}
		if p.State == "unavailable" {
			want = []int{0, 0, 0}
		}
		if !reflect.DeepEqual(p.Guesses, want) || p.Focus != 0 {
			t.Fatalf("failure crossed into another seat: %+v", p)
		}
	}
	if states["ready"] != 1 || states["unavailable"] != 1 || len(b.Sync(ids[2]).AIStatus) != 0 || b.Sync(ids[2]).Notice != "" {
		t.Fatalf("individual failures were collapsed into team state: %v", states)
	}
}

func TestActionCompletionCancelsEveryAIWorker(t *testing.T) {
	for _, end := range []string{"human-submission", "all-ai-submission", "timeout", "phase-end"} {
		t.Run(end, func(t *testing.T) {
			b, ids := progressBridge(t)
			jobs := parallelJobs(b, 3, end == "all-ai-submission")
			started, canceled := make(chan int, 3), make(chan int, 3)
			b.Timing.Request = time.Minute
			b.AIPlayer = ai.NewAIPlayer(progressProvider(func(ctx context.Context, _ []ai.Message) (string, error) {
				started <- 1
				<-ctx.Done()
				canceled <- 1
				return "1", nil
			}))
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			b.runAIGuesses(ctx, jobs, make(chan aiAnswer, 3))
			awaitSignals(t, started, 3)
			switch end {
			case "human-submission":
				if err := b.SubmitGuess(ids[2], "intercept", ws.SubmitGuessData{Round: 3, Guess: [3]int{4, 2, 1}}); err != nil {
					t.Fatal(err)
				}
			case "all-ai-submission":
				if !b.acceptAIGuess(aiAnswer{job: jobs[0], guess: [3]int{4, 2, 1}}) {
					t.Fatal("designated AI could not submit")
				}
			case "timeout":
				b.mu.Lock()
				b.actions["intercept"].deadline = time.Now().Add(-time.Second)
				b.mu.Unlock()
				b.expired()
			case "phase-end":
				b.closeInput()
			}
			awaitSignals(t, canceled, 3)
			for _, job := range jobs {
				if b.broadcastAIProgress(job, "ready", 3, 0, []int{1, 2, 3}) {
					t.Fatalf("%s allowed a late AI update", end)
				}
			}
		})
	}
}

func TestAllAIHasOneAuthorizedSubmitterAndIndependentAdvisors(t *testing.T) {
	b, ids := progressBridge(t)
	jobs := parallelJobs(b, 3, true)
	started, release := make(chan int, 3), make(chan struct{})
	b.AIPlayer = barrierAI(started, release)
	b.Timing.Request = time.Minute
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	answers := make(chan aiAnswer, 3)
	b.runAIGuesses(ctx, jobs, answers)
	awaitSignals(t, started, 3)
	close(release)
	progress := awaitProgress(t, b, ids[2], func(p map[string]*ws.PlayerProgressData) bool {
		for _, job := range jobs {
			if p[job.playerID] == nil || p[job.playerID].State != "ready" {
				return false
			}
		}
		return true
	})
	for i, job := range jobs {
		p := progress[job.playerID]
		if p.CanSubmit != (i == 0) || p.Suggestion != (i != 0) || p.State == "submitted" {
			t.Fatalf("bad per-seat authority before acceptance: %+v", p)
		}
	}
	for _, job := range jobs[1:] {
		if err := b.SubmitGuess(job.playerID, "intercept", ws.SubmitGuessData{Round: 3, Guess: [3]int{1, 2, 3}}); err == nil {
			t.Fatal("advisory AI could submit through the socket boundary")
		}
		for _, forged := range []aiGuessJob{job, func() aiGuessJob { j := job; j.canSubmit, j.suggestion = true, false; return j }()} {
			if b.acceptAIGuess(aiAnswer{job: forged, guess: [3]int{1, 2, 3}}) {
				t.Fatal("advisory AI could forge a submission at acceptance")
			}
		}
		if b.broadcastAIProgress(job, "submitted", 3, 0, []int{1, 2, 3}) {
			t.Fatal("advisory AI forged submitted progress")
		}
	}
	var answer aiAnswer
	select {
	case answer = <-answers:
	case <-time.After(time.Second):
		t.Fatal("designated AI did not answer")
	}
	if answer.job.playerID != jobs[0].playerID || len(answers) != 0 || !b.acceptAIGuess(answer) {
		t.Fatalf("wrong AI answer authority: %+v", answer.job)
	}
	for i, job := range jobs {
		p := b.Sync(ids[2]).TeammateProgress[job.playerID]
		if (p.State == "submitted") != (i == 0) {
			t.Fatalf("acceptance falsely marked another AI submitted: %+v", p)
		}
		if b.broadcastAIProgress(job, "ready", 3, 0, []int{1, 2, 3}) {
			t.Fatal("acceptance left an AI worker authorized to update")
		}
	}
	if b.acceptAIGuess(answer) {
		t.Fatal("same AI answer accepted twice")
	}
}

func TestPhaseSeedsEveryEligibleSeatAndStartsAllMixedAI(t *testing.T) {
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
	b, err := NewBridge(r, ws.NewHub(nil))
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
	awaitSignals(t, started, 2)
	v := b.Sync("decoder")
	if len(v.TeammateProgress) != 3 || v.TeammateProgress["encryptor"] != nil || v.TeammateProgress["decoder"].State != "idle" || !v.TeammateProgress["decoder"].CanSubmit {
		t.Fatalf("phase did not seed exactly the eligible actors: %+v", v.TeammateProgress)
	}
	for _, p := range r.Snapshot().TeamA {
		if p.IsAI {
			progress := v.TeammateProgress[p.ID]
			if progress == nil || progress.State != "thinking" || progress.CanSubmit || !progress.Suggestion {
				t.Fatalf("mixed AI was not an independent advisor: %+v", progress)
			}
			if err := b.SubmitGuess(p.ID, "decrypt", ws.SubmitGuessData{Round: 1, Guess: [3]int{1, 2, 3}}); err == nil {
				t.Fatal("mixed AI could submit")
			}
		}
	}
	close(release)
	awaitProgress(t, b, "decoder", func(p map[string]*ws.PlayerProgressData) bool {
		ready := 0
		for _, entry := range p {
			if entry.IsAI && entry.State == "ready" {
				ready++
			}
		}
		return ready == 2
	})
	if v := b.Sync("decoder"); v.Phase != "guess" || v.Submitted || v.Waiting {
		t.Fatalf("mixed team did not wait for a human answer: %+v", v)
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
	b, err := NewBridge(r, ws.NewHub(nil))
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
