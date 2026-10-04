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

// No game goroutine runs here, so tests can arrange concurrent socket input
// without the next phase consuming the winner before it is inspected.
func progressBridge(t *testing.T) (*Bridge, []string) {
	t.Helper()
	b, ids := newTestBridge(t)
	b.phase, b.round = "guess", 3
	b.actions = map[string]*action{
		"decrypt":   {team: "A", deadline: time.Now().Add(time.Minute)},
		"intercept": {team: "B", deadline: time.Now().Add(time.Minute)},
	}
	for i, id := range ids {
		role, team := "opponent", "B"
		switch i {
		case 0:
			role, team = "encryptor", "A"
		case 1:
			role, team = "teammate", "A"
		case 4:
			role, team = "observer", ""
		}
		b.views[id] = ws.GameSyncData{Phase: "guess", Round: 3, YourRole: role, YourTeam: team, EncryptorID: ids[0]}
	}
	b.refreshLocked()
	return b, ids
}

func TestIndividualProgressSurvivesSyncAndKeepsItsAudience(t *testing.T) {
	b, ids := progressBridge(t)
	first := ws.ProgressData{Round: 3, Action: "intercept", State: "editing", Step: 2, Focus: 3, Guesses: []int{1, 2, 0}}
	b.RelayProgress(ids[2], "same-name", first)
	before := b.Sync(ids[2])
	b.RelayProgress(ids[3], "same-name", ws.ProgressData{Round: 3, Action: "intercept", State: "editing", Step: 3, Guesses: []int{3, 2, 4}})
	if len(before.TeammateProgress) != 1 {
		t.Fatal("updating another seat mutated an earlier sync snapshot")
	}
	for _, id := range ids {
		v := b.Sync(id)
		if len(v.TeammateProgress) != 2 {
			t.Fatalf("%s lost a same-name player's choice: %+v", id, v.TeammateProgress)
		}
		for _, actor := range ids[2:4] {
			p := v.TeammateProgress[actor]
			if p.PlayerID != actor || p.Player != "same-name" || p.IsAI || p.Suggestion || p.Round != 3 {
				t.Fatalf("wrong identity in %s's sync: %+v", id, p)
			}
			canRead := id == ids[0] || id == ids[2] || id == ids[3]
			if canRead != (len(p.Guesses) == 3) || !canRead && len(p.Filled) != 3 {
				t.Fatalf("%s's visibility of %s: %+v", id, actor, p)
			}
		}
	}
	// Payload storage must not alias the caller's buffer either.
	first.Guesses[0] = 4
	if b.Sync(ids[2]).TeammateProgress[ids[2]].Guesses[0] != 1 {
		t.Fatal("progress retained a caller-owned slice")
	}
	for _, bad := range []struct {
		id string
		d  ws.ProgressData
	}{
		{ids[0], ws.ProgressData{Round: 3, Action: "decrypt", Guesses: []int{1, 2, 3}}},
		{ids[4], ws.ProgressData{Round: 3, Action: "intercept", Guesses: []int{1, 2, 3}}},
		{ids[1], ws.ProgressData{Round: 3, Action: "intercept", Guesses: []int{1, 2, 3}}},
		{ids[2], ws.ProgressData{Round: 2, Action: "intercept", Guesses: []int{1, 2, 3}}},
		{ids[2], ws.ProgressData{Round: 3, Action: "intercept", Guesses: []int{1, 2, 5}}},
	} {
		b.RelayProgress(bad.id, "forged", bad.d)
	}
	if p := b.Sync(ids[2]).TeammateProgress[ids[2]]; p.Player != "same-name" || p.Guesses[0] != 1 {
		t.Fatalf("invalid progress changed a valid choice: %+v", p)
	}
}

