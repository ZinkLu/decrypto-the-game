package prompts

import (
	"strconv"
	"strings"
	"testing"
)

var words = []string{"长城", "风筝", "火锅", "玻璃"}

func renderAll(t *testing.T) map[string]string {
	t.Helper()
	rendered := map[string]string{"system": System()}
	for name, in := range map[string]any{
		"clue":            ClueInput{Words: words, Digit: 3, Word: words[2], History: "第 1 轮：密码 1 3 2"},
		"guess_intercept": GuessInput{Clue: "风筝", Intercept: true, History: "第 1 轮：密码 1 3 2"},
		"guess_decrypt":   GuessInput{Clue: "风筝", Words: words, History: "第 1 轮：密码 1 3 2"},
	} {
		out, err := render(name+".md", in)
		if err != nil {
			t.Fatalf("render %s: %v", name, err)
		}
		rendered[name] = out
	}
	return rendered
}

// Every prompt has to render. A file renamed or a placeholder no field fills
// breaks here rather than in the middle of a round.
func TestEveryPromptRenders(t *testing.T) {
	for name, out := range renderAll(t) {
		if strings.TrimSpace(out) == "" {
			t.Fatalf("%s rendered empty", name)
		}
		if strings.Contains(out, "{{") {
			t.Fatalf("%s left a placeholder behind: %q", name, out)
		}
	}
}

func TestSystemIsShared(t *testing.T) {
	if System() != renderAll(t)["system"] {
		t.Fatal("System is not the system.md text")
	}
	if !strings.Contains(System(), "Encrypto") {
		t.Fatal("system prompt no longer names the game")
	}
}

func TestClueCarriesTheWordAndTheDigit(t *testing.T) {
	out, err := Clue(ClueInput{Words: words, Digit: 2, Word: words[1], Previous: []string{"长城"}, History: "第 1 轮：密码 1 3 2"})
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"1: 长城", "2: 风筝", "3: 火锅", "4: 玻璃", "#2", "（风筝）", "长城", "第 1 轮：密码 1 3 2"} {
		if !strings.Contains(out, want) {
			t.Fatalf("clue prompt is missing %q:\n%s", want, out)
		}
	}
}

// The earlier clues are only worth telling the model about once there are any.
// An empty list must leave the sentence out, not print it with nothing after it.
func TestEarlierCluesOnlyWhenThereAreAny(t *testing.T) {
	first, err := Clue(ClueInput{Words: words, Digit: 1, Word: words[0]})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(first, "你本轮已经给出的线索") {
		t.Fatalf("clue prompt mentions earlier clues in the first step:\n%s", first)
	}
	later, err := Clue(ClueInput{Words: words, Digit: 1, Word: words[0], Previous: []string{"烽火", "炊烟"}})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(later, "你本轮已经给出的线索：烽火, 炊烟") {
		t.Fatalf("clue prompt does not list the earlier clues:\n%s", later)
	}
}

func TestEarlierDigitsAreNotRepeated(t *testing.T) {
	for _, intercept := range []bool{true, false} {
		first, err := Guess(GuessInput{Clue: "风筝", Words: words, Intercept: intercept})
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(first, "你本轮已经猜测的编号") {
			t.Fatalf("guess prompt (intercept=%v) mentions earlier digits in the first step:\n%s", intercept, first)
		}
		later, err := Guess(GuessInput{Clue: "风筝", Words: words, Intercept: intercept, Previous: []int{2, 4}})
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(later, "你本轮已经猜测的编号：2, 4") {
			t.Fatalf("guess prompt (intercept=%v) does not list the earlier digits:\n%s", intercept, later)
		}
	}
}

// The interceptor plays without knowing the other team's words. The prompt is
// the only place that can leak them, so it has to leave them out whatever the
// caller passes. A clue may of course be any word, so the guard looks for the
// numbered list rather than the words themselves.
func TestInterceptorNeverSeesWords(t *testing.T) {
	lines := make([]string, len(words))
	for i, word := range words {
		lines[i] = strconv.Itoa(i+1) + ": " + word
	}

	intercept, err := Guess(GuessInput{Clue: "风筝", Words: words, Intercept: true, Previous: []int{1}, History: "第 1 轮：密码 1 3 2"})
	if err != nil {
		t.Fatal(err)
	}
	decrypt, err := Guess(GuessInput{Clue: "风筝", Words: words, History: "第 1 轮：密码 1 3 2"})
	if err != nil {
		t.Fatal(err)
	}
	for _, line := range lines {
		if strings.Contains(intercept, line) {
			t.Fatalf("intercept prompt leaks %q:\n%s", line, intercept)
		}
		if !strings.Contains(decrypt, line) {
			t.Fatalf("decrypt prompt is missing %q:\n%s", line, decrypt)
		}
	}
}
