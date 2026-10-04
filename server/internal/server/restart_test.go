package server

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/ZinkLu/decrypto-the-game/server/internal/game"
	"github.com/ZinkLu/decrypto-the-game/server/internal/room"
	"github.com/ZinkLu/decrypto-the-game/server/internal/store"
	"github.com/ZinkLu/decrypto-the-game/server/internal/store/sqlite"
	"github.com/ZinkLu/decrypto-the-game/server/internal/ws"
	"github.com/gorilla/websocket"
)

func TestMain(m *testing.M) {
	game.RegisterHandlers()
	game.DefaultTimings.BetweenRounds = 10 * time.Millisecond
	os.Exit(m.Run())
}

// A process is one run of the server on a database file.
type process struct {
	t       *testing.T
	file    *sqlite.Store
	handler *Handler
	web     *httptest.Server
	dead    atomic.Bool
}

func boot(t *testing.T, db string) *process {
	t.Helper()
	return bootWith(t, db, 20*time.Second, 10*time.Minute)
}

// bootWith runs a server that keeps seats and rooms for the given times.
func bootWith(t *testing.T, db string, seatGrace, roomGrace time.Duration) *process {
	t.Helper()
	return bootOn(t, db, func(file store.Rooms) store.Rooms { return file }, seatGrace, roomGrace)
}

// bootOn runs a server whose store is the database file as seen through wrap.
func bootOn(t *testing.T, db string, wrap func(store.Rooms) store.Rooms, seatGrace, roomGrace time.Duration) *process {
	t.Helper()
	file, err := sqlite.Open(db)
	if err != nil {
		t.Fatal(err)
	}
	p := &process{t: t, file: file}
	p.handler = NewHandler(room.NewManager(), nil, wrap(file))
	p.handler.SeatGrace, p.handler.RoomGrace = seatGrace, roomGrace
	hub := ws.NewHub(func(c *ws.Client, m ws.ClientMessage) {
		if !p.dead.Load() {
			p.handler.HandleMessage(c, m)
		}
	})
	p.handler.Hub = hub
	if err := p.handler.Restore(); err != nil {
		t.Fatal(err)
	}
	go hub.Run()
	p.web = httptest.NewServer(http.HandlerFunc(hub.ServeWS))
	t.Cleanup(p.kill)
	return p
}

// kill ends the process as a crash would: from here on it handles nothing,
// stores nothing, and its games stop where they are.
func (p *process) kill() {
	if p.dead.Swap(true) {
		return
	}
	open, err := p.file.OpenRooms()
	if err != nil {
		p.t.Error(err)
	}
	for _, r := range open {
		if b, ok := game.GetBridge(r.Code); ok {
			b.Stop()
			game.RemoveBridge(r.Code)
		}
	}
	time.Sleep(20 * time.Millisecond)
	p.file.Close()
	p.web.Close()
}

// A client is one browser tab. It keeps what the server told it, as the page does.
type client struct {
	t    *testing.T
	name string
	conn *websocket.Conn

	ID, Code, Token string
	Voice           string
	Room            ws.RoomStateData
	Words           []string
	Team            string
	Phase           ws.PhaseChangeData
	Clues           []string
	Result          ws.RoundResultData
	Answered        []ws.ActionSubmittedData
	Progress        []ws.PlayerProgressData
	Over            *ws.GameOverData
	Sync            *ws.FullSyncData
	Refused         *ws.ErrorData
}

func (p *process) connect(name string) *client {
	p.t.Helper()
	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(p.web.URL, "http"), nil)
	if err != nil {
		p.t.Fatal(err)
	}
	p.t.Cleanup(func() { conn.Close() })
	return &client{t: p.t, name: name, conn: conn}
}

func (c *client) send(typ string, data any) {
	c.t.Helper()
	if err := c.conn.WriteJSON(map[string]any{"type": typ, "data": data}); err != nil {
		c.t.Fatalf("%s sends %s: %v", c.name, typ, err)
	}
}

