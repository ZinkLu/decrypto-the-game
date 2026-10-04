package providers

import (
	"bufio"
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
	"sync/atomic"
	"time"

	"github.com/ZinkLu/decrypto-the-game/server/internal/ai"
)

const claudeAPIURL = "https://api.anthropic.com/v1/messages"

// ClaudeProvider calls the Anthropic Claude API. The answer streams and is
// assembled here, so a model that keeps writing is never cut off for being
// slow; IdleTimeout only bounds a model that sends nothing at all.
type ClaudeProvider struct {
	Client *http.Client
	APIKey string
	Model  string
	// IdleTimeout is how long the model may send nothing — no headers, no
	// next token — before this attempt is given up on (ANTHROPIC_IDLE_TIMEOUT,
	// in seconds).
	IdleTimeout time.Duration
}

// NewClaudeProvider creates a ClaudeProvider with the given API key.
func NewClaudeProvider(apiKey string) *ClaudeProvider {
	p := &ClaudeProvider{
		// No total timeout: the answer streams, IdleTimeout watches a model
		// that sends nothing, and the caller's context bounds the whole.
		Client:      &http.Client{},
		APIKey:      apiKey,
		Model:       "claude-sonnet-4-6",
		IdleTimeout: defaultIdleTimeout,
	}
	if n, err := strconv.Atoi(strings.TrimSpace(os.Getenv("ANTHROPIC_IDLE_TIMEOUT"))); err == nil && n > 0 {
		p.IdleTimeout = time.Duration(n) * time.Second
	}
	return p
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
	Stream    bool            `json:"stream"`
}

type claudeContentBlock struct {
	Type     string `json:"type"` // "text" or "thinking"
	Text     string `json:"text,omitempty"`
	Thinking string `json:"thinking,omitempty"`
}

type claudeUsage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

type claudeResponse struct {
	Content    []claudeContentBlock `json:"content"`
	StopReason string               `json:"stop_reason"`
	Usage      claudeUsage          `json:"usage"`
}

// claudeEvent is one event of a streamed answer.
type claudeEvent struct {
	Type  string `json:"type"`
	Delta struct {
		Type       string `json:"type"`
		Text       string `json:"text"`
		Thinking   string `json:"thinking"`
		StopReason string `json:"stop_reason"`
	} `json:"delta"`
	Message struct {
		Usage *claudeUsage `json:"usage"`
	} `json:"message"`
	Usage *claudeUsage `json:"usage"`
	Error *struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error"`
}

