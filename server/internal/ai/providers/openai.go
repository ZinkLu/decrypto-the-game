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

// defaultIdleTimeout is how long a request waits for the model to send
// anything at all — the response headers, or the next token of the stream —
// before it is given up on. A model that keeps sending is never cut off by
// it, however long it thinks; only the caller's context bounds that.
const defaultIdleTimeout = 35 * time.Second

// maxResponseBytes bounds what one answer may send back, stream included.
const maxResponseBytes = 8 << 20

// OpenAIProvider calls any OpenAI-compatible chat completions API.
// Works with OpenAI, DeepSeek, Ollama, vLLM, Together AI, etc.
type OpenAIProvider struct {
	Client  *http.Client
	APIKey  string
	Model   string
	BaseURL string // e.g. "https://api.openai.com/v1" or "http://localhost:11434/v1"
	// MaxTokens bounds each answer, reasoning included (OPENAI_MAX_TOKENS).
	// Zero or negative omits max_tokens from the request entirely, so the
	// server applies its own default — a thinking model's default budget is
	// far larger than any cap we would pick, and a cap that is too small only
	// truncates the answer (finish_reason=length) without shortening thought.
	MaxTokens int
	// ReasoningEffort ("low", "medium", "high") shortens a reasoning model's
	// thinking where the server supports it (OPENAI_REASONING_EFFORT).
	ReasoningEffort string
	// Extra is merged into every request body (OPENAI_EXTRA_BODY, a JSON object),
	// e.g. {"chat_template_kwargs":{"enable_thinking":false}}.
	Extra map[string]any
	// IdleTimeout is how long the model may send nothing — no headers, no
	// next token — before this attempt is given up on (OPENAI_IDLE_TIMEOUT,
	// in seconds). Answers are streamed and assembled here, so a slow model
	// that is still writing keeps its request.
	IdleTimeout time.Duration
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
		APIKey: apiKey,
		// No total timeout: the answer streams, IdleTimeout watches a model
		// that sends nothing, and the caller's context bounds the whole.
		Client:          &http.Client{},
		Model:           model,
		BaseURL:         baseURL,
		ReasoningEffort: strings.TrimSpace(os.Getenv("OPENAI_REASONING_EFFORT")),
		IdleTimeout:     defaultIdleTimeout,
	}
	// Only a positive value takes; unset, zero or negative leaves MaxTokens at
	// zero, and Complete then omits max_tokens from the request.
	if n, err := strconv.Atoi(strings.TrimSpace(os.Getenv("OPENAI_MAX_TOKENS"))); err == nil && n > 0 {
		p.MaxTokens = n
	}
	if n, err := strconv.Atoi(strings.TrimSpace(os.Getenv("OPENAI_IDLE_TIMEOUT"))); err == nil && n > 0 {
		p.IdleTimeout = time.Duration(n) * time.Second
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

type openaiUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
}

type openaiResponse struct {
	Usage   openaiUsage    `json:"usage"`
	Choices []openaiChoice `json:"choices"`
}

