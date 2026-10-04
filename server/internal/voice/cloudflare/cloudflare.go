// Package cloudflare carries voices through the Cloudflare Realtime SFU.
//
// Each page holds one WebRTC session with the SFU. It publishes its microphone
// twice, as a "table" and a "team" track, and receives the tracks the plan lets
// it hear. Only this server, which keeps the app secret, can make a session
// receive a track, so a team's voice reaches its own team alone. The page
// chooses which of its two tracks carries sound; the other carries silence.
//
// A page and this server exchange signals of the form {"op": ..., "line": n}.
// From the page:
//
//	join                     start a line; the answer is "ice"
//	publish sdp table team   the offer for the two tracks, with their mids
//	connected                the session is connected
//	answer sdp               the answer to an "offer"
//	leave                    end the line
//
// From this server:
//
//	ice ice_servers          servers for the RTCPeerConnection
//	published sdp            the SFU's answer to "publish"
//	offer sdp tracks         the SFU's offer adding tracks: mid, speaker, channel
//	drop mids                tracks that stopped; their transceivers stay idle
//	failed                   the line is gone; the page may join again
//
// A line is one page's session, numbered so that late signals of an earlier
// line are ignored on both sides.
package cloudflare

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/ZinkLu/decrypto-the-game/server/internal/voice"
)

// Config names a Realtime SFU app and, optionally, a TURN key.
type Config struct {
	AppID, AppSecret     string
	TURNKeyID, TURNToken string
	// BaseURL is the API root; it is only changed by tests.
	BaseURL string
}

// FromEnv reads CLOUDFLARE_REALTIME_APP_ID and CLOUDFLARE_REALTIME_APP_SECRET,
// and the optional CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_KEY_TOKEN. It
// reports false when the app is not configured.
func FromEnv() (Config, bool) {
	c := Config{
		AppID:     strings.TrimSpace(os.Getenv("CLOUDFLARE_REALTIME_APP_ID")),
		AppSecret: strings.TrimSpace(os.Getenv("CLOUDFLARE_REALTIME_APP_SECRET")),
		TURNKeyID: strings.TrimSpace(os.Getenv("CLOUDFLARE_TURN_KEY_ID")),
		TURNToken: strings.TrimSpace(os.Getenv("CLOUDFLARE_TURN_KEY_TOKEN")),
	}
	if c.TURNKeyID == "" || c.TURNToken == "" {
		c.TURNKeyID, c.TURNToken = "", ""
	}
	return c, c.AppID != "" && c.AppSecret != ""
}

// Service is a voice.Service on the Realtime SFU. The lines of a room are
// handled in order, one signal or change at a time, which also keeps two
// requests from changing one session at once.
type Service struct {
	api  *api
	send voice.Outbox
	// Answer is how long a page has to answer an offer before its line is dropped.
	Answer time.Duration

	mu    sync.Mutex
	rooms map[string]*room
	lines int
}

// room is the voice of one game room. Only the goroutine running its queue
// touches anything but the queue.
type room struct {
	code   string
	plan   voice.Plan
	lines  map[string]*line
	joined map[string]time.Time // when each player last joined
	// gone holds lines hung up whose tracks the SFU still has to stop.
	gone    []*line
	queue   []func(*room)
	running bool
}

// line is one page's session.
type line struct {
	id      int
	player  string
	session string   // set once the page has published
	local   []string // mids of the two published tracks
	live    bool     // the page reported its session connected
	// heard holds the mid of every track this session receives.
	heard map[source]string
	// offer numbers the SFU's offers to the page; waiting is the one that
	// awaits the page's answer, or 0.
	offer, waiting int
	retries        int
}

// source names a published track by the session that publishes it.
type source struct {
	session string
	channel voice.Channel
}

// New makes a service that reaches pages through send.
func New(c Config, send voice.Outbox) *Service {
	base := c.BaseURL
	if base == "" {
		base = "https://rtc.live.cloudflare.com/v1"
	}
	return &Service{
		api: &api{base: strings.TrimRight(base, "/"), app: c.AppID, secret: c.AppSecret,
			turnKey: c.TURNKeyID, turnToken: c.TURNToken, http: &http.Client{Timeout: 15 * time.Second}},
		send:   send,
		Answer: 15 * time.Second,
		rooms:  map[string]*room{},
	}
}

