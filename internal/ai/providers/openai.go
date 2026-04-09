package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/ZinkLu/decrypto-the-game/internal/ai"
)

// OpenAIProvider calls any OpenAI-compatible chat completions API.
// Works with OpenAI, DeepSeek, Ollama, vLLM, Together AI, etc.
type OpenAIProvider struct {
	APIKey  string
	Model   string
	BaseURL string // e.g. "https://api.openai.com/v1" or "http://localhost:11434/v1"
}

// NewOpenAIProvider creates a provider for any OpenAI-compatible API.
// baseURL should be the base URL without trailing slash (e.g. "https://api.openai.com/v1").
// If baseURL is empty, defaults to "https://api.openai.com/v1".
// If model is empty, defaults to "gpt-4o".
func NewOpenAIProvider(apiKey, baseURL, model string) *OpenAIProvider {
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	baseURL = strings.TrimRight(baseURL, "/")
	if model == "" {
		model = "gpt-4o"
	}
	return &OpenAIProvider{
		APIKey:  apiKey,
		Model:   model,
		BaseURL: baseURL,
	}
}

type openaiMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openaiRequest struct {
	Model     string          `json:"model"`
	Messages  []openaiMessage `json:"messages"`
	MaxTokens int             `json:"max_tokens"`
}

type openaiChoice struct {
	Message struct {
		Content          string `json:"content"`
		ReasoningContent string `json:"reasoning_content,omitempty"`
	} `json:"message"`
}

type openaiResponse struct {
	Choices []openaiChoice `json:"choices"`
}

// Complete sends messages to the OpenAI-compatible API and returns the response.
func (p *OpenAIProvider) Complete(ctx context.Context, messages []ai.Message) (string, error) {
	var chatMessages []openaiMessage
	for _, m := range messages {
		chatMessages = append(chatMessages, openaiMessage{
			Role:    m.Role,
			Content: m.Content,
		})
	}

	reqBody := openaiRequest{
		Model:     p.Model,
		Messages:  chatMessages,
		MaxTokens: 2048,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("openai: marshal request: %w", err)
	}

	url := p.BaseURL + "/chat/completions"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", fmt.Errorf("openai: create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if p.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+p.APIKey)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("openai: http request: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("openai: read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("openai: API returned status %d: %s", resp.StatusCode, string(respBytes))
	}

	var openaiResp openaiResponse
	if err := json.Unmarshal(respBytes, &openaiResp); err != nil {
		return "", fmt.Errorf("openai: unmarshal response: %w", err)
	}

	if len(openaiResp.Choices) == 0 {
		return "", fmt.Errorf("openai: no choices in response")
	}

	choice := openaiResp.Choices[0]
	if reasoning := choice.Message.ReasoningContent; reasoning != "" {
		log.Printf("[AI] OpenAI reasoning_content:\n%s", reasoning)
	}

	return choice.Message.Content, nil
}
