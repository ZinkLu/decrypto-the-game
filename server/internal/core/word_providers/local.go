package word_providers

import (
	"context"
	"crypto/rand"
	"embed"
	"fmt"
	"math/big"
	"os"
	"strings"
)

// The word list is compiled into the binary, so a server given nothing but its
// executable still deals a game. DECRYPTO_WORDS_PATH points it at a list of its
// own instead.
//
//go:embed words.txt
var list embed.FS

// minWords is the smallest list a game can be dealt from: four different words.
const minWords = handSize

// LocalProvider deals from a fixed list of words.
type LocalProvider struct {
	wordList []string
	// where the list came from, for the log and for errors
	source string
}

// NewLocalProvider reads the word list from DECRYPTO_WORDS_PATH, or from the
// list built into the binary when the variable names no file.
func NewLocalProvider() (*LocalProvider, error) {
	if path := strings.TrimSpace(os.Getenv("DECRYPTO_WORDS_PATH")); path != "" {
		content, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("cannot read the word list %s: %w", path, err)
		}
		return newLocalProvider(string(content), path)
	}
	content, err := list.ReadFile("words.txt")
	if err != nil {
		return nil, fmt.Errorf("cannot read the built-in word list: %w", err)
	}
	return newLocalProvider(string(content), "the built-in list")
}

// newLocalProvider takes one word per line, written 词[word]; a line that is
// only the word is fine too. Blank lines are skipped, so a file that ends with
// a newline deals the same words as one that does not.
func newLocalProvider(content, source string) (*LocalProvider, error) {
	var words []string
	for _, line := range strings.Split(content, "\n") {
		if word := strings.TrimSpace(line); word != "" {
			words = append(words, word)
		}
	}
	if len(words) < minWords {
		return nil, fmt.Errorf("the word list %s holds %d words, fewer than the %d a game needs", source, len(words), minWords)
	}
	return &LocalProvider{wordList: words, source: source}, nil
}

// Provide draws four different words. A word can come up in a later hand, but
// never twice in the same one: the two teams each need four, and a repeated
// word would sit on both their cards.
func (p *LocalProvider) Provide(context.Context) ([4]string, error) {
	// The list is dealt like a deck: four cards are drawn at random and never
	// put back, so a repeat is impossible rather than unlikely.
	pool := make([]string, len(p.wordList))
	copy(pool, p.wordList)
	var words [handSize]string
	for i := range words {
		j := i + p.pick(len(pool)-i)
		pool[i], pool[j] = pool[j], pool[i]
		words[i] = pool[i]
	}
	return words, nil
}

// pick draws a number below n. A system with no randomness cannot deal a fair
// game, so it stops the process rather than dealing the same hand twice.
func (p *LocalProvider) pick(n int) int {
	if n <= 1 {
		return 0
	}
	v, err := rand.Int(rand.Reader, big.NewInt(int64(n)))
	if err != nil {
		panic(fmt.Sprintf("word_providers: no randomness: %v", err))
	}
	return int(v.Int64())
}
