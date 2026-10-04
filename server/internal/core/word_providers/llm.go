package word_providers

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync/atomic"
	"time"
	"unicode/utf8"

	"github.com/ZinkLu/decrypto-the-game/server/internal/ai"
	"github.com/ZinkLu/decrypto-the-game/server/internal/ai/prompts"
)

// llmTimeout bounds one request for four words. It is long enough for a
// reasoning model to think and write, short enough that a game is never held
// up by one; a model that sends nothing at all is given up on sooner by the
// provider's own idle timeout.
const llmTimeout = 40 * time.Second

// handSize is how many words a team is dealt.
const handSize = 4

// LLMProvider asks a model to write each team's four words, so a game can be
// dealt a hand the local list never held. A model that fails, answers too
// slowly, or answers something that is not four different words leaves the
// hand to the local list: a game is always dealt.
type LLMProvider struct {
	Model ai.LLMProvider
	// Timeout bounds one request; it is only changed by tests.
	Timeout time.Duration
	// Local deals the hand when the model cannot.
	Local Provider
	// themes counts the hands asked for, so two teams in one game are given
	// two different fields to write from.
	themes atomic.Uint64
}

// NewLLMProvider writes words with the given model, falling back to local.
func NewLLMProvider(model ai.LLMProvider, local Provider) *LLMProvider {
	return &LLMProvider{Model: model, Timeout: llmTimeout, Local: local}
}

func (p *LLMProvider) Provide(ctx context.Context) ([4]string, error) {
	words, err := p.ask(ctx)
	if err == nil {
		log.Printf("[WORDS] the model dealt %v", words)
		return words, nil
	}
	log.Printf("[WORDS] the model could not deal a hand (%v); the local list deals this one", err)
	if p.Local == nil {
		return [4]string{}, err
	}
	return p.Local.Provide(ctx)
}

func (p *LLMProvider) ask(ctx context.Context) ([4]string, error) {
	if p.Model == nil {
		return [4]string{}, fmt.Errorf("no model is configured")
	}
	if p.Timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, p.Timeout)
		defer cancel()
	}
	themes := prompts.WordThemes()
	theme := themes[p.themes.Add(1)%uint64(len(themes))]
	prompt, err := prompts.Words(prompts.WordInput{Theme: theme})
	if err != nil {
		return [4]string{}, err
	}
	answer, err := p.Model.Complete(ctx, []ai.Message{{Role: "user", Content: prompt}})
	if err != nil {
		return [4]string{}, err
	}
	return parseWords(answer)
}

// parseWords reads the four words out of an answer. A model writes them one per
// line, but it also numbers them, wraps them in quotes, says "of course" first
// and explains each word afterwards; all of that is dropped, and a line that
// leaves no bilingual word behind is not a word at all. What is left has to be
// four different ones, the shape the built-in list is written in, or the hand is
// refused rather than dealt.
func parseWords(answer string) ([4]string, error) {
	var hand [handSize]string
	found := make([]string, 0, handSize)
	seen := make(map[string]bool, handSize)
	for _, line := range strings.Split(answer, "\n") {
		word := cleanWord(line)
		if word == "" {
			continue
		}
		if len(found) == handSize {
			return [4]string{}, fmt.Errorf("the model wrote more than %d words: %q", handSize, answer)
		}
		if seen[word] {
			return [4]string{}, fmt.Errorf("the model wrote %q twice: %q", word, answer)
		}
		seen[word] = true
		found = append(found, word)
	}
	if len(found) < handSize {
		return [4]string{}, fmt.Errorf("the model wrote %d bilingual words, not %d: %q", len(found), handSize, answer)
	}
	copy(hand[:], found)
	return hand, nil
}

// bilingual reports whether a word carries both halves, written 词[word]. A hand
// is dealt in the shape the built-in list is written in, so a player reads the
// same kind of word whichever provider dealt it.
func bilingual(word string) bool {
	i := strings.IndexByte(word, '[')
	return i > 0 && strings.HasSuffix(word, "]") && strings.TrimSpace(word[i+1:len(word)-1]) != ""
}

// cleanWord is one line of an answer reduced to the word itself: no list marker,
// no quote, no bracket wrapped around the whole word, and nothing from the
// punctuation or the space a model starts explaining itself with. A space inside
// the English half of 词[word] is part of the word and stays. A line that leaves
// no bilingual word behind — a greeting, a heading, a word without its English
// half — is not a word, and comes back empty.
// quotes are what a model wraps a word in; a word never carries one itself.
var quotes = strings.NewReplacer(`"`, "", "'", "", "“", "", "”", "", "‘", "", "’", "")

func cleanWord(line string) string {
	word := strings.TrimSpace(line)
	if i := strings.IndexAny(word, "：:，,。;；"); i >= 0 {
		word = word[:i]
	}
	for _, marker := range []string{"-", "*", "•", "·", ">"} {
		word = strings.TrimSpace(strings.TrimPrefix(word, marker))
	}
	word = strings.TrimSpace(quotes.Replace(numberMarker(word)))
	if i := spaceOutsideBrackets(word); i >= 0 {
		word = word[:i]
	}
	word = unwrap(strings.TrimSpace(word))
	if !bilingual(word) || utf8.RuneCountInString(word) > maxWordRunes {
		return ""
	}
	return word
}

// maxWordRunes is longer than any word in the built-in list, so a word is only
// refused when the answer carried something else along with it.
const maxWordRunes = 24

// unwrap drops a bracket wrapped around the whole word, which is not the
// 词[english] form and only gets in the way of reading the word.
func unwrap(word string) string {
	for _, pair := range [][2]string{{"[", "]"}, {"【", "】"}, {"（", "）"}, {"(", ")"}, {"「", "」"}, {"『", "』"}} {
		if len(word) > len(pair[0])+len(pair[1]) && strings.HasPrefix(word, pair[0]) && strings.HasSuffix(word, pair[1]) {
			return strings.TrimSpace(unwrap(word[len(pair[0]) : len(word)-len(pair[1])]))
		}
	}
	return word
}

// numberMarker drops a leading "1." or "2、" or "3)" from a word.
func numberMarker(word string) string {
	digits := 0
	for digits < len(word) && word[digits] >= '0' && word[digits] <= '9' {
		digits++
	}
	if digits == 0 {
		return word
	}
	rest := strings.TrimSpace(word[digits:])
	if rest == "" {
		return rest
	}
	switch r, _ := utf8.DecodeRuneInString(rest); r {
	case '.', '、', ')', '）', ':', '：':
		return strings.TrimSpace(rest[len(string(r)):])
	}
	return word
}

// spaceOutsideBrackets is the first space that is not inside the English half
// of a word, or -1 when the word holds none.
func spaceOutsideBrackets(word string) int {
	depth := 0
	for i, r := range word {
		switch r {
		case '[', '（', '(', '【', '「', '『':
			depth++
		case ']', '）', ')', '】', '」', '』':
			if depth > 0 {
				depth--
			}
		case ' ', '\t':
			if depth == 0 {
				return i
			}
		}
	}
	return -1
}
