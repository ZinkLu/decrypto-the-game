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
