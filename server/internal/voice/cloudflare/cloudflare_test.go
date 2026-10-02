package cloudflare

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/ZinkLu/decrypto-the-game/server/internal/voice"
)

// sfu stands in for the Realtime API: it keeps sessions and the tracks they
// publish and receive, as far as this service can tell them apart.
type sfu struct {
	t        *testing.T
	mu       sync.Mutex
	sessions map[string]*session
	order    []string
	failNew  bool
	// anonymous leaves the publisher out of the tracks a session receives.
	anonymous bool
}

type session struct {
	published map[string]string // mid by track name
	received  map[string]string // "publisher/track" by mid
	closed    map[string]bool
	mids      int
	offered   bool
}

func newSFU(t *testing.T) (*sfu, *httptest.Server) {
	f := &sfu{t: t, sessions: map[string]*session{}}
	web := httptest.NewServer(http.HandlerFunc(f.serve))
	t.Cleanup(web.Close)
	return f, web
}

func (f *sfu) serve(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	reply := func(status int, body any) {
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(body)
	}
	if strings.HasPrefix(r.URL.Path, "/v1/turn/") {
		if r.Header.Get("Authorization") != "Bearer turn-token" || r.URL.Path != "/v1/turn/keys/turn-key/credentials/generate-ice-servers" {
			reply(http.StatusUnauthorized, map[string]string{"errorCode": "unauthorized"})
			return
		}
		reply(http.StatusCreated, map[string]any{"iceServers": []map[string]any{
			{"urls": []string{"stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"}},
			{"urls": []string{"turn:turn.cloudflare.com:3478?transport=udp", "turn:turn.cloudflare.com:53?transport=udp"}, "username": "u", "credential": "c"},
		}})
		return
	}
	if r.Header.Get("Authorization") != "Bearer app-secret" {
		reply(http.StatusUnauthorized, map[string]string{"errorCode": "unauthorized"})
		return
	}
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/v1/apps/app/sessions/"), "/")
	if parts[0] == "new" {
		if f.failNew {
			reply(http.StatusServiceUnavailable, map[string]string{"errorCode": "busy"})
			return
		}
		id := fmt.Sprintf("s%d", len(f.order)+1)
		f.order = append(f.order, id)
		f.sessions[id] = &session{published: map[string]string{}, received: map[string]string{}, closed: map[string]bool{}}
		reply(http.StatusCreated, map[string]string{"sessionId": id})
		return
	}
	s := f.sessions[parts[0]]
	if s == nil {
		reply(http.StatusNotFound, map[string]string{"errorCode": "session_error"})
		return
	}
	var body struct {
		SessionDescription *description
		Tracks             []track
		Force              bool
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	switch r.Method + " " + parts[1] {
	case "POST tracks":
		var out []track
		if body.SessionDescription != nil {
			for _, t := range body.Tracks {
				s.published[t.TrackName] = t.Mid
				out = append(out, track{Mid: t.Mid, TrackName: t.TrackName})
			}
			reply(http.StatusOK, tracksResponse{SessionDescription: &description{"answer", "answer of " + parts[0]}, Tracks: out})
			return
		}
		for _, t := range body.Tracks {
			p := f.sessions[t.SessionID]
			if p == nil || p.published[t.TrackName] == "" || p.closed[p.published[t.TrackName]] {
				out = append(out, track{SessionID: t.SessionID, TrackName: t.TrackName, ErrorCode: "not_found"})
				continue
			}
			s.mids++
			mid := fmt.Sprint(s.mids + 1)
			s.received[mid] = t.SessionID + "/" + t.TrackName
			if f.anonymous {
				out = append(out, track{Mid: mid})
			} else {
				out = append(out, track{Mid: mid, SessionID: t.SessionID, TrackName: t.TrackName})
			}
		}
		s.offered = true
		reply(http.StatusOK, tracksResponse{RequiresImmediateRenegotiation: true, SessionDescription: &description{"offer", "offer of " + parts[0]}, Tracks: out})
	case "PUT renegotiate":
		if !s.offered || body.SessionDescription == nil || body.SessionDescription.Type != "answer" {
			f.t.Errorf("renegotiating %s without an offer", parts[0])
		}
		s.offered = false
		reply(http.StatusOK, map[string]any{})
	case "PUT tracks":
		if !body.Force {
			f.t.Errorf("closing tracks of %s with an exchange", parts[0])
		}
		var out []track
		for _, t := range body.Tracks {
			s.closed[t.Mid] = true
			out = append(out, track{Mid: t.Mid})
		}
		reply(http.StatusOK, tracksResponse{Tracks: out})
	default:
		reply(http.StatusNotFound, map[string]string{"errorCode": "no_route"})
	}
}

// hears lists what each publishing session receives and has not closed, as
// "publisher's session/track".
func (f *sfu) hears() map[string][]string {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := map[string][]string{}
	for id, s := range f.sessions {
		heard := []string{}
		for mid, what := range s.received {
			if !s.closed[mid] && !f.sessions[strings.Split(what, "/")[0]].closed[f.sessions[strings.Split(what, "/")[0]].published[strings.Split(what, "/")[1]]] {
				heard = append(heard, what)
			}
		}
		sort.Strings(heard)
		out[id] = heard
	}
	return out
}

// A page is one player's browser as the service sees it.
type page struct {
	t      *testing.T
	svc    *Service
	player string
	inbox  chan toPage
	line   int
	mids   map[string]heard
}

type pages map[string]*page

func (ps pages) outbox(t *testing.T) voice.Outbox {
	return func(room, player string, signal any) {
		if room != "R" {
			t.Errorf("signal for room %s", room)
		}
		data, _ := json.Marshal(signal)
		if strings.Contains(string(data), "secret") || strings.Contains(string(data), "turn-token") {
			t.Errorf("a secret reached %s: %s", player, data)
		}
		var m toPage
		_ = json.Unmarshal(data, &m)
		ps[player].inbox <- m
	}
}

func (p *page) send(op string, fields map[string]any) {
	m := map[string]any{"op": op, "line": p.line}
	for k, v := range fields {
		m[k] = v
	}
	data, _ := json.Marshal(m)
	p.svc.Signal("R", p.player, data)
}

func (p *page) next(op string) toPage {
	p.t.Helper()
	select {
	case m := <-p.inbox:
		if m.Op != op {
			p.t.Fatalf("%s expected %s, got %+v", p.player, op, m)
		}
		return m
	case <-time.After(2 * time.Second):
		p.t.Fatalf("%s expected %s, got nothing", p.player, op)
	}
	return toPage{}
}

// until skips signals until the one of the given op.
func (p *page) until(op string) toPage {
	p.t.Helper()
	for {
		select {
		case m := <-p.inbox:
			if m.Op == op {
				return m
			}
		case <-time.After(2 * time.Second):
			p.t.Fatalf("%s expected %s, got nothing", p.player, op)
			return toPage{}
		}
	}
}

// connect joins, publishes and reports a connected session.
func (p *page) connect() {
	p.t.Helper()
	p.send("join", nil)
	p.line = p.next("ice").Line
	p.send("publish", map[string]any{"sdp": "offer of " + p.player, "table": "0", "team": "1"})
	if m := p.next("published"); m.SDP == "" {
		p.t.Fatalf("%s got no answer", p.player)
	}
	p.send("connected", nil)
}

// settle answers every offer and applies every drop until the service is quiet.
func settle(t *testing.T, svc *Service, ps pages) {
	t.Helper()
	for quiet := 0; quiet < 3; {
		time.Sleep(20 * time.Millisecond)
		quiet++
		for _, name := range []string{"ann", "bob", "cat"} {
			p := ps[name]
			for len(p.inbox) > 0 {
				quiet = 0
				m := <-p.inbox
				switch m.Op {
				case "offer":
					for _, h := range m.Tracks {
						p.mids[h.Mid] = h
					}
					p.send("answer", map[string]any{"sdp": "answer of " + name})
				case "drop":
					for _, mid := range m.Mids {
						delete(p.mids, mid)
					}
				case "failed":
					t.Fatalf("%s failed", name)
				}
			}
		}
	}
}

// heard is what a page was told it hears, as "speaker/channel".
func (p *page) heard() []string {
	out := []string{}
	for _, h := range p.mids {
		out = append(out, h.Speaker+"/"+string(h.Channel))
	}
	sort.Strings(out)
	return out
}

func plan(teams map[string]string) voice.Plan {
	out := voice.Plan{}
	for listener, own := range teams {
		out[listener] = nil
		for speaker, team := range teams {
			if speaker == listener {
				continue
			}
			out[listener] = append(out[listener], voice.Source{Speaker: speaker, Channel: voice.Table})
			if team == own {
				out[listener] = append(out[listener], voice.Source{Speaker: speaker, Channel: voice.Team})
			}
		}
	}
	return out
}

func setup(t *testing.T) (*sfu, *Service, pages) {
	f, web := newSFU(t)
	ps := pages{}
	svc := New(Config{AppID: "app", AppSecret: "app-secret", BaseURL: web.URL + "/v1"}, ps.outbox(t))
	for _, name := range []string{"ann", "bob", "cat"} {
		ps[name] = &page{t: t, svc: svc, player: name, inbox: make(chan toPage, 64), mids: map[string]heard{}}
	}
	return f, svc, ps
}

func TestTeamVoiceReachesTheTeamAlone(t *testing.T) {
	f, svc, ps := setup(t)
	svc.Hear("R", plan(map[string]string{"ann": "A", "bob": "B", "cat": "A"}))
	for _, name := range []string{"ann", "bob", "cat"} {
		ps[name].connect()
	}
	settle(t, svc, ps)
	// Sessions are numbered in the order the pages published.
	want := map[string][]string{
		"s1": {"s2/table", "s3/table", "s3/team"},
		"s2": {"s1/table", "s3/table"},
		"s3": {"s1/table", "s1/team", "s2/table"},
	}
	if got := f.hears(); !reflect.DeepEqual(got, want) {
		t.Fatalf("sessions receive %v, want %v", got, want)
	}
	if got := ps["bob"].heard(); !reflect.DeepEqual(got, []string{"ann/table", "cat/table"}) {
		t.Fatalf("bob was told he hears %v", got)
	}

	// Cat changes sides: Ann loses her team voice at once, Bob gains it.
	svc.Hear("R", plan(map[string]string{"ann": "A", "bob": "B", "cat": "B"}))
	settle(t, svc, ps)
	want = map[string][]string{
		"s1": {"s2/table", "s3/table"},
		"s2": {"s1/table", "s3/table", "s3/team"},
		"s3": {"s1/table", "s2/table", "s2/team"},
	}
	if got := f.hears(); !reflect.DeepEqual(got, want) {
		t.Fatalf("after the change sessions receive %v, want %v", got, want)
	}
	if got := ps["ann"].heard(); !reflect.DeepEqual(got, []string{"bob/table", "cat/table"}) {
		t.Fatalf("ann was told she hears %v", got)
	}

	// Bob leaves: his tracks stop, and so does what he received.
	svc.Hangup("R", "bob")
	settle(t, svc, ps)
	want = map[string][]string{
		"s1": {"s3/table"},
		"s2": {},
		"s3": {"s1/table"},
	}
	if got := f.hears(); !reflect.DeepEqual(got, want) {
		t.Fatalf("after Bob left sessions receive %v, want %v", got, want)
	}
	if got := ps["cat"].heard(); !reflect.DeepEqual(got, []string{"ann/table"}) {
		t.Fatalf("cat was told she hears %v", got)
	}
}

func TestTracksAreKnownByTheirOrder(t *testing.T) {
	f, svc, ps := setup(t)
	f.anonymous = true
	svc.Hear("R", plan(map[string]string{"ann": "A", "bob": "B", "cat": "A"}))
	for _, name := range []string{"ann", "bob", "cat"} {
		ps[name].connect()
	}
	settle(t, svc, ps)
	if got := ps["ann"].heard(); !reflect.DeepEqual(got, []string{"bob/table", "cat/table", "cat/team"}) {
		t.Fatalf("ann was told she hears %v", got)
	}
	if got := ps["bob"].heard(); !reflect.DeepEqual(got, []string{"ann/table", "cat/table"}) {
		t.Fatalf("bob was told he hears %v", got)
	}
}

func TestRejoiningReplacesTheLine(t *testing.T) {
	f, svc, ps := setup(t)
	svc.Hear("R", plan(map[string]string{"ann": "A", "bob": "A", "cat": "B"}))
	ps["ann"].connect()
	ps["bob"].connect()
	settle(t, svc, ps)
	first := ps["bob"].line
	time.Sleep(2 * time.Second) // joining again at once is refused
	ps["bob"].mids = map[string]heard{}
	ps["bob"].connect()
	settle(t, svc, ps)
	if ps["bob"].line == first {
		t.Fatal("the line was not replaced")
	}
	want := map[string][]string{"s1": {"s3/table", "s3/team"}, "s2": {}, "s3": {"s1/table", "s1/team"}}
	if got := f.hears(); !reflect.DeepEqual(got, want) {
		t.Fatalf("sessions receive %v, want %v", got, want)
	}
	// A late answer of the old line changes nothing.
	ps["bob"].line = first
	ps["bob"].send("answer", map[string]any{"sdp": "late"})
	settle(t, svc, ps)
}

func TestJoiningAgainAtOnceIsRefused(t *testing.T) {
	_, svc, ps := setup(t)
	svc.Hear("R", plan(map[string]string{"ann": "A"}))
	ps["ann"].send("join", nil)
	ps["ann"].next("ice")
	ps["ann"].send("join", nil)
	if m := ps["ann"].next("failed"); m.Line != 0 {
		t.Fatalf("the refusal names line %d", m.Line)
	}
}

func TestAnUnansweredOfferEndsTheLine(t *testing.T) {
	f, svc, ps := setup(t)
	svc.Answer = 50 * time.Millisecond
	svc.Hear("R", plan(map[string]string{"ann": "A", "bob": "A"}))
	ps["ann"].connect()
	ps["bob"].connect()
	// Neither page answers: both lines fail, and nothing is received.
	ps["ann"].next("offer")
	ps["bob"].next("offer")
	ps["ann"].until("failed")
	ps["bob"].until("failed")
	time.Sleep(50 * time.Millisecond)
	for id, heard := range f.hears() {
		if len(heard) != 0 {
			t.Fatalf("%s still receives %v", id, heard)
		}
	}
}

func TestAFailedSessionTellsThePage(t *testing.T) {
	f, svc, ps := setup(t)
	f.failNew = true
	svc.Hear("R", plan(map[string]string{"ann": "A"}))
	ps["ann"].send("join", nil)
	ps["ann"].line = ps["ann"].next("ice").Line
	ps["ann"].send("publish", map[string]any{"sdp": "offer", "table": "0", "team": "1"})
	if m := ps["ann"].next("failed"); m.Line != ps["ann"].line {
		t.Fatalf("failed names line %d", m.Line)
	}
}

func TestTURNCredentialsLeaveOutPort53(t *testing.T) {
	_, web := newSFU(t)
	ps := pages{"ann": {inbox: make(chan toPage, 4)}}
	svc := New(Config{AppID: "app", AppSecret: "app-secret", TURNKeyID: "turn-key", TURNToken: "turn-token", BaseURL: web.URL + "/v1"}, ps.outbox(t))
	ps["ann"].t, ps["ann"].svc, ps["ann"].player = t, svc, "ann"
	ps["ann"].send("join", nil)
	m := ps["ann"].next("ice")
	want := []iceServer{
		{URLs: []string{"stun:stun.cloudflare.com:3478"}},
		{URLs: []string{"turn:turn.cloudflare.com:3478?transport=udp"}, Username: "u", Credential: "c"},
	}
	if !reflect.DeepEqual(m.ICEServers, want) {
		t.Fatalf("ice servers %+v", m.ICEServers)
	}
}
