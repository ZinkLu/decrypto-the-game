package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

type transport func(*http.Request) (*http.Response, error)

func (f transport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestCompletionRequiresFinalAnswer(t *testing.T) {
	for _, tc := range []struct {
		body  string
		valid bool
	}{
		{`{"choices":[{"finish_reason":"stop","message":{"content":"3"}}]}`, true},
		{`{"choices":[{"finish_reason":"stop","message":{"content":"","reasoning_content":"thinking only"}}]}`, false},
		{`{"choices":[{"finish_reason":"length","message":{"content":"3"}}]}`, false},
		{`{"choices":[]}`, false},
	} {
		p := NewOpenAIProvider("test-only", "http://model.invalid/v1", "test")
		p.Client = &http.Client{Transport: transport(func(r *http.Request) (*http.Response, error) {
			if r.URL.Path != "/v1/chat/completions" || r.Header.Get("Authorization") != "Bearer test-only" {
				t.Error("wrong request endpoint or auth")
			}
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(tc.body)), Header: make(http.Header)}, nil
		})}
		_, err := p.Complete(context.Background(), nil)
		if (err == nil) != tc.valid {
			t.Fatalf("valid=%v error=%v", tc.valid, err)
		}
	}
}

func TestTransportHonorsDeadline(t *testing.T) {
	p := NewOpenAIProvider("", "http://model.invalid/v1", "test")
	p.Client = &http.Client{Timeout: 10 * time.Millisecond, Transport: transport(func(r *http.Request) (*http.Response, error) { <-r.Context().Done(); return nil, r.Context().Err() })}
	start := time.Now()
	if _, err := p.Complete(context.Background(), nil); err == nil {
		t.Fatal("timeout missing")
	}
	if time.Since(start) > time.Second {
		t.Fatal("timeout did not bound request")
	}
}

func sseResponse(t *testing.T, events ...string) *http.Response {
	t.Helper()
	header := make(http.Header)
	header.Set("Content-Type", "text/event-stream")
	return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(strings.Join(events, "\n") + "\n")), Header: header}
}

func TestStreamAssemblesTheAnswer(t *testing.T) {
	p := NewOpenAIProvider("test-only", "http://model.invalid/v1", "test")
	var sent map[string]any
	p.Client = &http.Client{Transport: transport(func(r *http.Request) (*http.Response, error) {
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &sent); err != nil {
			t.Fatal(err)
		}
		return sseResponse(t,
			": keep-alive",
			`data: {"choices":[{"delta":{"role":"assistant","reasoning_content":"the clue fits "}}]}`,
			`data: {"choices":[{"delta":{"reasoning_content":"word three"}}]}`,
			``,
			`data: {"choices":[{"delta":{"content":"3"}}]}`,
			`data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":7,"completion_tokens":3}}`,
			`data: [DONE]`,
		), nil
	})}
	answer, err := p.Complete(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if answer != "3" {
		t.Fatalf("answer=%q", answer)
	}
	if sent["stream"] != true || sent["stream_options"] == nil {
		t.Fatalf("request is not streaming: %v", sent)
	}
}

func TestStreamRefusesBadAnswers(t *testing.T) {
	for _, tc := range []struct {
		name   string
		events []string
	}{
		{"cut off by max_tokens", []string{`data: {"choices":[{"delta":{"content":"3"},"finish_reason":"length"}]}`, `data: [DONE]`}},
		{"reasoning only", []string{`data: {"choices":[{"delta":{"reasoning_content":"thinking"},"finish_reason":"stop"}]}`, `data: [DONE]`}},
		{"truncated stream", []string{`data: {"choices":[{"delta":{"content":"3"}}]}`}},
		{"error mid-stream", []string{`data: {"error":{"message":"overloaded"}}`}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			p := NewOpenAIProvider("k", "http://model.invalid/v1", "test")
			p.Client = &http.Client{Transport: transport(func(r *http.Request) (*http.Response, error) {
				return sseResponse(t, tc.events...), nil
			})}
			if answer, err := p.Complete(context.Background(), nil); err == nil {
				t.Fatalf("accepted %q", answer)
			}
		})
	}
}