// Complete sends messages to the Claude API and returns the assistant's response.
func (p *ClaudeProvider) Complete(ctx context.Context, messages []ai.Message) (string, error) {
	var system string
	var chatMessages []claudeMessage
	for _, m := range messages {
		if m.Role == "system" {
			system = m.Content
		} else {
			chatMessages = append(chatMessages, claudeMessage{Role: m.Role, Content: m.Content})
		}
	}

	reqBody := claudeRequest{
		Model:     p.Model,
		MaxTokens: 2048,
		Messages:  chatMessages,
		System:    system,
		Stream:    true,
	}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("claude: marshal request: %w", err)
	}

	baseURL := claudeAPIURL
	if envBaseURL, ok := os.LookupEnv("ANTHROPIC_BASE_URL"); ok {
		baseURL = envBaseURL
	}

	// The watchdog cancels the request once the model has sent nothing for
	// IdleTimeout; every token that arrives re-arms it, so a model that is
	// still writing keeps its request however long the caller allows.
	idle := p.IdleTimeout
	if idle <= 0 {
		idle = defaultIdleTimeout
	}
	streamCtx, cancelCtx := context.WithCancel(ctx)
	defer cancelCtx()
	var stalled atomic.Bool
	timer := time.AfterFunc(idle, func() { stalled.Store(true); cancelCtx() })
	defer timer.Stop()

	req, err := http.NewRequestWithContext(streamCtx, http.MethodPost, baseURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", fmt.Errorf("claude: create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", p.APIKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	client := p.Client
	if client == nil {
		client = &http.Client{}
	}
	fail := func(op string, err error) error {
		if stalled.Load() {
			return fmt.Errorf("claude: %s: model sent no data for %s", op, idle)
		}
		return fmt.Errorf("claude: %s: %w", op, err)
	}

	resp, err := client.Do(req)
	if err != nil {
		return "", fail("http request", err)
	}
	defer resp.Body.Close()
	timer.Reset(idle)
	answer := &watchdogReader{r: io.LimitReader(resp.Body, maxResponseBytes), reset: func() { timer.Reset(idle) }}

	if resp.StatusCode != http.StatusOK {
		respBytes, err := io.ReadAll(answer)
		if err != nil {
			return "", fail("read error response", err)
		}
		return "", fmt.Errorf("claude: API returned status %d: %s", resp.StatusCode, string(respBytes))
	}

	// A gateway that ignores stream:true answers with plain JSON; read that too.
	if !strings.HasPrefix(resp.Header.Get("Content-Type"), "text/event-stream") {
		respBytes, err := io.ReadAll(answer)
		if err != nil {
			return "", fail("read response body", err)
		}
		var claudeResp claudeResponse
		if err := json.Unmarshal(respBytes, &claudeResp); err != nil {
			return "", fmt.Errorf("claude: unmarshal response: %w", err)
		}
		var text, thinking strings.Builder
		for _, block := range claudeResp.Content {
			switch block.Type {
			case "thinking":
				thinking.WriteString(block.Thinking)
			case "text":
				text.WriteString(block.Text)
			}
		}
		return settleClaude(text.String(), thinking.String(), claudeResp.StopReason, claudeResp.Usage)
	}

	text, thinking, stopReason, usage, done, err := readClaudeStream(answer)
	if err != nil {
		return "", fail("read response stream", err)
	}
	if !done && stopReason == "" {
		if text == "" {
			return "", fail("read response stream", fmt.Errorf("stream ended without an answer"))
		}
		// Tokens arrived but the stream was cut mid-answer: what is there is
		// not an answer to trust, and the attempt is worth repeating.
		return "", fmt.Errorf("claude: stream ended before the answer was complete")
	}
	return settleClaude(text, thinking, stopReason, usage)
}

// settleClaude logs one answer and refuses an empty or cut-off one, streamed or not.
func settleClaude(content, thinking, stopReason string, usage claudeUsage) (string, error) {
	log.Printf("[AI] completion stop_reason=%s input_tokens=%d output_tokens=%d", stopReason, usage.InputTokens, usage.OutputTokens)
	logExchange("claude", thinking, content)
	if strings.TrimSpace(content) == "" || stopReason == "max_tokens" {
		return "", fmt.Errorf("claude: empty or incomplete answer (stop_reason=%s)", stopReason)
	}
	return content, nil
}

// readClaudeStream assembles one streamed answer: the tokens of its text and
// of its thinking, the stop reason, the token counts, and whether the stream
// reached message_stop. An event that is not JSON is skipped: gateways
// interleave keep-alives of their own, and pings carry nothing to read.
func readClaudeStream(r io.Reader) (content, thinking, stopReason string, usage claudeUsage, done bool, err error) {
	var text, thought strings.Builder
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" {
			continue
		}
		var event claudeEvent
		if json.Unmarshal([]byte(data), &event) != nil {
			continue
		}
		switch event.Type {
		case "message_start":
			if event.Message.Usage != nil {
				usage = *event.Message.Usage
			}
		case "content_block_delta":
			switch event.Delta.Type {
			case "text_delta":
				text.WriteString(event.Delta.Text)
			case "thinking_delta":
				thought.WriteString(event.Delta.Thinking)
			}
		case "message_delta":
			if event.Delta.StopReason != "" {
				stopReason = event.Delta.StopReason
			}
			if event.Usage != nil {
				usage.OutputTokens = event.Usage.OutputTokens
			}
		case "message_stop":
			return text.String(), thought.String(), stopReason, usage, true, nil
		case "error":
			message := "unknown error"
			if event.Error != nil {
				message = event.Error.Message
			}
			return text.String(), thought.String(), stopReason, usage, done, fmt.Errorf("API error mid-stream: %s", message)
		}
	}
	return text.String(), thought.String(), stopReason, usage, done, scanner.Err()
}
