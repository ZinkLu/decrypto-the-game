package providers

import (
	"log"
	"os"
	"strings"
)

// debugEnabled reports whether DECRYPTO_AI_DEBUG asks for each model's
// reasoning and raw answer in the log. Any value but "", "0" and "false" turns it on.
func debugEnabled() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("DECRYPTO_AI_DEBUG"))) {
	case "", "0", "false":
		return false
	}
	return true
}

// logExchange writes a model's reasoning and raw answer when debugging is on.
func logExchange(provider, reasoning, answer string) {
	if !debugEnabled() {
		return
	}
	if strings.TrimSpace(reasoning) != "" {
		log.Printf("[AI-DEBUG] %s reasoning:\n%s", provider, reasoning)
	}
	log.Printf("[AI-DEBUG] %s answer: %q", provider, answer)
}