func TestClueDraftIsNeverInIndividualProgress(t *testing.T) {
	b, ids := progressBridge(t)
	b.phase = "encrypting"
	b.actions = map[string]*action{"encrypt": {team: "A", deadline: time.Now().Add(time.Minute)}}
	for id, v := range b.views {
		v.Phase = "encrypting"
		b.views[id] = v
	}
	b.RelayProgress(ids[0], "encryptor", ws.ProgressData{Round: 3, Action: "encrypt", State: "editing", Step: 1,
		Clues: []string{"unpublished-secret-clue", "", ""}, Filled: []bool{true, false, false}})
	for _, id := range ids {
		data, err := json.Marshal(b.Sync(id).TeammateProgress)
		if err != nil || strings.Contains(string(data), "unpublished-secret-clue") || strings.Contains(string(data), `"clues"`) {
			t.Fatalf("clue leaked to %s: %s (%v)", id, data, err)
		}
	}
	if b.actions["encrypt"].clues[0] != "unpublished-secret-clue" {
		t.Fatal("the server lost the timeout draft")
	}
}

func TestConcurrentSubmissionsHaveExactlyOneAuthoritativeChoice(t *testing.T) {
	b, ids := progressBridge(t)
	choices := [][3]int{{1, 2, 3}, {3, 2, 4}}
	for i, id := range ids[2:4] {
		b.RelayProgress(id, id, ws.ProgressData{Round: 3, Action: "intercept", State: "submitted", Step: 3, Guesses: choices[i][:]})
		if b.Sync(id).TeammateProgress[id].State == "submitted" {
			t.Fatal("unaccepted client progress masqueraded as the accepted answer")
		}
	}
	start := make(chan struct{})
	results := make(chan int, 2)
	for i, id := range ids[2:4] {
		go func(i int, id string) {
			<-start
			if err := b.SubmitGuess(id, "intercept", ws.SubmitGuessData{Round: 3, Guess: choices[i]}); err == nil {
				results <- i
			} else {
				results <- -1
			}
		}(i, id)
	}
	close(start)
	x, y := <-results, <-results
	if (x >= 0) == (y >= 0) {
		t.Fatalf("expected one winner, got %d, %d", x, y)
	}
	winner := max(x, y)
	if got := <-b.InterceptCh; got != choices[winner] {
		t.Fatalf("accepted %v instead of winner %v", got, choices[winner])
	}
	for _, viewer := range ids {
		count := 0
		for actor, p := range b.Sync(viewer).TeammateProgress {
			if p.State == "submitted" {
				count++
				if actor != ids[winner+2] {
					t.Fatalf("%s sees wrong winner %s", viewer, actor)
				}
			}
		}
		if count != 1 {
			t.Fatalf("%s sees %d submitted choices", viewer, count)
		}
	}
	before := b.Sync(ids[2])
	b.RelayProgress(ids[2], "late", ws.ProgressData{Round: 3, Action: "intercept", Guesses: []int{4, 3, 2}})
	if !reflect.DeepEqual(before.TeammateProgress, b.Sync(ids[2]).TeammateProgress) {
		t.Fatal("late progress changed an accepted action")
	}
}

type progressProvider func(context.Context, []ai.Message) (string, error)

func (p progressProvider) Complete(ctx context.Context, m []ai.Message) (string, error) {
	return p(ctx, m)
}

func advisoryJob(b *Bridge) aiGuessJob {
	a := b.actions["intercept"]
	a.aiPlayerID = "ai-B-1"
	b.views["ai-B-1"] = ws.GameSyncData{Phase: "guess", Round: 3, YourRole: "opponent", YourTeam: "B"}
	return aiGuessJob{action: "intercept", intercept: true, player: "AI partner", playerID: "ai-B-1", suggestion: true,
		round: 3, clues: [3]string{"harbor", "snow", "flight"}, deadline: a.deadline, actionState: a}
}

