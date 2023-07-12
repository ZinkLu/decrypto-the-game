package api

import "github.com/ZinkLu/decrypto-the-game/pkg/decrypto/word_providers"

var word_provider word_providers.Provider

func init() {
	word_provider = word_providers.GetDefaultProvider()
}
