package sqlite

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/ZinkLu/decrypto-the-game/server/internal/store"
)

func open(t *testing.T, path string) *Store {
	t.Helper()
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

func TestOpenRoomsSurviveReopening(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "dir with space", "decrypto.db")
	s := open(t, path)
	must(t, s.CreateRoom("room-1", "1234", store.Member{PlayerID: "p1", DeviceID: "device-1", Nickname: "Ann"}, []byte(`{"v":1}`)))
	must(t, s.CreateRoom("room-2", "5678", store.Member{PlayerID: "p2", Nickname: "Bob"}, []byte(`{"v":1}`)))
	must(t, s.AddMember("room-1", store.Member{PlayerID: "p3", DeviceID: "device-3", Nickname: "Cid"}))
	must(t, s.SaveRoom("room-1", []byte(`{"v":1,"started":true}`)))
	must(t, s.SaveGame("room-1", []byte(`{"phase":"decrypt"}`)))
	must(t, s.SaveGame("room-2", []byte(`{"phase":"encrypting"}`)))
	must(t, s.SaveGame("room-2", nil))
	must(t, s.Close())

	s = open(t, path)
	rooms, err := s.OpenRooms()
	must(t, err)
	want := []store.OpenRoom{
		{ID: "room-1", Code: "1234", Room: []byte(`{"v":1,"started":true}`), Game: []byte(`{"phase":"decrypt"}`)},
		{ID: "room-2", Code: "5678", Room: []byte(`{"v":1}`)},
	}
	if !reflect.DeepEqual(rooms, want) {
		t.Fatalf("open rooms:\n got %s\nwant %s", rooms, want)
	}

	info, err := os.Stat(path)
	must(t, err)
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Errorf("database readable by others: %v", perm)
	}
}

func TestClosedRoomFreesItsCodeAndKeepsItsRecord(t *testing.T) {
	s := open(t, filepath.Join(t.TempDir(), "decrypto.db"))
	ann := store.Member{PlayerID: "p1", DeviceID: "device-1", Nickname: "Ann"}
	must(t, s.CreateRoom("room-1", "1234", ann, []byte(`{}`)))
	if s.CreateRoom("room-2", "1234", ann, []byte(`{}`)) == nil {
		t.Fatal("two open rooms share a code")
	}
	must(t, s.AddMember("room-1", store.Member{PlayerID: "p2", DeviceID: "device-2", Nickname: "Bob"}))
	if s.AddMember("room-1", store.Member{PlayerID: "p2", Nickname: "Bob"}) == nil {
		t.Fatal("a player entered the same room twice")
	}
	if s.AddMember("no-room", store.Member{PlayerID: "p9", Nickname: "Zed"}) == nil {
		t.Fatal("a player entered a room that does not exist")
	}
	must(t, s.SaveGame("room-1", []byte(`{}`)))
	must(t, s.CloseRoom("room-1"))

	if rooms, err := s.OpenRooms(); err != nil || len(rooms) != 0 {
		t.Fatalf("closed room still open: %v %v", rooms, err)
	}
	for name, err := range map[string]error{
		"save room":  s.SaveRoom("room-1", []byte(`{}`)),
		"save game":  s.SaveGame("room-1", []byte(`{}`)),
		"close":      s.CloseRoom("room-1"),
		"never seen": s.SaveRoom("no-room", []byte(`{}`)),
	} {
		if !errors.Is(err, store.ErrNotOpen) {
			t.Errorf("%s on a room that is not open: %v", name, err)
		}
	}
	var states int
	must(t, s.db.QueryRow(`SELECT count(*) FROM rooms WHERE room_state IS NOT NULL OR game_state IS NOT NULL`).Scan(&states))
	if states != 0 {
		t.Error("a closed room kept its state")
	}

	// The same device opens a second room with the freed code.
	must(t, s.CreateRoom("room-3", "1234", store.Member{PlayerID: "p5", DeviceID: "device-1", Nickname: "Ann again"}, []byte(`{}`)))

	// The record of who opened which room, as documented for operators.
	rows, err := s.db.Query(`
		SELECT m.device_id, m.nickname, r.code, r.closed_at IS NULL
		FROM room_members m JOIN rooms r ON r.id = m.room_id
		WHERE m.creator = 1 ORDER BY r.created_at, r.id`)
	must(t, err)
	defer rows.Close()
	type opened struct {
		device, nickname, code string
		open                   bool
	}
	var got []opened
	for rows.Next() {
		var o opened
		must(t, rows.Scan(&o.device, &o.nickname, &o.code, &o.open))
		got = append(got, o)
	}
	want := []opened{{"device-1", "Ann", "1234", false}, {"device-1", "Ann again", "1234", true}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("rooms opened: %+v, want %+v", got, want)
	}
	var entered int
	must(t, s.db.QueryRow(`SELECT count(*) FROM room_members WHERE room_id = 'room-1'`).Scan(&entered))
	if entered != 2 {
		t.Errorf("%d players recorded in the closed room, want 2", entered)
	}
}

func TestOpenRefusesAnUnusablePath(t *testing.T) {
	dir := t.TempDir()
	if _, err := Open(filepath.Join(dir, "what?.db")); err == nil {
		t.Error("a path SQLite would truncate was accepted")
	}
	must(t, os.WriteFile(filepath.Join(dir, "file"), nil, 0o600))
	if _, err := Open(filepath.Join(dir, "file", "decrypto.db")); err == nil {
		t.Error("opened a database under a file")
	}
	must(t, os.WriteFile(filepath.Join(dir, "notes.db"), []byte("this is not a database, only some notes"), 0o600))
	if _, err := Open(filepath.Join(dir, "notes.db")); err == nil {
		t.Error("opened a file that is not a database")
	}
}