func (s *Service) Client() string { return "cloudflare" }

// do queues work for a room and runs the queue if nothing runs it yet.
func (s *Service) do(code string, work func(*room)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r := s.rooms[code]
	if r == nil {
		r = &room{code: code, lines: map[string]*line{}, joined: map[string]time.Time{}}
		s.rooms[code] = r
	}
	r.queue = append(r.queue, work)
	if !r.running {
		r.running = true
		go s.run(r)
	}
}

// later queues work for a room after a while, unless the room is gone by then.
func (s *Service) later(r *room, wait time.Duration, work func(*room)) {
	time.AfterFunc(wait, func() {
		s.mu.Lock()
		alive := s.rooms[r.code] == r
		s.mu.Unlock()
		if alive {
			s.do(r.code, work)
		}
	})
}

func (s *Service) run(r *room) {
	for {
		s.mu.Lock()
		if len(r.queue) == 0 {
			r.running = false
			s.mu.Unlock()
			return
		}
		work := r.queue[0]
		r.queue = r.queue[1:]
		s.mu.Unlock()
		work(r)
	}
}

type fromPage struct {
	Op    string `json:"op"`
	Line  int    `json:"line"`
	SDP   string `json:"sdp"`
	Table string `json:"table"`
	Team  string `json:"team"`
}

type toPage struct {
	Op         string      `json:"op"`
	Line       int         `json:"line"`
	SDP        string      `json:"sdp,omitempty"`
	ICEServers []iceServer `json:"ice_servers,omitempty"`
	Tracks     []heard     `json:"tracks,omitempty"`
	Mids       []string    `json:"mids,omitempty"`
}

// heard tells a page whose voice a new transceiver carries.
type heard struct {
	Mid     string        `json:"mid"`
	Speaker string        `json:"speaker"`
	Channel voice.Channel `json:"channel"`
}

func (s *Service) Signal(code, player string, signal json.RawMessage) {
	var m fromPage
	if json.Unmarshal(signal, &m) != nil {
		return
	}
	s.do(code, func(r *room) {
		s.signal(r, player, m)
		s.reconcile(r)
	})
}

func (s *Service) Hear(code string, plan voice.Plan) {
	s.do(code, func(r *room) {
		r.plan = plan
		s.reconcile(r)
	})
}

func (s *Service) Hangup(code, player string) {
	s.do(code, func(r *room) {
		if l := r.lines[player]; l != nil {
			s.hangup(r, l)
			s.reconcile(r)
		}
	})
}

func (s *Service) Close(code string) {
	s.do(code, func(r *room) {
		for _, l := range r.sorted() {
			s.hangup(r, l)
		}
		s.release(r)
		r.plan = nil
		s.mu.Lock()
		if len(r.queue) == 0 && s.rooms[code] == r {
			delete(s.rooms, code)
		}
		s.mu.Unlock()
	})
}

func (r *room) sorted() []*line {
	lines := make([]*line, 0, len(r.lines))
	for _, l := range r.lines {
		lines = append(lines, l)
	}
	sort.Slice(lines, func(i, j int) bool { return lines[i].id < lines[j].id })
	return lines
}

func request() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 10*time.Second)
}