// openaiChunk is one event of a streamed answer.
type openaiChunk struct {
	Choices []struct {
		Delta struct {
			Content          string `json:"content"`
			ReasoningContent string `json:"reasoning_content,omitempty"`
			Reasoning        string `json:"reasoning,omitempty"` // OpenRouter and newer vLLM
		} `json:"delta"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Usage *openaiUsage `json:"usage"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// watchdogReader tells a timer that the model is still sending: every read
// gives the rest of the answer another idle window to arrive in.
type watchdogReader struct {
	r     io.Reader
	reset func()
}

func (w *watchdogReader) Read(p []byte) (int, error) {
	w.reset()
	n, err := w.r.Read(p)
	w.reset()
	return n, err
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

	body := map[string]any{}
	for k, v := range p.Extra {
		body[k] = v
	}
	body["model"] = p.Model
	body["messages"] = chatMessages
	// Omit max_tokens unless a positive cap was configured, so the server
	// applies its own default rather than a cap that only truncates answers.
	if p.MaxTokens > 0 {
		body["max_tokens"] = p.MaxTokens
	}
	body["stream"] = true
	body["stream_options"] = map[string]any{"include_usage": true}
	if p.ReasoningEffort != "" {
		body["reasoning_effort"] = p.ReasoningEffort
	}

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return "", fmt.Errorf("openai: marshal request: %w", err)
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

	url := p.BaseURL + "/chat/completions"
	req, err := http.NewRequestWithContext(streamCtx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", fmt.Errorf("openai: create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if p.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+p.APIKey)
	}

	client := p.Client
	if client == nil {
		client = &http.Client{}
	}
	fail := func(op string, err error) error {
		if stalled.Load() {
			return fmt.Errorf("openai: %s: model sent no data for %s", op, idle)
		}
		return fmt.Errorf("openai: %s: %w", op, err)
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
		return "", fmt.Errorf("openai: API returned status %d: %s", resp.StatusCode, string(respBytes))
	}

	// A server that ignores stream:true answers with plain JSON; read that too.
	if !strings.HasPrefix(resp.Header.Get("Content-Type"), "text/event-stream") {
		respBytes, err := io.ReadAll(answer)
		if err != nil {
			return "", fail("read response body", err)
		}
		var openaiResp openaiResponse
		if err := json.Unmarshal(respBytes, &openaiResp); err != nil {
			return "", fmt.Errorf("openai: unmarshal response: %w", err)
		}
		if len(openaiResp.Choices) == 0 {
			return "", fmt.Errorf("openai: no choices in response")
		}
		choice := openaiResp.Choices[0]
		reasoning := choice.Message.ReasoningContent
		if reasoning == "" {
			reasoning = choice.Message.Reasoning
		}
		return settleOpenAI(choice.Message.Content, reasoning, choice.FinishReason, openaiResp.Usage)
	}

	content, reasoning, finish, usage, complete, err := readStream(answer)
	if err != nil {
		return "", fail("read response stream", err)
	}
	if !complete && finish == "" {
		if content == "" {
			return "", fail("read response stream", fmt.Errorf("stream ended without an answer"))
		}
		// Tokens arrived but the stream was cut mid-answer: what is there is
		// not an answer to trust, and the attempt is worth repeating.
		return "", fmt.Errorf("openai: stream ended before the answer was complete")
	}
	return settleOpenAI(content, reasoning, finish, usage)
}

// settleOpenAI logs one answer and refuses an empty or cut-off one, streamed or not.
func settleOpenAI(content, reasoning, finish string, usage openaiUsage) (string, error) {
	log.Printf("[AI] completion finish=%s prompt_tokens=%d completion_tokens=%d", finish, usage.PromptTokens, usage.CompletionTokens)
	logExchange("openai", reasoning, content)
	if strings.TrimSpace(content) == "" || finish == "length" {
		return "", fmt.Errorf("openai: empty or incomplete answer (finish_reason=%s)", finish)
	}
	return content, nil
}

// readStream assembles one streamed answer: the tokens of its content and of
// its reasoning, the finish reason, the usage of the last event that carried
// one, and whether the stream said [DONE]. An event that is not JSON is
// skipped: gateways interleave keep-alives of their own.
func readStream(r io.Reader) (content, reasoning, finish string, usage openaiUsage, done bool, err error) {
	var text, thinking strings.Builder
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "[DONE]" {
			return text.String(), thinking.String(), finish, usage, true, nil
		}
		var chunk openaiChunk
		if json.Unmarshal([]byte(data), &chunk) != nil {
			continue
		}
		if chunk.Error != nil {
			return text.String(), thinking.String(), finish, usage, done, fmt.Errorf("API error mid-stream: %s", chunk.Error.Message)
		}
		for _, c := range chunk.Choices {
			text.WriteString(c.Delta.Content)
			if c.Delta.ReasoningContent != "" {
				thinking.WriteString(c.Delta.ReasoningContent)
			}
			thinking.WriteString(c.Delta.Reasoning)
			if c.FinishReason != "" {
				finish = c.FinishReason
			}
		}
		if chunk.Usage != nil {
			usage = *chunk.Usage
		}
	}
	return text.String(), thinking.String(), finish, usage, done, scanner.Err()
}
