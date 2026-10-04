package providers

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/ZinkLu/decrypto-the-game/server/internal/ai"
)

func TestClaudeStreamAssemblesTheAnswer(t *testing.T) {
	p := NewClaudeProvider("test-only")
	var sent map[string]any
	p.Client = &http.Client{Transport: transport(func(r *http.Request) (*http.Response, error) {
		if r.Header.Get("x-api-key") != "test-only" || r.Header.Get("anthropic-version") != "2023-06-01" {
			t.Error("missing API headers")
		}
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &sent); err != nil {
			t.Fatal(err)
		}
		return sseResponse(t,
			`event: message_start`,
			`data: {"type":"message_start","message":{"usage":{"input_tokens":25,"output_tokens":1}}}`,
			`event: ping`,
			`data: {"type":"ping"}`,
			`data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}`,
			`data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"the clue fits "}}`,
			`data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"word three"}}`,
			`data: {"type":"content_block_stop","index":0}`,
			`data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}`,
			`data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"3"}}`,
			`data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":15}}`,
			`data: {"type":"message_stop"}`,
		), nil
	})}
	answer, err := p.Complete(context.Background(), []ai.Message{{Role: "system", Content: "s"}, {Role: "user", Content: "u"}})
	if err != nil {
		t.Fatal(err)
	}
	if answer != "3" {
		t.Fatalf("answer=%q", answer)
	}
	if sent["stream"] != true || sent["model"] == nil {
		t.Fatalf("request is not streaming: %v", sent)
	}
	if system, _ := sent["system"].(string); system != "s" {
		t.Fatalf("system message lost: %v", sent["system"])
	}
}

func TestClaudeStreamRefusesBadAnswers(t *testing.T) {
	for _, tc := range []struct {
		name   string
		events []string
	}{
		{"cut off by max_tokens", []string{
			`data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"3"}}`,
			`data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"},"usage":{"output_tokens":2048}}`,
			`data: {"type":"message_stop"}`,
		}},
		{"thinking only", []string{
			`data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"thinking"}}`,
			`data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}`,
			`data: {"type":"message_stop"}`,
		}},
		{"truncated stream", []string{
			`data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"3"}}`,
		}},
		{"error mid-stream", []string{
			`data: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}`,
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			p := NewClaudeProvider("k")
			p.Client = &http.Client{Transport: transport(func(r *http.Request) (*http.Response, error) {
				return sseResponse(t, tc.events...), nil
			})}
			if answer, err := p.Complete(context.Background(), nil); err == nil {
				t.Fatalf("accepted %q", answer)
			}
		})
	}
}

func TestClaudeStreamGivesUpOnASilentModel(t *testing.T) {
	p := NewClaudeProvider("k")
	p.IdleTimeout = 20 * time.Millisecond
	p.Client = &http.Client{Transport: transport(func(r *http.Request) (*http.Response, error) {
		header := make(http.Header)
		header.Set("Content-Type", "text/event-stream")
		first := strings.NewReader(`data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"3"}}` + "\n")
		return &http.Response{StatusCode: 200, Body: io.NopCloser(io.MultiReader(first, silentReader{r.Context()})), Header: header}, nil
	})}
	start := time.Now()
	_, err := p.Complete(context.Background(), nil)
	if err == nil || !strings.Contains(err.Error(), "no data") {
		t.Fatalf("stall error missing: %v", err)
	}
	if time.Since(start) > 2*time.Second {
		t.Fatal("idle timeout did not bound the stream")
	}
}

func TestClaudeReadsAPlainJSONAnswer(t *testing.T) {
	for _, tc := range []struct {
		body  string
		valid bool
	}{
		{`{"content":[{"type":"thinking","thinking":"hmm"},{"type":"text","text":"3"}],"stop_reason":"end_turn","usage":{"input_tokens":9,"output_tokens":2}}`, true},
		{`{"content":[{"type":"text","text":"3"}],"stop_reason":"max_tokens"}`, false},
		{`{"content":[],"stop_reason":"end_turn"}`, false},
	} {
		p := NewClaudeProvider("k")
		p.Client = &http.Client{Transport: transport(func(r *http.Request) (*http.Response, error) {
			header := make(http.Header)
			header.Set("Content-Type", "application/json")
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(tc.body)), Header: header}, nil
		})}
		answer, err := p.Complete(context.Background(), nil)
		if (err == nil) != tc.valid {
			t.Fatalf("valid=%v answer=%q error=%v", tc.valid, answer, err)
		}
	}
}

func TestClaudeIdleTimeoutIsConfigurable(t *testing.T) {
	t.Setenv("ANTHROPIC_IDLE_TIMEOUT", "")
	if got := NewClaudeProvider("k").IdleTimeout; got != defaultIdleTimeout {
		t.Fatalf("default IdleTimeout=%s", got)
	}
	t.Setenv("ANTHROPIC_IDLE_TIMEOUT", "5")
	if got := NewClaudeProvider("k").IdleTimeout; got != 5*time.Second {
		t.Fatalf("IdleTimeout=%s", got)
	}
}
