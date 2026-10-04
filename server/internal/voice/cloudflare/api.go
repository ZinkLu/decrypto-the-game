package cloudflare

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// api calls the Realtime SFU and, when the service has a TURN key, the TURN
// service. Both keep their secrets here: pages never see them.
type api struct {
	base, app, secret  string
	turnKey, turnToken string
	http               *http.Client
}

type description struct {
	Type string `json:"type"`
	SDP  string `json:"sdp"`
}

// track is a track of a session: one this session publishes ("local"), or one
// it receives from the session that publishes it ("remote").
type track struct {
	Location         string `json:"location"`
	Mid              string `json:"mid,omitempty"`
	SessionID        string `json:"sessionId,omitempty"`
	TrackName        string `json:"trackName,omitempty"`
	ErrorCode        string `json:"errorCode,omitempty"`
	ErrorDescription string `json:"errorDescription,omitempty"`
}

type tracksResponse struct {
	RequiresImmediateRenegotiation bool         `json:"requiresImmediateRenegotiation"`
	SessionDescription             *description `json:"sessionDescription"`
	Tracks                         []track      `json:"tracks"`
}

// iceServer is an entry of RTCConfiguration.iceServers, as the page passes it on.
type iceServer struct {
	URLs       []string `json:"urls"`
	Username   string   `json:"username,omitempty"`
	Credential string   `json:"credential,omitempty"`
}

// stun is enough to reach the SFU from most networks.
var stun = []iceServer{{URLs: []string{"stun:stun.cloudflare.com:3478"}}}

// failure is the error of a request the API refused or could not carry out.
type failure struct {
	status      int
	code, words string
}

func (f *failure) Error() string {
	return fmt.Sprintf("realtime: HTTP %d %s %s", f.status, f.code, f.words)
}

// gone reports a session that has expired or never existed.
func gone(err error) bool {
	f, ok := err.(*failure)
	return ok && (f.status == http.StatusNotFound || f.status == http.StatusGone)
}

func (a *api) call(ctx context.Context, method, url, token string, body, out any) error {
	var payload io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		payload = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, payload)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := a.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	data, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return err
	}
	// A request can fail as a whole even with a successful status.
	var refusal struct{ ErrorCode, ErrorDescription string }
	_ = json.Unmarshal(data, &refusal)
	if res.StatusCode/100 != 2 || refusal.ErrorCode != "" {
		return &failure{status: res.StatusCode, code: refusal.ErrorCode, words: refusal.ErrorDescription}
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(data, out)
}

func (a *api) session(id, path string) string {
	return a.base + "/apps/" + a.app + "/sessions/" + id + path
}

// newSession opens a session; it connects with the first tracks it is given.
func (a *api) newSession(ctx context.Context) (string, error) {
	var out struct{ SessionID string }
	if err := a.call(ctx, http.MethodPost, a.session("new", ""), a.secret, nil, &out); err != nil {
		return "", err
	}
	if out.SessionID == "" {
		return "", fmt.Errorf("realtime: no session ID")
	}
	return out.SessionID, nil
}

// addTracks publishes tracks with the page's offer, or, without one, receives
// tracks of other sessions: the SFU then returns an offer for the page.
func (a *api) addTracks(ctx context.Context, session string, offer *description, tracks []track) (tracksResponse, error) {
	body := struct {
		SessionDescription *description `json:"sessionDescription,omitempty"`
		Tracks             []track      `json:"tracks"`
	}{offer, tracks}
	var out tracksResponse
	err := a.call(ctx, http.MethodPost, a.session(session, "/tracks/new"), a.secret, body, &out)
	return out, err
}

// renegotiate completes an offer of the SFU with the page's answer.
func (a *api) renegotiate(ctx context.Context, session string, answer description) error {
	body := struct {
		SessionDescription description `json:"sessionDescription"`
	}{answer}
	return a.call(ctx, http.MethodPut, a.session(session, "/renegotiate"), a.secret, body, nil)
}

// closeTracks stops tracks of a session at once, without asking its page. A
// track that is already closed, or a session that is gone, is not an error.
func (a *api) closeTracks(ctx context.Context, session string, mids []string) error {
	if len(mids) == 0 {
		return nil
	}
	type closing struct {
		Mid string `json:"mid"`
	}
	body := struct {
		Tracks []closing `json:"tracks"`
		Force  bool      `json:"force"`
	}{Force: true}
	for _, mid := range mids {
		body.Tracks = append(body.Tracks, closing{mid})
	}
	var out tracksResponse
	err := a.call(ctx, http.MethodPut, a.session(session, "/tracks/close"), a.secret, body, &out)
	if gone(err) {
		return nil
	}
	if err != nil {
		return err
	}
	for _, t := range out.Tracks {
		if t.ErrorCode != "" && t.ErrorCode != "close_track_error" {
			return fmt.Errorf("realtime: closing track %s: %s %s", t.Mid, t.ErrorCode, t.ErrorDescription)
		}
	}
	return nil
}

// iceServers gives a page short-lived TURN credentials, or STUN alone when the
// service has no TURN key.
func (a *api) iceServers(ctx context.Context) ([]iceServer, error) {
	if a.turnKey == "" {
		return stun, nil
	}
	url := a.base + "/turn/keys/" + a.turnKey + "/credentials/generate-ice-servers"
	var out struct {
		ICEServers []struct {
			URLs       json.RawMessage `json:"urls"`
			Username   string          `json:"username"`
			Credential string          `json:"credential"`
		} `json:"iceServers"`
	}
	if err := a.call(ctx, http.MethodPost, url, a.turnToken, map[string]int{"ttl": 86400}, &out); err != nil {
		return nil, err
	}
	var servers []iceServer
	for _, s := range out.ICEServers {
		var urls []string
		if json.Unmarshal(s.URLs, &urls) != nil {
			var one string
			if json.Unmarshal(s.URLs, &one) != nil {
				continue
			}
			urls = []string{one}
		}
		// Browsers refuse port 53 and would only wait for it to time out.
		kept := urls[:0]
		for _, u := range urls {
			if !strings.Contains(u, ":53?") && !strings.HasSuffix(u, ":53") {
				kept = append(kept, u)
			}
		}
		if len(kept) > 0 {
			servers = append(servers, iceServer{URLs: kept, Username: s.Username, Credential: s.Credential})
		}
	}
	if len(servers) == 0 {
		return stun, nil
	}
	return servers, nil
}