// signal handles a signal from a page. The caller reconciles afterwards.
func (s *Service) signal(r *room, player string, m fromPage) {
	l := r.lines[player]
	if m.Op == "join" {
		// Every line opens a session on the SFU: a page that keeps joining is refused.
		if time.Since(r.joined[player]) < 2*time.Second {
			s.send(r.code, player, toPage{Op: "failed"})
			return
		}
		r.joined[player] = time.Now()
		if l != nil {
			s.hangup(r, l)
		}
		s.mu.Lock()
		s.lines++
		l = &line{id: s.lines, player: player, heard: map[source]string{}}
		s.mu.Unlock()
		r.lines[player] = l
		ctx, cancel := request()
		servers, err := s.api.iceServers(ctx)
		cancel()
		if err != nil {
			log.Printf("voice: room %s: TURN credentials: %v; offering STUN alone", r.code, err)
			servers = stun
		}
		s.send(r.code, player, toPage{Op: "ice", Line: l.id, ICEServers: servers})
		return
	}
	if l == nil || m.Line != l.id {
		return // a late signal of a line that is gone
	}
	switch m.Op {
	case "publish":
		if l.session != "" || m.SDP == "" || m.Table == "" || m.Team == "" || m.Table == m.Team {
			s.fail(r, l, errors.New("the page published twice or without its tracks"))
			return
		}
		ctx, cancel := request()
		defer cancel()
		session, err := s.api.newSession(ctx)
		if err != nil {
			s.fail(r, l, err)
			return
		}
		res, err := s.api.addTracks(ctx, session, &description{Type: "offer", SDP: m.SDP}, []track{
			{Location: "local", Mid: m.Table, TrackName: string(voice.Table)},
			{Location: "local", Mid: m.Team, TrackName: string(voice.Team)},
		})
		if err == nil && res.SessionDescription == nil {
			err = errors.New("realtime: no answer to the offer")
		}
		for _, t := range res.Tracks {
			if err == nil && t.ErrorCode != "" {
				err = errors.New("realtime: publishing " + t.TrackName + ": " + t.ErrorCode + " " + t.ErrorDescription)
			}
		}
		// Even a failed session may hold tracks to close.
		l.session, l.local = session, []string{m.Table, m.Team}
		if err != nil {
			s.fail(r, l, err)
			return
		}
		log.Printf("voice: room %s: player %s speaks through session %s", r.code, player, session)
		s.send(r.code, player, toPage{Op: "published", Line: l.id, SDP: res.SessionDescription.SDP})
	case "connected":
		if l.session == "" || len(l.local) == 0 || l.live {
			return
		}
		l.live = true
	case "answer":
		if l.waiting == 0 || m.SDP == "" {
			return
		}
		l.waiting = 0
		ctx, cancel := request()
		err := s.api.renegotiate(ctx, l.session, description{Type: "answer", SDP: m.SDP})
		cancel()
		if err != nil {
			s.fail(r, l, err)
		}
	case "leave":
		s.hangup(r, l)
	}
}

// fail ends a line that cannot go on and tells its page, which may join again.
// Listeners lose its tracks with the next reconcile.
func (s *Service) fail(r *room, l *line, err error) {
	log.Printf("voice: room %s: line %d of player %s fails: %v", r.code, l.id, l.player, err)
	s.hangup(r, l)
	s.send(r.code, l.player, toPage{Op: "failed", Line: l.id})
}

// hangup forgets a line. Listeners lose its tracks with the next reconcile,
// which then stops everything the line published and received: no one hears
// it any more, and a page that stays connected hears nothing either.
func (s *Service) hangup(r *room, l *line) {
	if r.lines[l.player] == l {
		delete(r.lines, l.player)
	}
	l.waiting = 0
	l.live = false
	if l.session != "" {
		r.gone = append(r.gone, l)
	}
}

// release stops the tracks of the lines hung up.
func (s *Service) release(r *room) {
	for _, l := range r.gone {
		mids := append([]string(nil), l.local...)
		for _, mid := range l.heard {
			mids = append(mids, mid)
		}
		ctx, cancel := request()
		if err := s.api.closeTracks(ctx, l.session, mids); err != nil {
			log.Printf("voice: room %s: closing line %d: %v", r.code, l.id, err)
		}
		cancel()
	}
	r.gone = nil
}

// reconcile makes every connected session receive what the plan lets its
// player hear from the players who are connected, and nothing else. A line
// that fails on the way is gone for the next pass, which takes its tracks from
// the lines before it.
func (s *Service) reconcile(r *room) {
	for again := true; again; {
		again = false
		lines := r.sorted()
		// What may no longer be heard stops on every page at once, even while an
		// offer waits; the SFU follows, one session at a time.
		stopping := map[*line][]string{}
		for _, l := range lines {
			if l.live && r.lines[l.player] == l {
				stopping[l] = s.drop(r, l)
			}
		}
		for _, l := range lines {
			if mids := stopping[l]; len(mids) > 0 && r.lines[l.player] == l {
				ctx, cancel := request()
				err := s.api.closeTracks(ctx, l.session, mids)
				cancel()
				if err != nil {
					s.fail(r, l, err)
					again = true
				}
			}
		}
		for _, l := range lines {
			if l.live && r.lines[l.player] == l && l.waiting == 0 && !s.pull(r, l, s.want(r, l)) {
				again = true
			}
		}
	}
	s.release(r)
}