// silentReader sends nothing until the request is given up on.
type silentReader struct{ ctx context.Context }

func (s silentReader) Read([]byte) (int, error) { <-s.ctx.Done(); return 0, s.ctx.Err() }

func TestStreamGivesUpOnASilentModel(t *testing.T) {
	p := NewOpenAIProvider("k", "http://model.invalid/v1", "test")
	p.IdleTimeout = 20 * time.Millisecond
	p.Client = &http.Client{Transport: transport(func(r *http.Request) (*http.Response, error) {
		header := make(http.Header)
		header.Set("Content-Type", "text/event-stream")
		first := strings.NewReader(`data: {"choices":[{"delta":{"content":"3"}}]}` + "\n")
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

func TestIdleTimeoutIsConfigurable(t *testing.T) {
	t.Setenv("OPENAI_IDLE_TIMEOUT", "")
	if got := NewOpenAIProvider("k", "", "").IdleTimeout; got != defaultIdleTimeout {
		t.Fatalf("default IdleTimeout=%s", got)
	}
	t.Setenv("OPENAI_IDLE_TIMEOUT", "5")
	if got := NewOpenAIProvider("k", "", "").IdleTimeout; got != 5*time.Second {
		t.Fatalf("IdleTimeout=%s", got)
	}
}

func TestReasoningSettingsReachTheRequest(t *testing.T) {
	t.Setenv("OPENAI_REASONING_EFFORT", "low")
	t.Setenv("OPENAI_MAX_TOKENS", "1024")
	t.Setenv("OPENAI_EXTRA_BODY", `{"chat_template_kwargs":{"enable_thinking":false}}`)
	p := NewOpenAIProvider("k", "http://model.invalid/v1", "test")
	var sent map[string]any
	p.Client = &http.Client{Transport: transport(func(r *http.Request) (*http.Response, error) {
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &sent); err != nil {
			t.Fatal(err)
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"choices":[{"finish_reason":"stop","message":{"content":"3"}}]}`)), Header: make(http.Header)}, nil
	})}
	if _, err := p.Complete(context.Background(), nil); err != nil {
		t.Fatal(err)
	}
	if sent["reasoning_effort"] != "low" || sent["max_tokens"] != float64(1024) || sent["chat_template_kwargs"] == nil || sent["model"] != "test" {
		t.Fatalf("settings missing from request: %v", sent)
	}
}

func TestDebugLogsReasoningAndAnswer(t *testing.T) {
	for _, tc := range []struct {
		debug, body string
		logged      bool
	}{
		{"1", `{"choices":[{"finish_reason":"stop","message":{"content":"3","reasoning_content":"clue fits word three"}}]}`, true},
		{"1", `{"choices":[{"finish_reason":"stop","message":{"content":"3","reasoning":"clue fits word three"}}]}`, true},
		{"0", `{"choices":[{"finish_reason":"stop","message":{"content":"3","reasoning_content":"clue fits word three"}}]}`, false},
	} {
		t.Setenv("DECRYPTO_AI_DEBUG", tc.debug)
		var out bytes.Buffer
		log.SetOutput(&out)
		p := NewOpenAIProvider("k", "http://model.invalid/v1", "test")
		p.Client = &http.Client{Transport: transport(func(r *http.Request) (*http.Response, error) {
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(tc.body)), Header: make(http.Header)}, nil
		})}
		_, err := p.Complete(context.Background(), nil)
		log.SetOutput(os.Stderr)
		if err != nil {
			t.Fatal(err)
		}
		got := strings.Contains(out.String(), "clue fits word three") && strings.Contains(out.String(), `answer: "3"`)
		if got != tc.logged {
			t.Fatalf("debug=%s logged=%v, log:\n%s", tc.debug, got, out.String())
		}
	}
}
