package providers

import (
	"log"
	"os"
	"strings"

	"github.com/ZinkLu/decrypto-the-game/server/internal/ai"
)

// FromEnv picks the model this server talks to, and says which one it picked:
// OpenAI-compatible when OPENAI_API_KEY is set, else Claude. The AI players and
// the words share it, so a server never plays by one model and deals by another.
func FromEnv() (ai.LLMProvider, bool) {
	if key := strings.TrimSpace(os.Getenv("OPENAI_API_KEY")); key != "" {
		baseURL, model := os.Getenv("OPENAI_BASE_URL"), os.Getenv("OPENAI_MODEL")
		log.Printf("[AI] model: OpenAI-compatible (base=%s, model=%s)", baseURL, model)
		return NewOpenAIProvider(key, baseURL, model), true
	}
	if key := strings.TrimSpace(os.Getenv("ANTHROPIC_API_KEY")); key != "" {
		log.Printf("[AI] model: Claude")
		return NewClaudeProvider(key), true
	}
	return nil, false
}
