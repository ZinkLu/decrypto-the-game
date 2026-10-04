package core

import (
	"log"

	"github.com/ZinkLu/decrypto-the-game/server/internal/core/word_providers"
)

// wordProvider deals the words of every new game. Where they come from is
// DECRYPTO_WORDS_PROVIDER; a hand that cannot be dealt stops the server rather
// than dealing a game nobody can read.
var wordProvider word_providers.Provider

func init() {
	p, err := word_providers.GetDefaultProvider()
	if err != nil {
		log.Fatalf("core: %v", err)
	}
	wordProvider = p
}
