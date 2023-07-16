package api

import "github.com/ZinkLu/decrypto-the-game/pkg/decrypto/word_providers"

var wordProvider word_providers.Provider

func init() {
	wordProvider = word_providers.GetDefaultProvider()
}
