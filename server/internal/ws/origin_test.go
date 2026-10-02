package ws

import (
	"net/http/httptest"
	"testing"
)

func TestWebSocketOriginPolicy(t *testing.T) {
	t.Setenv("DECRYPTO_ALLOWED_ORIGINS", "https://staging.example")
	tests := []struct {
		name, host, origin string
		want               bool
	}{
		{"same site", "play.example", "https://play.example", true},
		{"different site", "play.example", "https://other.example", false},
		{"invalid origin", "play.example", "null", false},
		{"local Vite", "localhost:8080", "http://localhost:3000", true},
		{"explicit staging origin", "play.example", "https://staging.example", true},
		{"no browser origin", "play.example", "", true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("GET", "http://"+tc.host+"/ws", nil)
			if tc.origin != "" {
				r.Header.Set("Origin", tc.origin)
			}
			if got := allowedOrigin(r); got != tc.want {
				t.Fatalf("allowedOrigin(%q, %q) = %v, want %v", tc.host, tc.origin, got, tc.want)
			}
		})
	}
}
