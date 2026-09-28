package core

import "testing"

func TestGameOverTiebreaksOnScore(t *testing.T) {
	a, b := &Team{}, &Team{}
	s := &Session{teams: [2]*Team{a, b}}
	if over, _ := s.IsGameOver(); over {
		t.Fatal("fresh game over")
	}
	b.DecryptWrongCounts = 2
	if over, w := s.IsGameOver(); !over || w != a {
		t.Fatal("two errors did not lose")
	}
	// Both teams qualify in the same round: the score (interceptions minus errors) decides.
	b.DecryptWrongCounts, b.InterceptedCounts = 0, 2
	a.DecryptWrongCounts, a.InterceptedCounts = 2, 1
	if over, w := s.IsGameOver(); !over || w != b {
		t.Fatal("score tiebreak ignored")
	}
	a.InterceptedCounts, a.DecryptWrongCounts, b.DecryptWrongCounts = 2, 0, 0
	if over, w := s.IsGameOver(); !over || w != nil {
		t.Fatal("level scores should draw")
	}
}
