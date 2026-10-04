package core

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"testing"
)

// A script plays whole games through the registered handlers: decoding is right
// and interception wrong unless listed. It stops the game at one point, as a
// restart would, and keeps the snapshot taken there.
type script struct {
	stopRound      uint8
	stopPoint      string
	rightIntercept map[uint8]bool
	wrongDecrypt   map[uint8]bool
	calls          map[string]int
	snap           *SessionSnapshot
	over           bool
	winner         *Team
}

func (sc *script) reached(r *Round, point string) bool {
	sc.calls[fmt.Sprintf("%d:%s", r.roundN, point)]++
	if r.roundN != sc.stopRound || point != sc.stopPoint {
		return false
	}
	snap := r.gameSession.Snapshot()
	sc.snap = &snap
	return true
}

func (sc *script) guess(r *Round, right bool) [3]int {
	guess := r.secret
	if !right {
		guess[0], guess[1] = guess[1], guess[0]
	}
	return guess
}

func (sc *script) register() {
	sc.calls = map[string]int{}
	RegisterInitHandler(func(ctx context.Context, r *Round, ts TeamState) bool { return sc.reached(r, "init") })
	RegisterEncryptHandler(func(ctx context.Context, r *Round, t *Team, p *Player, ts TeamState) ([3]string, bool) {
		clue := fmt.Sprintf("clue-%d", r.roundN)
		return [3]string{clue, clue, clue}, sc.reached(r, "encrypt")
	})
	// The opponents answer first here; the guesses are scored together either way.
	RegisterGuessHandler(func(ctx context.Context, r *Round, ts TeamState) bool {
		if sc.reached(r, "guess") {
			return true
		}
		if r.NeedsIntercept() {
			r.SetInterceptSecret(sc.guess(r, sc.rightIntercept[r.roundN]))
			if sc.reached(r, "intercepted") {
				return true
			}
		}
		if r.NeedsDecrypt() {
			r.SetDecryptedSecret(sc.guess(r, !sc.wrongDecrypt[r.roundN]))
			if sc.reached(r, "decrypted") {
				return true
			}
		}
		return false
	})
	RegisterDoneHandler(func(ctx context.Context, r *Round, ts TeamState) bool { return sc.reached(r, "done") })
	RegisterGameOverHandler(func(ctx context.Context, s *Session, winner *Team) bool {
		sc.over, sc.winner = true, winner
		return true
	})
}

func testSession() *Session {
	team := func(name string) *Team {
		return &Team{
			Players: []*Player{{UID: name + "1", NickName: name + "1"}, {UID: name + "2", NickName: name + "2"}, {UID: name + "3", NickName: name + "3"}},
			Words:   [4]string{name + "-one", name + "-two", name + "-three", name + "-four"},
		}
	}
	return &Session{sessionId: "game", maxRounds: MAX_ROUND, teams: [2]*Team{team("a"), team("b")}}
}

// throughJSON stores and reloads the snapshot the way the server does.
func throughJSON(t *testing.T, snap SessionSnapshot) SessionSnapshot {
	t.Helper()
	data, err := json.Marshal(snap)
	if err != nil {
		t.Fatal(err)
	}
	var loaded SessionSnapshot
	if err := json.Unmarshal(data, &loaded); err != nil {
		t.Fatal(err)
	}
	return loaded
}

