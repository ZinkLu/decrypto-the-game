package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/ZinkLu/decrypto-the-game/server/internal/ai"
)

// OpenAIProvider calls any OpenAI-compatible chat completions API.
// Works with OpenAI, DeepSeek, Ollama, vLLM, Together AI, etc.
type OpenAIProvider struct {
	Client  *http.Client
	APIKey  string
	Model   string
	BaseURL string // e.g. "https://api.openai.com/v1" or "http://localhost:11434/v1"
	// MaxTokens bounds each answer, reasoning included (OPENAI_MAX_TOKENS, default 2048).
	MaxTokens int
	// ReasoningEffort ("low", "medium", "high") shortens a reasoning model's
	// thinking where the server supports it (OPENAI_REASONING_EFFORT).
	ReasoningEffort string
	// Extra is merged into every request body (OPENAI_EXTRA_BODY, a JSON object),
	// e.g. {"chat_template_kwargs":{"enable_thinking":false}}.
	Extra map[string]any
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
	p := &OpenAIProvider{
		APIKey:          apiKey,
		Client:          &http.Client{Timeout: 35 * time.Second},
		Model:           model,
		BaseURL:         baseURL,
		MaxTokens:       2048,
		ReasoningEffort: strings.TrimSpace(os.Getenv("OPENAI_REASONING_EFFORT")),
	}
	if n, err := strconv.Atoi(strings.TrimSpace(os.Getenv("OPENAI_MAX_TOKENS"))); err == nil && n > 0 {
		p.MaxTokens = n
	}
	if raw := strings.TrimSpace(os.Getenv("OPENAI_EXTRA_BODY")); raw != "" {
		if err := json.Unmarshal([]byte(raw), &p.Extra); err != nil {
			log.Printf("[AI] ignoring OPENAI_EXTRA_BODY: %v", err)
		}
	}
	return p
}

type openaiMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openaiChoice struct {
	FinishReason string `json:"finish_reason"`
	Message      struct {
		Content          string `json:"content"`
		ReasoningContent string `json:"reasoning_content,omitempty"`
		Reasoning        string `json:"reasoning,omitempty"` // OpenRouter and newer vLLM
	} `json:"message"`
}

type openaiResponse struct {
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
	} `json:"usage"`
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

	maxTokens := p.MaxTokens
	if maxTokens <= 0 {
		maxTokens = 2048
	}
	body := map[string]any{}
	for k, v := range p.Extra {
		body[k] = v
	}
	body["model"] = p.Model
	body["messages"] = chatMessages
	body["max_tokens"] = maxTokens
	if p.ReasoningEffort != "" {
		body["reasoning_effort"] = p.ReasoningEffort
	}

	bodyBytes, err := json.Marshal(body)
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

	client := p.Client
	if client == nil {
		client = &http.Client{Timeout: 35 * time.Second}
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("openai: http request: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
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
	log.Printf("[AI] completion finish=%s prompt_tokens=%d completion_tokens=%d", choice.FinishReason, openaiResp.Usage.PromptTokens, openaiResp.Usage.CompletionTokens)
	reasoning := choice.Message.ReasoningContent
	if reasoning == "" {
		reasoning = choice.Message.Reasoning
	}
	logExchange("openai", reasoning, choice.Message.Content)
	if strings.TrimSpace(choice.Message.Content) == "" || choice.FinishReason == "length" {
		return "", fmt.Errorf("openai: empty or incomplete answer (finish_reason=%s)", choice.FinishReason)
	}

	return choice.Message.Content, nil
}