// want is what a line may hear from the lines that are connected.
func (s *Service) want(r *room, l *line) map[source]voice.Source {
	want := map[source]voice.Source{}
	for _, src := range r.plan[l.player] {
		if speaker := r.lines[src.Speaker]; speaker != nil && speaker != l && speaker.live {
			want[source{speaker.session, src.Channel}] = src
		}
	}
	return want
}

// drop forgets the tracks a line receives but may no longer hear, and tells
// its page to stop playing them. It returns their mids, for the SFU to close.
func (s *Service) drop(r *room, l *line) []string {
	want := s.want(r, l)
	var mids []string
	for key, mid := range l.heard {
		if _, ok := want[key]; !ok {
			mids = append(mids, mid)
			delete(l.heard, key)
		}
	}
	if len(mids) == 0 {
		return nil
	}
	sort.Strings(mids)
	s.send(r.code, l.player, toPage{Op: "drop", Line: l.id, Mids: mids})
	return mids
}

// pull makes a line receive what it may hear and does not yet, and sends the
// SFU's offer to its page. It reports whether the line goes on.
func (s *Service) pull(r *room, l *line, want map[source]voice.Source) bool {
	var add []track
	for key := range want {
		if _, ok := l.heard[key]; !ok {
			add = append(add, track{Location: "remote", SessionID: key.session, TrackName: string(key.channel)})
		}
	}
	if len(add) == 0 {
		return true
	}
	sort.Slice(add, func(i, j int) bool {
		if add[i].SessionID != add[j].SessionID {
			return add[i].SessionID < add[j].SessionID
		}
		return add[i].TrackName < add[j].TrackName
	})
	ctx, cancel := request()
	res, err := s.api.addTracks(ctx, l.session, nil, add)
	cancel()
	if err != nil {
		s.fail(r, l, err)
		return false
	}
	var tracks []heard
	missed := false
	for i, t := range res.Tracks {
		key := source{t.SessionID, voice.Channel(t.TrackName)}
		if (key.session == "" || key.channel == "") && i < len(add) {
			// Results come in the order asked, should one leave out its publisher.
			key = source{add[i].SessionID, voice.Channel(add[i].TrackName)}
		}
		src, ok := want[key]
		if t.ErrorCode != "" || t.Mid == "" || !ok {
			log.Printf("voice: room %s: line %d cannot receive %s of session %s: %s %s", r.code, l.id, t.TrackName, t.SessionID, t.ErrorCode, t.ErrorDescription)
			missed = true
			continue
		}
		l.heard[key] = t.Mid
		tracks = append(tracks, heard{Mid: t.Mid, Speaker: src.Speaker, Channel: src.Channel})
	}
	if missed && l.retries < 5 {
		// A track that has only just started may not be ready yet.
		l.retries++
		s.later(r, 2*time.Second, s.reconcile)
	} else if !missed {
		l.retries = 0
	}
	if !res.RequiresImmediateRenegotiation || res.SessionDescription == nil {
		if len(tracks) > 0 {
			s.fail(r, l, errors.New("realtime: new tracks without an offer"))
			return false
		}
		return true
	}
	l.offer++
	l.waiting = l.offer
	waiting := l.offer
	s.later(r, s.Answer, func(r *room) {
		if r.lines[l.player] == l && l.waiting == waiting {
			s.fail(r, l, errors.New("the page did not answer the offer"))
			s.reconcile(r)
		}
	})
	s.send(r.code, l.player, toPage{Op: "offer", Line: l.id, SDP: res.SessionDescription.SDP, Tracks: tracks})
	return true
}
