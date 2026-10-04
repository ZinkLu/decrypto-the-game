package server

import (
	"errors"
	"path/filepath"
	"reflect"
	"sync/atomic"
	"testing"
	"time"

	"github.com/ZinkLu/decrypto-the-game/server/internal/store"
)

// unreliable is a store that fails every call while it is down, as a full
// disk would make it.
type unreliable struct {
	rooms  store.Rooms
	down   atomic.Bool
	failed atomic.Int32
}

func (u *unreliable) check() error {
	if !u.down.Load() {
		return nil
	}
	u.failed.Add(1)
	return errors.New("no space left on device")
}

func (u *unreliable) CreateRoom(id, code string, creator store.Member, state []byte) error {
	if err := u.check(); err != nil {
		return err
	}
	return u.rooms.CreateRoom(id, code, creator, state)
}

func (u *unreliable) AddMember(roomID string, m store.Member) error {
	if err := u.check(); err != nil {
		return err
	}
	return u.rooms.AddMember(roomID, m)
}

func (u *unreliable) SaveRoom(roomID string, state []byte) error {
	if err := u.check(); err != nil {
		return err
	}
	return u.rooms.SaveRoom(roomID, state)
}

func (u *unreliable) SaveGame(roomID string, state []byte) error {
	if err := u.check(); err != nil {
		return err
	}
	return u.rooms.SaveGame(roomID, state)
}

func (u *unreliable) CloseRoom(roomID string) error {
	if err := u.check(); err != nil {
		return err
	}
	return u.rooms.CloseRoom(roomID)
}

func (u *unreliable) OpenRooms() ([]store.OpenRoom, error) {
	if err := u.check(); err != nil {
		return nil, err
	}
	return u.rooms.OpenRooms()
}

const storedRoom = `SELECT json_array_length(room_state, '$.players'), json_extract(room_state, '$.started'),
	json_extract(game_state, '$.round'), json_extract(game_state, '$.phase') FROM rooms`

func TestGamesGoOnWhileNothingCanBeStored(t *testing.T) {
	db := filepath.Join(t.TempDir(), "decrypto.db")
	disk := &unreliable{}
	first := bootOn(t, db, func(file store.Rooms) store.Rooms { disk.rooms = file; return disk }, 20*time.Second, 10*time.Minute)

	// Ann opens her room, then the disk is full: the others join, the game
	// starts and its first round is played all the same.
	ann := openRoom(t, first)
	disk.down.Store(true)
	alf, bob, bea := fillRoom(t, first, ann)
	everyone := []*client{ann, alf, bob, bea}
	ann.send("start_game", nil)
	ann.inPhase(1, "encrypting")
	secret := ann.Phase.SecretDigits
	ann.send("submit_clues", map[string]any{"round": 1, "clues": []string{"one", "two", "three"}})
	alf.inPhase(1, "guess")
	alf.send("submit_decrypt", map[string]any{"round": 1, "guess": secret})
	for _, c := range everyone {
		c.inPhase(2, "encrypting")
		if c.Refused != nil {
			t.Fatalf("%s was refused: %+v", c.name, c.Refused)
		}
	}
	if disk.failed.Load() < 8 {
		t.Fatalf("the store was asked %d times while it was down", disk.failed.Load())
	}
	if got := query(t, db, storedRoom); !reflect.DeepEqual(got, [][]string{{"1", "0", "", ""}}) {
		t.Fatalf("stored while the disk was full: %v", got)
	}

	// There is space again. The game is stored as it moves on, and the room
	// with its next change: here, Bea losing her connection and returning.
	disk.down.Store(false)
	bob.send("submit_clues", map[string]any{"round": 2, "clues": []string{"uno", "dos", "tres"}})
	bea.inPhase(2, "guess")
	if got := query(t, db, storedRoom); !reflect.DeepEqual(got, [][]string{{"1", "0", "2", "guess"}}) {
		t.Fatalf("stored once the disk had space: %v", got)
	}
	bea.conn.Close()
	bea = first.resume(bea)
	if bea.Refused != nil {
		t.Fatalf("Bea was refused: %+v", bea.Refused)
	}
	if got := query(t, db, storedRoom); !reflect.DeepEqual(got, [][]string{{"5", "1", "2", "guess"}}) {
		t.Fatalf("stored after the room changed: %v", got)
	}

	// A restart now brings back everyone and their game.
	first.kill()
	for _, c := range []*client{ann, alf, bob, bea} {
		c.conn.Close()
	}
	second := boot(t, db)
	for _, c := range []*client{ann, alf, bob, bea} {
		back := second.resume(c)
		if back.Refused != nil || back.ID != c.ID {
			t.Fatalf("%s came back as %s, refused %+v", c.name, back.ID, back.Refused)
		}
		if g := back.Sync.Game; g == nil || g.Round != 2 || g.Phase != "guess" || g.Encryptor != "Bob" || len(g.History) != 1 || g.Deadline == 0 {
			t.Fatalf("%s came back to %+v", c.name, g)
		}
		if room := back.Sync.Room; len(room.TeamA) != 3 || len(room.TeamB) != 2 || !room.Started {
			t.Fatalf("%s came back to the room %+v", c.name, room)
		}
	}
}

func TestRestoreReportsAStoreThatCannotBeRead(t *testing.T) {
	disk := &unreliable{}
	disk.down.Store(true)
	h := NewHandler(nil, nil, disk)
	if err := h.Restore(); err == nil {
		t.Fatal("the server would start as if there were no rooms")
	}
}