func TestAISuggestionDoesNotSubmitOrOverwriteHumanDraft(t *testing.T) {
	b, ids := progressBridge(t)
	job := advisoryJob(b)
	calls := 0
	b.AIPlayer = ai.NewAIPlayer(progressProvider(func(context.Context, []ai.Message) (string, error) {
		calls++
		return strconv.Itoa(calls), nil
	}))
	human := [3]int{4, 3, 2}
	b.RelayProgress(ids[2], "human", ws.ProgressData{Round: 3, Action: "intercept", State: "editing", Guesses: human[:]})
	answers := make(chan aiAnswer, 1)
	b.aiGuess(context.Background(), job, answers)
	if calls != 3 || len(answers) != 0 || b.Sync(ids[2]).Submitted {
		t.Fatalf("advisory AI submitted: calls=%d, answers=%d, view=%+v", calls, len(answers), b.Sync(ids[2]))
	}
	if draft, outcome := b.draftGuessOnTimeout("intercept"); draft != human || outcome != "guess" {
		t.Fatalf("AI replaced human timeout draft: %v (%s)", draft, outcome)
	}
	for _, id := range ids {
		p := b.Sync(id).TeammateProgress[job.playerID]
		if p == nil || !p.IsAI || !p.Suggestion || p.CanSubmit || p.PlayerID != job.playerID || p.State != "ready" || p.Step != 3 || p.Focus != 0 {
			t.Fatalf("missing completed suggestion for %s: %+v", id, p)
		}
		canRead := id == ids[0] || id == ids[2] || id == ids[3]
		if canRead != reflect.DeepEqual(p.Guesses, []int{1, 2, 3}) || !canRead && p.Guesses != nil {
			t.Fatalf("suggestion privacy failed for %s: %+v", id, p)
		}
	}
	if len(b.Sync(ids[2]).AIStatus) != 0 || b.Sync(ids[2]).Notice != "" {
		t.Fatal("suggestion changed the team's automatic-answer status or notice")
	}
}

func TestAISuggestionFailureHasNoInventedFallback(t *testing.T) {
	for _, configured := range []bool{false, true} {
		t.Run(strconv.FormatBool(configured), func(t *testing.T) {
			b, ids := progressBridge(t)
			calls := 0
			if configured {
				b.AIPlayer = ai.NewAIPlayer(progressProvider(func(context.Context, []ai.Message) (string, error) {
					calls++
					return "", errors.New("provider unavailable")
				}))
			}
			job := advisoryJob(b)
			b.aiSuggest(context.Background(), job)
			p := b.Sync(ids[2]).TeammateProgress[job.playerID]
			if p == nil || p.State != "unavailable" || p.Focus != 0 || p.Step != 0 || !reflect.DeepEqual(p.Guesses, []int{0, 0, 0}) || calls > 2 {
				t.Fatalf("failure supplied a made-up suggestion: %+v; calls=%d", p, calls)
			}
			if guess, outcome := b.draftGuessOnTimeout("intercept"); guess != [3]int{} || outcome != "none" {
				t.Fatalf("failure changed timeout answer: %v (%s)", guess, outcome)
			}
		})
	}
}

func TestAcceptedAnswerCancelsAndRejectsLateAISuggestion(t *testing.T) {
	b, ids := progressBridge(t)
	job := advisoryJob(b)
	started, canceled, release, done := make(chan struct{}), make(chan struct{}), make(chan struct{}), make(chan struct{})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	job.actionState.cancel = cancel
	b.Timing.Request = time.Minute
	b.AIPlayer = ai.NewAIPlayer(progressProvider(func(ctx context.Context, _ []ai.Message) (string, error) {
		close(started)
		<-ctx.Done()
		close(canceled)
		<-release // A provider may return a late result after cancellation.
		return "1", nil
	}))
	go func() { defer close(done); b.aiSuggest(ctx, job) }()
	<-started
	if err := b.SubmitGuess(ids[2], "intercept", ws.SubmitGuessData{Round: 3, Guess: [3]int{4, 2, 1}}); err != nil {
		t.Fatal(err)
	}
	select {
	case <-canceled:
	case <-time.After(time.Second):
		t.Fatal("human submission did not cancel the provider")
	}
	before := b.Sync(ids[2])
	close(release)
	<-done
	if !reflect.DeepEqual(before.TeammateProgress, b.Sync(ids[2]).TeammateProgress) {
		t.Fatal("late provider result changed the submitted action")
	}
	// An identical action name/round must not admit work from its old instance.
	b.actions["intercept"] = &action{team: "B", deadline: time.Now().Add(time.Minute)}
	if b.broadcastAIProgress(job, "editing", 3, 0, []int{1, 2, 3}) {
		t.Fatal("a stale job wrote into a replacement action")
	}
	b.aiGuessStatus(job, "fallback", 1, 1, "stale notice")
	if b.Sync(ids[2]).Notice != "" {
		t.Fatal("stale AI status changed a new action")
	}
}

