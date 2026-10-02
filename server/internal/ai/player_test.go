package ai

import (
	"context"
	"testing"
)

type answer string

func (a answer) Complete(context.Context, []Message) (string, error) { return string(a), nil }

func TestRejectsEmptyCluesAndInvalidGuesses(t *testing.T) {
	for _, text := range []string{"", "   ", `""`, `"   "`} {
		p := NewAIPlayer(answer(text))
		if _, err := p.GenerateSingleClue(context.Background(), 1, [4]string{"a", "b", "c", "d"}, "", nil); err == nil {
			t.Fatalf("empty clue accepted %q", text)
		}
	}
	for _, text := range []string{"", "0", "5", "one", "1", "1 or 2"} {
		p := NewAIPlayer(answer(text))
		if _, err := p.GuessSingleNumber(context.Background(), "clue", [4]string{}, true, "", []int{1}); err == nil {
			t.Fatalf("invalid/duplicate answer accepted %q", text)
		}
	}
	p := NewAIPlayer(answer(" 3 "))
	if n, err := p.GuessSingleNumber(context.Background(), "clue", [4]string{}, true, "", []int{1, 2}); err != nil || n != 3 {
		t.Fatalf("valid answer rejected %d %v", n, err)
	}
}
