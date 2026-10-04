package ai

import (
	"context"
	"strings"
	"testing"
)

type answer string

func (a answer) Complete(context.Context, []Message) (string, error) { return string(a), nil }

// capture remembers the messages of the last request.
type capture struct {
	last []Message
	answer
}

func (c *capture) Complete(ctx context.Context, m []Message) (string, error) {
	c.last = m
	return c.answer.Complete(ctx, m)
}

// Clues asked back to back must not all lean on the same trick: the player
// rotates through the strategy list, one drawn strategy per request.
func TestClueRequestsRotateStrategies(t *testing.T) {
	c := &capture{answer: "线索"}
	p := NewAIPlayer(c)
	var seen []string
	for range 3 {
		if _, err := p.GenerateSingleClue(context.Background(), [3]int{1, 2, 3}, 0, [4]string{"a", "b", "c", "d"}, "", nil); err != nil {
			t.Fatal(err)
		}
		user := c.last[len(c.last)-1].Content
		_, tail, ok := strings.Cut(user, "本次优先采用的策略——")
		if !ok {
			t.Fatalf("clue prompt carries no strategy:\n%s", user)
		}
		strategy, _, _ := strings.Cut(tail, "\n")
		seen = append(seen, strategy)
	}
	if seen[0] == seen[1] || seen[1] == seen[2] {
		t.Fatalf("strategies repeated back to back: %q", seen)
	}
}

func TestRejectsEmptyCluesAndInvalidGuesses(t *testing.T) {
	for _, text := range []string{"", "   ", `""`, `"   "`} {
		p := NewAIPlayer(answer(text))
		if _, err := p.GenerateSingleClue(context.Background(), [3]int{1, 2, 3}, 0, [4]string{"a", "b", "c", "d"}, "", nil); err == nil {
			t.Fatalf("empty clue accepted %q", text)
		}
	}
	clues := [3]string{"clue", "other", "third"}
	for _, text := range []string{"", "0", "5", "one", "1", "1 or 2"} {
		p := NewAIPlayer(answer(text))
		if _, err := p.GuessSingleNumber(context.Background(), clues, 0, [4]string{}, true, "", []int{1}); err == nil {
			t.Fatalf("invalid/duplicate answer accepted %q", text)
		}
	}
	p := NewAIPlayer(answer(" 3 "))
	if n, err := p.GuessSingleNumber(context.Background(), clues, 0, [4]string{}, true, "", []int{1, 2}); err != nil || n != 3 {
		t.Fatalf("valid answer rejected %d %v", n, err)
	}
}
