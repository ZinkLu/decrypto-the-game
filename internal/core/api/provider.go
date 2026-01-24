package api

import "github.com/ZinkLu/decrypto-the-game/internal/core/word_providers"

var wordProvider word_providers.Provider

func init() {
	wordProvider = word_providers.GetDefaultProvider()
}