// until reads what the server sends until the condition holds.
func (c *client) until(what string, holds func() bool) {
	c.t.Helper()
	c.conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	for !holds() {
		var m struct {
			Type string          `json:"type"`
			Data json.RawMessage `json:"data"`
		}
		if err := c.conn.ReadJSON(&m); err != nil {
			c.t.Fatalf("%s waits for %s: %v", c.name, what, err)
		}
		into := func(v any) {
			if err := json.Unmarshal(m.Data, v); err != nil {
				c.t.Fatalf("%s reads %s %s: %v", c.name, m.Type, m.Data, err)
			}
		}
		switch m.Type {
		case "room_created", "room_resumed":
			var d ws.RoomCreatedData
			into(&d)
			c.ID, c.Code, c.Voice = d.MyPlayerID, d.RoomCode, d.Voice
			if d.ResumeToken != "" {
				c.Token = d.ResumeToken
			}
		case "room_state":
			c.Room = ws.RoomStateData{}
			into(&c.Room)
		case "game_start":
			var d ws.GameStartData
			into(&d)
			c.Words, c.Team = d.Words, d.YourTeam
		case "phase_change":
			c.Phase = ws.PhaseChangeData{}
			into(&c.Phase)
			c.Clues = c.Phase.Clues
		case "clues_submitted":
			var d ws.PhaseChangeData
			into(&d)
			c.Clues = d.Clues
		case "round_result":
			c.Result = ws.RoundResultData{}
			into(&c.Result)
		case "action_submitted":
			var d ws.ActionSubmittedData
			into(&d)
			c.Answered = append(c.Answered, d)
		case "player_progress":
			var d ws.PlayerProgressData
			into(&d)
			c.Progress = append(c.Progress, d)
		case "game_over":
			c.Over = &ws.GameOverData{}
			into(c.Over)
		case "full_sync":
			c.Sync = &ws.FullSyncData{}
			into(c.Sync)
		case "error":
			c.Refused = &ws.ErrorData{}
			into(c.Refused)
		}
	}
}

func (c *client) inPhase(round int, phase string) {
	c.t.Helper()
	c.until(phase, func() bool { return c.Phase.Round == round && c.Phase.Phase == phase })
}

// answered reports whether the client was told that a team gave its answer.
func (c *client) answered(round int, action string) bool {
	for _, d := range c.Answered {
		if d.Round == round && d.Action == action {
			return true
		}
	}
	return false
}

// lastProgress is a seat's latest progress in a particular round and action.
func (c *client) lastProgress(round int, action, playerID string) *ws.PlayerProgressData {
	for i := len(c.Progress) - 1; i >= 0; i-- {
		if p := c.Progress[i]; p.Round == round && p.Action == action && p.PlayerID == playerID {
			return &c.Progress[i]
		}
	}
	return nil
}

// resume opens a new connection for the seat this client held.
func (p *process) resume(old *client) *client {
	p.t.Helper()
	c := p.connect(old.name)
	c.send("resume_room", map[string]any{"room_code": old.Code, "resume_token": old.Token})
	c.until("the room or a refusal", func() bool { return c.Sync != nil || c.Refused != nil })
	c.Token = old.Token
	return c
}

const (
	tokenAnn = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	tokenBob = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	tokenAlf = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
)

// lobby opens a room with Ann, Alf and an AI on team A, Bob and Bea on team B.
func lobby(t *testing.T, p *process) (ann, alf, bob, bea *client) {
	t.Helper()
	ann = openRoom(t, p)
	alf, bob, bea = fillRoom(t, p, ann)
	return
}

// openRoom has Ann open a room, in which she sits alone.
func openRoom(t *testing.T, p *process) *client {
	t.Helper()
	t.Setenv("OPENAI_API_KEY", "")
	t.Setenv("ANTHROPIC_API_KEY", "")
	ann := p.connect("Ann")
	ann.send("create_room", map[string]any{"nickname": "Ann", "device_token": tokenAnn})
	ann.until("the room", func() bool { return ann.Code != "" })
	return ann
}

// fillRoom seats Bob, Alf and Bea, and an AI next to Ann.
func fillRoom(t *testing.T, p *process, ann *client) (alf, bob, bea *client) {
	t.Helper()
	join := func(name, token string) *client {
		c := p.connect(name)
		c.send("join_room", map[string]any{"room_code": ann.Code, "nickname": name, "device_token": token})
		c.until("a seat", func() bool { return c.ID != "" && len(c.Room.Players) > 0 })
		return c
	}
	bob = join("Bob", tokenBob)
	alf = join("Alf", tokenAlf)
	bea = join("Bea", "not a device token")
	ann.send("add_ai", map[string]any{"team": "A"})
	ann.until("everyone seated", func() bool { return len(ann.Room.TeamA) == 3 && len(ann.Room.TeamB) == 2 && ann.Room.CanStart })
	return
}

