// Package word_providers deals the four words each team plays with. A hand
// comes either from a list compiled into the binary, or from a model asked to
// write one; DECRYPTO_WORDS_PROVIDER chooses.
package word_providers

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/ZinkLu/decrypto-the-game/server/internal/ai/providers"
)

// Provider deals one hand: four different words, numbered 1-4 in play.
type Provider interface {
	Provide(ctx context.Context) ([4]string, error)
}

// GetDefaultProvider is where a new game takes its words from.
// DECRYPTO_WORDS_PROVIDER names the source: "local" for the built-in list, or
// "llm" to have a model write each hand. A name that is neither is a mistake
// worth refusing to start over.
func GetDefaultProvider() (Provider, error) {
	local, err := NewLocalProvider()
	if err != nil {
		return nil, err
	}
	switch name := strings.ToLower(strings.TrimSpace(os.Getenv("DECRYPTO_WORDS_PROVIDER"))); name {
	case "", "local":
		log.Printf("[WORDS] every hand is dealt from %s (%d words)", local.source, len(local.wordList))
		return local, nil
	case "llm":
		model, ok := providers.FromEnv()
		if !ok {
			log.Printf("[WORDS] DECRYPTO_WORDS_PROVIDER=llm but no model is configured; every hand is dealt from %s", local.source)
			return local, nil
		}
		log.Printf("[WORDS] every hand is written by the model, %s answers when it cannot", local.source)
		return NewLLMProvider(model, local), nil
	default:
		return nil, fmt.Errorf("unknown DECRYPTO_WORDS_PROVIDER %q, expected local or llm", name)
	}
}
