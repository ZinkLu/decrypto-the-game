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

	"github.com/ZinkLu/decrypto-the-game/internal/ai"
)

const claudeAPIURL = "https://api.anthropic.com/v1/messages"

// ClaudeProvider calls the Anthropic Claude API.
type ClaudeProvider struct {
	APIKey string
	Model  string
}

// NewClaudeProvider creates a ClaudeProvider with the given API key.
func NewClaudeProvider(apiKey string) *ClaudeProvider {
	return &ClaudeProvider{
		APIKey: apiKey,
		Model:  "claude-sonnet-4-6",
	}
}

type claudeMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type claudeRequest struct {
	Model     string          `json:"model"`
	MaxTokens int             `json:"max_tokens"`
	Messages  []claudeMessage `json:"messages"`
	System    string          `json:"system,omitempty"`
}

type claudeContentBlock struct {
	Type     string `json:"type"` // "text" or "thinking"
	Text     string `json:"text,omitempty"`
	Thinking string `json:"thinking,omitempty"`
}

type claudeResponse struct {
	Content []claudeContentBlock `json:"content"`
}

// Complete sends messages to the Claude API and returns the assistant's response.
func (p *ClaudeProvider) Complete(ctx context.Context, messages []ai.Message) (string, error) {
	var system string
	var chatMessages []claudeMessage
	var baseURL string

	if envBaseURL, ok := os.LookupEnv("ANTHROPIC_BASE_URL"); ok {
		baseURL = envBaseURL
	} else {
		baseURL = claudeAPIURL
	}

	for _, m := range messages {
		if m.Role == "system" {
			system = m.Content
		} else {
			chatMessages = append(chatMessages, claudeMessage{
				Role:    m.Role,
				Content: m.Content,
			})
		}
	}

	reqBody := claudeRequest{
		Model:     p.Model,
		MaxTokens: 2048,
		Messages:  chatMessages,
		System:    system,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("claude: marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", fmt.Errorf("claude: create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", p.APIKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("claude: http request: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("claude: read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("claude: API returned status %d: %s", resp.StatusCode, string(respBytes))
	}

	var claudeResp claudeResponse
	if err := json.Unmarshal(respBytes, &claudeResp); err != nil {
		return "", fmt.Errorf("claude: unmarshal response: %w", err)
	}

	if len(claudeResp.Content) == 0 {
		return "", fmt.Errorf("claude: empty content in response")
	}

	var textResult string
	for _, block := range claudeResp.Content {
		switch block.Type {
		case "thinking":
			log.Printf("[AI] Claude thinking:\n%s", block.Thinking)
		case "text":
			textResult = block.Text
		}
	}

	return textResult, nil
}