func TestMixedTeamStartsAVisibleSuggestionAndStillWaitsForHuman(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "")
	t.Setenv("ANTHROPIC_API_KEY", "")
	r := room.NewRoom(t.Name(), &room.PlayerInfo{ID: "encryptor", Nickname: "encryptor"})
	for _, item := range []struct{ id, team string }{{"decoder", "A"}, {"b1", "B"}, {"b2", "B"}} {
		p := &room.PlayerInfo{ID: item.id, Nickname: item.id}
		if _, err := r.Join(p); err != nil {
			t.Fatal(err)
		}
		if err := r.AddToTeam(p, item.team); err != nil {
			t.Fatal(err)
		}
	}
	if err := r.AddAI("A"); err != nil {
		t.Fatal(err)
	}
	aiID := r.Snapshot().TeamA[2].ID
	b, err := NewBridge(context.Background(), r, ws.NewHub(nil))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { b.Stop(); RemoveBridge(b.Session.SessionID()) })
	b.Timing = patientTimings
	var mu sync.Mutex
	calls := 0
	b.AIPlayer = ai.NewAIPlayer(progressProvider(func(context.Context, []ai.Message) (string, error) {
		mu.Lock()
		defer mu.Unlock()
		calls++
		return strconv.Itoa(calls), nil
	}))
	b.Start()
	if err := b.SubmitClues("encryptor", ws.SubmitCluesData{Round: 1, Clues: [3]string{"harbor", "snow", "flight"}}); err != nil {
		t.Fatal(err)
	}
	until := time.Now().Add(time.Second)
	for time.Now().Before(until) {
		v := b.Sync("decoder")
		if p := v.TeammateProgress[aiID]; p != nil && p.Step == 3 {
			if v.Phase != "guess" || v.Submitted || v.Waiting || !p.Suggestion || p.State == "submitted" || v.EncryptorID != "encryptor" {
				t.Fatalf("mixed team did not wait for human: %+v, %+v", v, p)
			}
			if err := b.SubmitGuess("decoder", "decrypt", ws.SubmitGuessData{Round: 1, Guess: [3]int{4, 2, 1}}); err != nil {
				t.Fatal(err)
			}
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("mixed team's AI never supplied a suggestion")
}

func TestAcceptedIndividualAnswerSurvivesRestart(t *testing.T) {
	b, ids := newTestBridge(t)
	b.Timing = patientTimings
	d := &disk{}
	b.OnSave = d.save
	b.Start()
	play(t, b, ids, plan{}, func(v ws.GameSyncData) bool { return v.Round == 3 && v.Phase == "guess" })
	choice := [3]int{4, 2, 1}
	if err := b.SubmitGuess(ids[2], "intercept", ws.SubmitGuessData{Round: 3, Guess: choice}); err != nil {
		t.Fatal(err)
	}
	var saved []byte
	until := time.Now().Add(time.Second)
	for time.Now().Before(until) && saved == nil {
		for _, raw := range d.saved() {
			var snap Snapshot
			if err := json.Unmarshal(raw, &snap); err != nil {
				t.Fatal(err)
			}
			v := snap.Views[ids[2]]
			if snap.Round == 3 && snap.Phase == "guess" && v.Actions["intercept"].Submitted {
				saved = raw
			}
		}
		time.Sleep(time.Millisecond)
	}
	if saved == nil {
		t.Fatal("accepted answer was not saved")
	}
	b.Stop()
	after, err := restart(t, b.Room, tokensOf(b.Room, ids), saved)
	if err != nil {
		t.Fatal(err)
	}
	after.Start()
	for _, id := range ids {
		v := after.Sync(id)
		p := v.TeammateProgress[ids[2]]
		if p == nil || p.State != "submitted" || !v.Actions["intercept"].Submitted || v.Actions["decrypt"].Submitted {
			t.Fatalf("%s lost the accepted answer after restarting: %+v", id, v)
		}
		canRead := id == ids[1] || id == ids[2] || id == ids[3] // a2 encrypts round 3.
		if canRead != reflect.DeepEqual(p.Guesses, choice[:]) || !canRead && p.Guesses != nil {
			t.Fatalf("restored answer privacy failed for %s: %+v", id, p)
		}
	}
}