func TestRestoreResumesTheInterruptedPhase(t *testing.T) {
	// Round 3 is intercepted, and round 4 decoded wrongly: one point each for
	// team B. A guess given before the restart is kept but not yet scored: the
	// code is revealed only once both guesses are in.
	tests := []struct {
		round uint8
		point string
		// After the restart: how often the interrupted round asks for its clues,
		// enters its guessing, and is given each guess.
		encrypt, guess, intercept, decrypt int
		// Team B's score in the restored session, before it resumes.
		interceptions, errors uint8
	}{
		{3, "init", 1, 1, 1, 1, 0, 0},
		{3, "encrypt", 1, 1, 1, 1, 0, 0},
		{3, "guess", 0, 1, 1, 1, 0, 0},
		{3, "intercepted", 0, 1, 0, 1, 0, 0},
		{3, "decrypted", 0, 0, 0, 0, 0, 0},
		{3, "done", 0, 0, 0, 0, 1, 0},
		{4, "guess", 0, 1, 1, 1, 1, 0},
		{4, "decrypted", 0, 0, 0, 0, 1, 0},
		{4, "done", 0, 0, 0, 0, 1, 1},
		{1, "encrypt", 1, 1, 0, 1, 0, 0},
		{16, "done", 0, 0, 0, 0, 1, 1},
	}
	for _, tt := range tests {
		t.Run(fmt.Sprintf("%d-%s", tt.round, tt.point), func(t *testing.T) {
			first := &script{stopRound: tt.round, stopPoint: tt.point, rightIntercept: map[uint8]bool{3: true}, wrongDecrypt: map[uint8]bool{4: true}}
			first.register()
			testSession().AutoForward(context.Background())
			if first.snap == nil {
				t.Fatal("the game never reached the stop")
			}
			saved := throughJSON(t, *first.snap)

			s, err := Restore(saved)
			if err != nil {
				t.Fatal(err)
			}
			if got := s.Snapshot(); !reflect.DeepEqual(got, saved) {
				t.Fatalf("restored session differs:\n got %+v\nwant %+v", got, saved)
			}
			if b := s.teams[1]; b.InterceptedCounts != tt.interceptions || b.DecryptWrongCounts != tt.errors || s.teams[0].Score() != 0 {
				t.Fatalf("restored score: team B %d interceptions, %d errors", b.InterceptedCounts, b.DecryptWrongCounts)
			}

			second := &script{rightIntercept: first.rightIntercept, wrongDecrypt: first.wrongDecrypt}
			second.register()
			s.Resume(context.Background())

			for step, want := range map[string]int{"encrypt": tt.encrypt, "guess": tt.guess, "intercepted": tt.intercept, "decrypted": tt.decrypt} {
				if got := second.calls[fmt.Sprintf("%d:%s", tt.round, step)]; got != want {
					t.Errorf("round %d %s asked %d times after the restart, want %d", tt.round, step, got, want)
				}
			}
			for key, n := range second.calls {
				var round uint8
				var point string
				fmt.Sscanf(key, "%d:%s", &round, &point)
				if round < tt.round || n != 1 {
					t.Errorf("%s ran %d times after the restart", key, n)
				}
			}
			final := s.Snapshot()
			if len(final.Rounds) != MAX_ROUND || !second.over || second.winner != nil {
				t.Fatalf("game ended after %d rounds, over=%v winner=%v", len(final.Rounds), second.over, second.winner)
			}
			// What was settled before the restart stays as it was.
			for i, want := range saved.Rounds[:len(saved.Rounds)-1] {
				if !reflect.DeepEqual(final.Rounds[i], want) {
					t.Errorf("round %d changed: %+v, was %+v", i+1, final.Rounds[i], want)
				}
			}
			if got, want := final.Rounds[tt.round-1], saved.Rounds[tt.round-1]; got.Secret != want.Secret || got.Encryptor != want.Encryptor {
				t.Errorf("the interrupted round drew a new code or encryptor: %+v, was %+v", got, want)
			}
			if r := final.Rounds[2]; !r.Intercepted || r.Intercept != r.Secret || !r.Decrypted || r.Decrypt != r.Secret {
				t.Errorf("the intercepted round was not decoded as well: %+v", r)
			}
			if b := s.teams[1]; b.InterceptedCounts != 1 || b.DecryptWrongCounts != 1 || s.teams[0].Score() != 0 {
				t.Errorf("final score: team B %d interceptions, %d errors", b.InterceptedCounts, b.DecryptWrongCounts)
			}
			// Encryptors keep rotating from where each team was.
			for i, r := range final.Rounds {
				if want := uint8(i/2) % 3; r.Encryptor != want {
					t.Errorf("round %d encryptor %d, want %d", i+1, r.Encryptor, want)
				}
			}
		})
	}
}

func TestResumeStartsAFreshSession(t *testing.T) {
	sc := &script{}
	sc.register()
	s, err := Restore(throughJSON(t, testSession().Snapshot()))
	if err != nil {
		t.Fatal(err)
	}
	s.Resume(context.Background())
	if len(s.rounds) != MAX_ROUND || !sc.over {
		t.Fatalf("played %d rounds, over=%v", len(s.rounds), sc.over)
	}
}

func TestRestoreKeepsAFinishedGameFinished(t *testing.T) {
	// Team B intercepts rounds 3 and 5 and wins in round 5.
	first := &script{rightIntercept: map[uint8]bool{3: true, 5: true}}
	first.register()
	played := testSession()
	played.AutoForward(context.Background())
	if !first.over || first.winner != played.teams[1] || len(played.rounds) != 5 {
		t.Fatalf("over=%v after %d rounds", first.over, len(played.rounds))
	}
	s, err := Restore(throughJSON(t, played.Snapshot()))
	if err != nil {
		t.Fatal(err)
	}
	if over, winner := s.IsGameOver(); !over || winner != s.teams[1] {
		t.Fatal("the restored game is not won by team B")
	}
}

