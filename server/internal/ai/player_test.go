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
// rotates through the strategy list, one drawn strategy per position.
func TestClueRequestsRotateStrategies(t *testing.T) {
	c := &capture{answer: "线索：甲\n线索：乙\n线索：丙"}
	p := NewAIPlayer(c)
	var seen []string
	for range 2 {
		if _, err := p.GenerateClues(context.Background(), [3]int{1, 2, 3}, [4]string{"a", "b", "c", "d"}, ""); err != nil {
			t.Fatal(err)
		}
		user := c.last[len(c.last)-1].Content
		_, tail, ok := strings.Cut(user, "本次为三位各优先采用的策略：\n")
		if !ok {
			t.Fatalf("clue prompt carries no strategies:\n%s", user)
		}
		lines, _, _ := strings.Cut(tail, "\n先按各位的策略")
		seen = append(seen, lines)
	}
	if seen[0] == seen[1] {
		t.Fatalf("strategies repeated back to back: %q", seen)
	}
	for i, pos := range []string{"第 1 位：", "第 2 位：", "第 3 位："} {
		if !strings.Contains(seen[0], pos) || strings.Count(seen[0], pos) != 1 {
			t.Fatalf("position %d of the strategies missing or repeated: %q", i+1, seen[0])
		}
	}
}

func TestRejectsEmptyCluesAndInvalidGuesses(t *testing.T) {
	for _, text := range []string{"", "   ", `""`, `"   "`, "线索：灯塔"} {
		p := NewAIPlayer(answer(text))
		if _, err := p.GenerateClues(context.Background(), [3]int{1, 2, 3}, [4]string{"a", "b", "c", "d"}, ""); err == nil {
			t.Fatalf("empty clues accepted %q", text)
		}
	}
	clues := [3]string{"clue", "other", "third"}
	for _, text := range []string{"", "0", "5", "one", "答案：1\n答案：2", "答案：1\n答案：1\n答案：2"} {
		p := NewAIPlayer(answer(text))
		if _, err := p.GuessCode(context.Background(), clues, [4]string{}, true, ""); err == nil {
			t.Fatalf("invalid/duplicate answer accepted %q", text)
		}
	}
	p := NewAIPlayer(answer("答案：3\n答案：1\n答案：2"))
	if g, err := p.GuessCode(context.Background(), clues, [4]string{}, true, ""); err != nil || g != [3]int{3, 1, 2} {
		t.Fatalf("valid answer rejected %v %v", g, err)
	}
}