// seats names the players in order, and tells who is offline.
func seats(players []ws.PlayerInfo) []string {
	out := []string{}
	for _, p := range players {
		name := p.Nickname
		if p.IsAI {
			name = "AI"
		}
		if p.Disconnected {
			name += " (offline)"
		}
		out = append(out, name)
	}
	return out
}

func query(t *testing.T, db, sqlText string) [][]string {
	t.Helper()
	conn, err := sql.Open("sqlite", db)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	rows, err := conn.Query(sqlText)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	columns, _ := rows.Columns()
	var out [][]string
	for rows.Next() {
		values := make([]sql.NullString, len(columns))
		targets := make([]any, len(columns))
		for i := range values {
			targets[i] = &values[i]
		}
		if err := rows.Scan(targets...); err != nil {
			t.Fatal(err)
		}
		row := make([]string, len(columns))
		for i, v := range values {
			row[i] = v.String
		}
		out = append(out, row)
	}
	return out
}

func TestGameSurvivesARestart(t *testing.T) {
	db := filepath.Join(t.TempDir(), "decrypto.db")
	first := boot(t, db)
	ann, alf, bob, bea := lobby(t, first)
	everyone := []*client{ann, alf, bob, bea}
	ann.send("start_game", nil)

	// Round 1: Ann encrypts, Alf decodes. Round 2: Bob encrypts, Bea decodes
	// wrongly. Round 3: Alf encrypts; Bob intercepts at once while Ann is still
	// decoding.
	for _, c := range everyone {
		c.inPhase(1, "encrypting")
	}
	secret := ann.Phase.SecretDigits
	ann.send("submit_clues", map[string]any{"round": 1, "clues": []string{"one", "two", "three"}})
	alf.inPhase(1, "guess")
	alf.send("submit_decrypt", map[string]any{"round": 1, "guess": secret})

	bob.inPhase(2, "encrypting")
	secret = bob.Phase.SecretDigits
	bob.send("submit_clues", map[string]any{"round": 2, "clues": []string{"uno", "dos", "tres"}})
	bea.inPhase(2, "guess")
	bea.send("submit_decrypt", map[string]any{"round": 2, "guess": []int{secret[1], secret[0], secret[2]}})

	alf.inPhase(3, "encrypting")
	secret = alf.Phase.SecretDigits
	alf.send("submit_clues", map[string]any{"round": 3, "clues": []string{"un", "deux", "trois"}})
	for _, c := range everyone {
		c.inPhase(3, "guess")
	}
	// Ann's picks reach her team, and Alf, who sees the code; team B learns
	// only that she is working on the third slot.
	picks := []int{secret[0], secret[1], 0}
	ann.send("progress", map[string]any{"round": 3, "action": "decrypt", "state": "editing", "step": 2, "focus": 3, "guesses": picks, "total": 3})
	alf.until("Ann's picks", func() bool { return alf.lastProgress(3, "decrypt", ann.ID) != nil })
	bob.until("Ann's progress", func() bool { return bob.lastProgress(3, "decrypt", ann.ID) != nil })
	if got := alf.lastProgress(3, "decrypt", ann.ID); !reflect.DeepEqual(got.Guesses, picks) || got.Player != "Ann" {
		t.Fatalf("Alf received %+v", got)
	}
	if got := bob.lastProgress(3, "decrypt", ann.ID); got.Guesses != nil || !reflect.DeepEqual(got.Filled, []bool{true, true, false}) || got.Focus != 3 || got.Step != 2 {
		t.Fatalf("Bob received %+v", got)
	}
	bob.send("submit_intercept", map[string]any{"round": 3, "guess": secret})
	for _, c := range everyone {
		c.until("Bob's answer", func() bool { return c.answered(3, "intercept") })
	}
	// Nothing is revealed before team A has answered too.
	if ann.Result.Round != 2 {
		t.Fatalf("round 3 was settled with one answer: %+v", ann.Result)
	}

	// The server dies while team A decodes.
	first.kill()
	for _, c := range everyone {
		c.conn.Close()
	}
	second := boot(t, db)

	back := map[*client]*client{}
	for _, c := range everyone {
		back[c] = second.resume(c)
	}
	for old, c := range back {
		if c.Refused != nil {
			t.Fatalf("%s was refused: %+v", c.name, c.Refused)
		}
		if c.ID != old.ID || c.Code != old.Code {
			t.Fatalf("%s came back as %s in room %s", c.name, c.ID, c.Code)
		}
		// The first thing a returning player is told already has the new deadline.
		if c.Sync.Game == nil {
			t.Fatalf("%s came back to a room without its game", c.name)
		}
		g := *c.Sync.Game
		if g.Round != 3 || g.Phase != "guess" || g.YourRole != old.Phase.YourRole || g.YourTeam != old.Team || g.Encryptor != "Alf" {
			t.Errorf("%s came back to %+v", c.name, g)
		}
		// Team B's interception is kept; only team A still has to answer.
		if !g.Actions["intercept"].Submitted || g.Actions["decrypt"].Submitted || g.Submitted != (old.Team == "B") || g.Waiting != (old != ann) {
			t.Errorf("%s came back to the actions %+v, submitted=%v waiting=%v", c.name, g.Actions, g.Submitted, g.Waiting)
		}
		if !reflect.DeepEqual(g.Words, old.Words) || !reflect.DeepEqual(g.Clues, []string{"un", "deux", "trois"}) ||
			!reflect.DeepEqual(g.SecretDigits, old.Phase.SecretDigits) || !reflect.DeepEqual(g.History, old.Phase.History) {
			t.Errorf("%s lost part of the game: %+v, had %+v", c.name, g, old.Phase)
		}
		if g.ScoreA != (ws.ScoreInfo{}) || g.ScoreB != (ws.ScoreInfo{DecryptFailures: 1}) || len(g.History) != 2 {
			t.Errorf("%s sees the score %+v / %+v after %d rounds", c.name, g.ScoreA, g.ScoreB, len(g.History))
		}
		if g.RoundResult != nil {
			t.Errorf("%s sees a result before team A answered: %+v", c.name, g.RoundResult)
		}
		if left := time.Until(time.UnixMilli(g.Deadline)); left < 50*time.Second || left > 61*time.Second {
			t.Errorf("%s has %v left to decode, want the full minute", c.name, left)
		}
	}
	before := ann.Room
	ann, alf, bob, bea = back[ann], back[alf], back[bob], back[bea]
	// By now everyone is back in the seat they had.
	ann.Sync = nil
	ann.send("request_sync", nil)
	ann.until("sync", func() bool { return ann.Sync != nil })
	if got := ann.Sync.Room; !got.Started || got.OwnerID != ann.ID || !reflect.DeepEqual(got.TeamA, before.TeamA) || !reflect.DeepEqual(got.TeamB, before.TeamB) ||
		!reflect.DeepEqual(seats(got.TeamA), []string{"Ann", "Alf", "AI"}) || !reflect.DeepEqual(seats(got.TeamB), []string{"Bob", "Bea"}) {
		t.Errorf("the room came back as %+v, was %+v", got, before)
	}

	// The interception is not asked for again, and the game goes on: Ann
	// decodes, the code is revealed with both answers, then Bea, next in her
	// team, encrypts round 4.
	bob.send("submit_intercept", map[string]any{"round": 3, "guess": secret})
	bob.until("a refusal", func() bool { return bob.Refused != nil })
	ann.send("submit_decrypt", map[string]any{"round": 3, "guess": secret})
	for _, c := range []*client{ann, alf, bob, bea} {
		c.inPhase(4, "encrypting")
		if c.Phase.Encryptor != "Bea" || len(c.Phase.History) != 3 {
			t.Fatalf("%s: round 4 is encrypted by %s after %d rounds", c.name, c.Phase.Encryptor, len(c.Phase.History))
		}
		if row := c.Phase.History[2]; !reflect.DeepEqual(row.Secret, secret) || !reflect.DeepEqual(row.Intercept, secret) || !reflect.DeepEqual(row.Decrypt, secret) {
			t.Fatalf("%s: round 3 settled as %+v", c.name, row)
		}
	}
	if r := ann.Result; r.Round != 3 || r.InterceptSuccess == nil || !*r.InterceptSuccess || r.DecryptSuccess == nil || !*r.DecryptSuccess ||
		r.ScoreA != (ws.ScoreInfo{}) || r.ScoreB != (ws.ScoreInfo{Interceptions: 1, DecryptFailures: 1}) {
		t.Fatalf("round 3 settled as %+v", r)
	}
	if len(bea.Phase.SecretDigits) != 3 {
		t.Fatal("Bea has no code to encrypt")
	}

	// Who opened and entered the room, by browser.
	device := func(token string) string { return deviceID(token) }
	got := query(t, db, `SELECT m.nickname, m.device_id, m.creator, r.code, r.closed_at IS NULL
		FROM room_members m JOIN rooms r ON r.id = m.room_id ORDER BY m.nickname`)
	want := [][]string{
		{"Alf", device(tokenAlf), "0", ann.Code, "1"},
		{"Ann", device(tokenAnn), "1", ann.Code, "1"},
		{"Bea", "", "0", ann.Code, "1"},
		{"Bob", device(tokenBob), "0", ann.Code, "1"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("recorded %v, want %v", got, want)
	}
	for _, row := range query(t, db, `SELECT room_state || coalesce(game_state, '') FROM rooms`) {
		for _, secret := range []string{tokenAnn, tokenBob, tokenAlf, ann.Token, bob.Token} {
			if strings.Contains(row[0], secret) {
				t.Fatal("a token is stored in the clear")
			}
		}
	}
}

func TestLobbySurvivesARestart(t *testing.T) {
	db := filepath.Join(t.TempDir(), "decrypto.db")
	first := boot(t, db)
	ann, alf, bob, bea := lobby(t, first)
	// Bea changes sides, and Alf leaves his seat to watch.
	bea.send("select_team", map[string]any{"team": "A"})
	alf.send("leave_team", nil)
	ann.until("the new seats", func() bool { return len(ann.Room.TeamA) == 3 && len(ann.Room.TeamB) == 1 && len(ann.Room.Players) == 5 })
	before := ann.Room

	first.kill()
	for _, c := range []*client{ann, alf, bob, bea} {
		c.conn.Close()
	}
	second := boot(t, db)

	ann2 := second.resume(ann)
	if ann2.Refused != nil || ann2.Sync.Game != nil {
		t.Fatalf("Ann came back to %+v, refused %+v", ann2.Sync, ann2.Refused)
	}
	got := ann2.Sync.Room
	if got.RoomCode != before.RoomCode || got.OwnerID != ann.ID || got.Started || got.CanStart ||
		!reflect.DeepEqual(seats(got.TeamA), []string{"Ann", "AI", "Bea (offline)"}) || !reflect.DeepEqual(seats(got.TeamB), []string{"Bob (offline)"}) {
		t.Fatalf("the lobby came back as %+v", got)
	}
	alf2, bob2, bea2 := second.resume(alf), second.resume(bob), second.resume(bea)
	if alf2.ID != alf.ID || bob2.ID != bob.ID || bea2.ID != bea.ID {
		t.Fatal("a player came back as someone else")
	}
	ann2.until("everyone back", func() bool {
		return len(ann2.Room.Players) == 5 && len(seats(ann2.Room.TeamB)) == 1 && ann2.Room.TeamB[0].Nickname == "Bob" && !ann2.Room.TeamB[0].Disconnected
	})

	// A room code in use is not given to a new room, and the lobby works as before.
	alf2.send("select_team", map[string]any{"team": "B"})
	ann2.until("a full lobby", func() bool { return ann2.Room.CanStart })
	bob2.send("start_game", nil)
	bob2.until("a refusal", func() bool { return bob2.Refused != nil })
	ann2.send("start_game", nil)
	for _, c := range []*client{ann2, alf2, bob2, bea2} {
		c.inPhase(1, "encrypting")
	}
	if ann2.Phase.Encryptor != "Ann" || len(ann2.Phase.SecretDigits) != 3 || len(ann2.Words) != 4 {
		t.Fatalf("the game after the restart began with %+v", ann2.Phase)
	}
}

func TestRestartKeepsSeatsAndRoomsOnlyForAWhile(t *testing.T) {
	db := filepath.Join(t.TempDir(), "decrypto.db")
	first := boot(t, db)
	ann, alf, bob, bea := lobby(t, first)
	first.kill()
	for _, c := range []*client{ann, alf, bob, bea} {
		c.conn.Close()
	}

	const seatGrace, roomGrace = 100 * time.Millisecond, 600 * time.Millisecond
	second := bootWith(t, db, seatGrace, roomGrace)

	// Bob is back in time and keeps his seat. The others lose theirs, and Ann
	// the room, which goes to Bob.
	bob2 := second.resume(bob)
	bob2.until("the others to lose their seats", func() bool {
		return reflect.DeepEqual(seats(bob2.Room.TeamA), []string{"AI"}) && reflect.DeepEqual(seats(bob2.Room.TeamB), []string{"Bob"}) && bob2.Room.OwnerID == bob.ID
	})
	// Ann is late: she is still let in, without a seat.
	ann2 := second.resume(ann)
	if ann2.Refused != nil || ann2.ID != ann.ID {
		t.Fatalf("Ann was not let back in: %+v", ann2.Refused)
	}
	ann2.until("the room", func() bool { return len(ann2.Room.Players) == 3 })
	if len(ann2.Room.TeamA) != 1 || ann2.Room.OwnerID != bob.ID {
		t.Fatalf("Ann came back to %+v", ann2.Room)
	}
	stored := query(t, db, `SELECT json_extract(room_state, '$.owner_id'), json_array_length(room_state, '$.team_a') FROM rooms`)
	if !reflect.DeepEqual(stored, [][]string{{bob.ID, "1"}}) {
		t.Fatalf("stored after the seats were freed: %v", stored)
	}

	// Once everyone has left for long enough, the room closes for good.
	second.kill()
	bob2.conn.Close()
	ann2.conn.Close()
	third := bootWith(t, db, seatGrace, roomGrace)
	time.Sleep(roomGrace + 200*time.Millisecond)
	if late := third.resume(bob); late.Refused == nil || late.Refused.Code != "resume_expired" {
		t.Fatalf("Bob entered a closed room: %+v", late.Sync)
	}
	closed := query(t, db, `SELECT closed_at IS NOT NULL, room_state IS NULL, (SELECT count(*) FROM room_members) FROM rooms`)
	if !reflect.DeepEqual(closed, [][]string{{"1", "1", "4"}}) {
		t.Fatalf("the closed room is stored as %v", closed)
	}
	third.kill()
	if rooms := query(t, db, `SELECT count(*) FROM rooms WHERE closed_at IS NULL`); rooms[0][0] != "0" {
		t.Fatalf("%s rooms would come back", rooms[0][0])
	}
}

func TestUnreadableStatesDoNotStopTheServer(t *testing.T) {
	db := filepath.Join(t.TempDir(), "decrypto.db")
	first := boot(t, db)
	ann, alf, bob, bea := lobby(t, first)
	ann.send("start_game", nil)
	ann.inPhase(1, "encrypting")
	// A second room, whose state will be damaged.
	eve := first.connect("Eve")
	eve.send("create_room", map[string]any{"nickname": "Eve"})
	eve.until("the room", func() bool { return eve.Code != "" })
	first.kill()
	for _, c := range []*client{ann, alf, bob, bea, eve} {
		c.conn.Close()
	}

	// The game was written by a later version, and Eve's room is damaged.
	conn, err := sql.Open("sqlite", db)
	if err != nil {
		t.Fatal(err)
	}
	for _, change := range []string{
		`UPDATE rooms SET game_state = json_set(game_state, '$.v', 99) WHERE code = '` + ann.Code + `'`,
		`UPDATE rooms SET room_state = '{"v":1,' WHERE code = '` + eve.Code + `'`,
	} {
		if result, err := conn.Exec(change); err != nil {
			t.Fatal(err)
		} else if n, _ := result.RowsAffected(); n != 1 {
			t.Fatalf("%d rooms changed by %s", n, change)
		}
	}
	conn.Close()

	second := boot(t, db)
	ann2 := second.resume(ann)
	if ann2.Refused != nil || ann2.Sync.Game != nil {
		t.Fatalf("Ann came back to %+v, refused %+v", ann2.Sync, ann2.Refused)
	}
	if got := ann2.Sync.Room; got.Started || !reflect.DeepEqual(seats(got.TeamA), []string{"Ann", "Alf (offline)", "AI"}) ||
		!reflect.DeepEqual(seats(got.TeamB), []string{"Bob (offline)", "Bea (offline)"}) {
		t.Fatalf("the room did not return to its lobby: %+v", got)
	}
	if eve2 := second.resume(eve); eve2.Refused == nil || eve2.Refused.Code != "resume_expired" {
		t.Fatalf("Eve entered a damaged room: %+v", eve2.Sync)
	}
	stored := query(t, db, `SELECT code, closed_at IS NULL, json_extract(room_state, '$.started'), game_state FROM rooms ORDER BY created_at`)
	if !reflect.DeepEqual(stored, [][]string{{ann.Code, "1", "0", ""}, {eve.Code, "0", "", ""}}) {
		t.Fatalf("stored after the restart: %v", stored)
	}
	// The lobby starts a new game.
	for _, c := range []*client{alf, bob, bea} {
		second.resume(c)
	}
	ann2.until("everyone back", func() bool { return ann2.Room.CanStart })
	ann2.send("start_game", nil)
	ann2.inPhase(1, "encrypting")
}