func TestRestoreRefusesImpossibleSnapshots(t *testing.T) {
	sc := &script{stopRound: 4, stopPoint: "decrypted"}
	sc.register()
	testSession().AutoForward(context.Background())
	valid := throughJSON(t, *sc.snap)
	if _, err := Restore(valid); err != nil {
		t.Fatal(err)
	}
	tests := map[string]func(*SessionSnapshot){
		"no id":                   func(s *SessionSnapshot) { s.ID = "" },
		"no round limit":          func(s *SessionSnapshot) { s.MaxRounds = 0 },
		"more rounds than limit":  func(s *SessionSnapshot) { s.MaxRounds = 3 },
		"team of one":             func(s *SessionSnapshot) { s.Teams[1].Players = s.Teams[1].Players[:1] },
		"missing word":            func(s *SessionSnapshot) { s.Teams[0].Words[2] = "" },
		"round number":            func(s *SessionSnapshot) { s.Rounds[1].Number = 5 },
		"unknown phase":           func(s *SessionSnapshot) { s.Rounds[3].Phase = DONE + 1 },
		"unfinished early round":  func(s *SessionSnapshot) { s.Rounds[0].Phase = ENCRYPTING },
		"encryptor out of team":   func(s *SessionSnapshot) { s.Rounds[2].Encryptor = 3 },
		"code out of range":       func(s *SessionSnapshot) { s.Rounds[3].Secret = [3]int{1, 2, 5} },
		"code repeats":            func(s *SessionSnapshot) { s.Rounds[3].Secret = [3]int{1, 2, 2} },
		"no code":                 func(s *SessionSnapshot) { s.Rounds[3].Secret = [3]int{} },
		"first round intercepted": func(s *SessionSnapshot) { s.Rounds[0].Intercepted = true },
		"finished without the interception": func(s *SessionSnapshot) {
			s.Rounds[3].Phase, s.Rounds[3].Intercepted = DONE, false
		},
		"finished without decoding": func(s *SessionSnapshot) { s.Rounds[3].Phase, s.Rounds[3].Decrypted = DONE, false },
		"decoded while encrypting": func(s *SessionSnapshot) {
			s.Rounds[3].Phase, s.Rounds[3].Intercepted, s.Rounds[3].Decrypted = ENCRYPTING, false, true
		},
		"intercepted while encrypting": func(s *SessionSnapshot) {
			s.Rounds[3].Phase, s.Rounds[3].Intercepted, s.Rounds[3].Decrypted = ENCRYPTING, true, false
		},
	}
	for name, breakIt := range tests {
		t.Run(name, func(t *testing.T) {
			snap := throughJSON(t, valid)
			breakIt(&snap)
			if s, err := Restore(snap); err == nil {
				t.Fatalf("accepted: %+v", s.Snapshot())
			}
		})
	}
}

func TestOneRoundScoresBothGuesses(t *testing.T) {
	// In round 3 team B intercepts and team A decodes wrongly: both count.
	sc := &script{stopRound: 3, stopPoint: "done", rightIntercept: map[uint8]bool{3: true}, wrongDecrypt: map[uint8]bool{3: true}}
	sc.register()
	s := testSession()
	s.AutoForward(context.Background())
	if sc.snap == nil {
		t.Fatal("the game never reached round 3")
	}
	if a, b := s.teams[0], s.teams[1]; b.InterceptedCounts != 1 || a.DecryptWrongCounts != 1 || a.InterceptedCounts != 0 || b.DecryptWrongCounts != 0 {
		t.Fatalf("team A %+v, team B %+v", *a, *b)
	}
}

func TestGuessesWaitForTheReveal(t *testing.T) {
	// Team B's right interception is given, team A's decoding is not yet.
	sc := &script{stopRound: 3, stopPoint: "intercepted", rightIntercept: map[uint8]bool{3: true}}
	sc.register()
	s := testSession()
	s.AutoForward(context.Background())
	if r := s.currentRound; r.state != GUESSING || !r.intercepted || r.decrypted || !r.NeedsDecrypt() || r.NeedsIntercept() {
		t.Fatalf("round 3 stopped as %+v", *r)
	}
	if b := s.teams[1]; b.InterceptedCounts != 0 {
		t.Fatal("an interception was scored before the code was revealed")
	}
}
