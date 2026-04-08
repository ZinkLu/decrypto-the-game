package ai

import "context"

type Message struct {
	Role    string `json:"role"`    // "system", "user", "assistant"
	Content string `json:"content"`
}

type LLMProvider interface {
	Complete(ctx context.Context, messages []Message) (string, error)
}
