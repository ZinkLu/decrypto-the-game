package word_providers

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/ZinkLu/decrypto-the-game/server/internal/ai"
)

// scripted answers what a model would answer, and keeps every prompt it was
// asked with.
type scripted struct {
	answers []string
	err     error
	wait    time.Duration
	prompts []string
}

func (s *scripted) Complete(ctx context.Context, messages []ai.Message) (string, error) {
	s.prompts = append(s.prompts, messages[len(messages)-1].Content)
	if s.wait > 0 {
		select {
		case <-time.After(s.wait):
		case <-ctx.Done():
			return "", ctx.Err()
		}
	}
	if s.err != nil {
		return "", s.err
	}
	if len(s.answers) == 0 {
		return "", fmt.Errorf("no answer left")
	}
	answer := s.answers[0]
	s.answers = s.answers[1:]
	return answer, nil
}

// The four words the model wrote are dealt as they stand, whatever numbering,
// quoting or commentary it put around them.
func TestWordsAreReadOutOfAnAnswer(t *testing.T) {
	model := &scripted{answers: []string{strings.Join([]string{
		"当然可以！这一局的四个密语词是：",
		"1. 灯塔[lighthouse]",
		`2、"缆绳"[mooring rope]：海岸上用来系船的`,
		"3) 渔网[fishing net] —— 渔民的工具",
		"4. 甲板[deck]",
	}, "\n")}}
	p := NewLLMProvider(model, stubProvider{words: [4]string{"备用[b]", "备用[c]", "备用[d]", "备用[e]"}})
	words, err := p.Provide(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	want := [4]string{"灯塔[lighthouse]", "缆绳[mooring rope]", "渔网[fishing net]", "甲板[deck]"}
	if words != want {
		t.Fatalf("dealt %v, want %v", words, want)
	}
	if len(model.prompts) != 1 {
		t.Fatalf("asked %d times for one hand", len(model.prompts))
	}
}

// A hand is dealt in the shape the built-in list is written in, so a word
// without its English half is not dealt at all.
func TestWordsWithoutEnglishAreRefused(t *testing.T) {
	for _, answer := range []string{
		"灯塔\n缆绳[rope]\n渔网[net]\n甲板[deck]",
		"灯塔[lighthouse]\n缆绳[]\n渔网[net]\n甲板[deck]",
		"[lighthouse]\n缆绳[rope]\n渔网[net]\n甲板[deck]",
		"灯塔[lighthouse]\n缆绳[rope]\n渔网[net]\n甲板[deck]\n罗盘[compass]",
		"灯塔[lighthouse]\n缆绳[rope]\n灯塔[lighthouse]\n甲板[deck]",
		"灯塔[lighthouse]\n缆绳[rope]\n渔网[net]",
	} {
		model := &scripted{answers: []string{answer}}
		p := NewLLMProvider(model, stubProvider{words: [4]string{"备用[b]", "备用[c]", "备用[d]", "备用[e]"}})
		words, err := p.Provide(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		if words[0] != "备用[b]" {
			t.Fatalf("answer %q was dealt as %v instead of the local list", answer, words)
		}
	}
}

// A model that fails or takes too long leaves the hand to the local list: a
// game is dealt either way.
func TestAModelThatCannotAnswerLeavesTheHandToTheList(t *testing.T) {
	fallback := [4]string{"备用[b]", "备用[c]", "备用[d]", "备用[e]"}
	for name, model := range map[string]*scripted{
		"error":     {err: fmt.Errorf("the model is down")},
		"exhausted": {answers: nil},
		"too slow":  {answers: []string{"灯塔[lighthouse]\n缆绳[rope]\n渔网[net]\n甲板[deck]"}, wait: time.Hour},
	} {
		p := NewLLMProvider(model, stubProvider{words: fallback})
		if name == "too slow" {
			p.Timeout = 10 * time.Millisecond
		}
		words, err := p.Provide(context.Background())
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if words != fallback {
			t.Fatalf("%s: dealt %v, want the local list", name, words)
		}
	}
}

// The two teams of one game must not be handed the same four words, so each
// hand is written from the next field rather than from one fixed field.
func TestEachHandIsWrittenFromItsOwnField(t *testing.T) {
	model := &scripted{answers: []string{
		"灯塔[lighthouse]\n缆绳[rope]\n渔网[net]\n甲板[deck]",
		"海鸥[seagull]\n贝壳[shell]\n灯塔船[lightship]\n渔港[harbour]",
	}}
	p := NewLLMProvider(model, stubProvider{})
	if _, err := p.Provide(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := p.Provide(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(model.prompts) != 2 {
		t.Fatalf("asked %d times for two hands", len(model.prompts))
	}
	first, second := model.prompts[0], model.prompts[1]
	if first == second {
		t.Fatal("both teams were written from the same field")
	}
	for _, prompt := range model.prompts {
		for _, want := range []string{"长城[great wall]", "只有中文的词不算数"} {
			if !strings.Contains(prompt, want) {
				t.Fatalf("the words prompt is missing %q:\n%s", want, prompt)
			}
		}
	}
	if fields := strings.Count(first, "这一局的领域是："); fields != 1 {
		t.Fatalf("the words prompt names the field %d times:\n%s", fields, first)
	}
}

// Without a model there is nothing to ask, and the list deals the hand.
func TestNoModelFallsBackToTheList(t *testing.T) {
	fallback := [4]string{"备用[b]", "备用[c]", "备用[d]", "备用[e]"}
	p := NewLLMProvider(nil, stubProvider{words: fallback})
	words, err := p.Provide(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if words != fallback {
		t.Fatalf("dealt %v, want the local list", words)
	}
}

func TestWordsProviderIsChosenByEnv(t *testing.T) {
	t.Setenv("DECRYPTO_WORDS_PATH", "")
	t.Setenv("OPENAI_API_KEY", "")
	t.Setenv("ANTHROPIC_API_KEY", "")
	for _, tc := range []struct {
		env    string
		llm    bool
		refuse bool
	}{
		{env: ""},
		{env: " local "},
		{env: "LLM"}, // no model is configured, so the list still deals
		{env: "dictionary", refuse: true},
	} {
		t.Setenv("DECRYPTO_WORDS_PROVIDER", tc.env)
		p, err := GetDefaultProvider()
		if tc.refuse {
			if err == nil {
				t.Fatalf("DECRYPTO_WORDS_PROVIDER=%q was accepted", tc.env)
			}
			continue
		}
		if err != nil {
			t.Fatalf("DECRYPTO_WORDS_PROVIDER=%q: %v", tc.env, err)
		}
		if _, ok := p.(*LLMProvider); ok != tc.llm {
			t.Fatalf("DECRYPTO_WORDS_PROVIDER=%q dealt by %T", tc.env, p)
		}
	}

	t.Setenv("DECRYPTO_WORDS_PROVIDER", "llm")
	t.Setenv("ANTHROPIC_API_KEY", "sk-ant-test")
	p, err := GetDefaultProvider()
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := p.(*LLMProvider); !ok {
		t.Fatalf("a configured model dealt by %T", p)
	}
}

type stubProvider struct{ words [4]string }

func (s stubProvider) Provide(context.Context) ([4]string, error) { return s.words, nil }
