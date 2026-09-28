// Package sqlite keeps rooms in a SQLite file.
package sqlite

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/ZinkLu/decrypto-the-game/internal/store"
	_ "modernc.org/sqlite"
)

// Times are Unix milliseconds. States are JSON, kept as text so that SQLite's
// JSON functions read them. A closed room keeps its row and its members, as the
// record of who played; its code returns to the pool.
const schema = `
CREATE TABLE IF NOT EXISTS rooms (
	id         TEXT PRIMARY KEY,
	code       TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	closed_at  INTEGER,
	room_state TEXT,
	game_state TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS rooms_open_code ON rooms(code) WHERE closed_at IS NULL;

CREATE TABLE IF NOT EXISTS room_members (
	room_id   TEXT NOT NULL REFERENCES rooms(id),
	player_id TEXT NOT NULL,
	device_id TEXT NOT NULL,
	nickname  TEXT NOT NULL,
	creator   INTEGER NOT NULL,
	joined_at INTEGER NOT NULL,
	PRIMARY KEY (room_id, player_id)
);
CREATE INDEX IF NOT EXISTS room_members_device ON room_members(device_id);
`

type Store struct{ db *sql.DB }

var _ store.Rooms = (*Store)(nil)

// Open opens the database at path, creating the file and its directory as needed.
func Open(path string) (*Store, error) {
	if strings.ContainsRune(path, '?') {
		return nil, fmt.Errorf("sqlite: path %q contains '?'", path)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, fmt.Errorf("sqlite: %w", err)
	}
	// SQLite gives its companion files the permissions of the database file.
	file, err := os.OpenFile(path, os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		return nil, fmt.Errorf("sqlite: %w", err)
	}
	file.Close()

	db, err := sql.Open("sqlite", path+"?_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)")
	if err != nil {
		return nil, fmt.Errorf("sqlite: %w", err)
	}
	// One connection serializes the writers: the room handler and each game.
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, fmt.Errorf("sqlite: %s: %w", path, err)
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) CreateRoom(id, code string, creator store.Member, state []byte) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	now := time.Now().UnixMilli()
	if _, err := tx.Exec(`INSERT INTO rooms (id, code, created_at, room_state) VALUES (?, ?, ?, ?)`, id, code, now, string(state)); err != nil {
		return err
	}
	if _, err := tx.Exec(`INSERT INTO room_members (room_id, player_id, device_id, nickname, creator, joined_at) VALUES (?, ?, ?, ?, 1, ?)`,
		id, creator.PlayerID, creator.DeviceID, creator.Nickname, now); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) AddMember(roomID string, m store.Member) error {
	_, err := s.db.Exec(`INSERT INTO room_members (room_id, player_id, device_id, nickname, creator, joined_at) VALUES (?, ?, ?, ?, 0, ?)`,
		roomID, m.PlayerID, m.DeviceID, m.Nickname, time.Now().UnixMilli())
	return err
}

func (s *Store) SaveRoom(roomID string, state []byte) error {
	return s.update(`UPDATE rooms SET room_state = ? WHERE id = ? AND closed_at IS NULL`, string(state), roomID)
}

func (s *Store) SaveGame(roomID string, state []byte) error {
	var value any
	if state != nil {
		value = string(state)
	}
	return s.update(`UPDATE rooms SET game_state = ? WHERE id = ? AND closed_at IS NULL`, value, roomID)
}

func (s *Store) CloseRoom(roomID string) error {
	return s.update(`UPDATE rooms SET closed_at = ?, room_state = NULL, game_state = NULL WHERE id = ? AND closed_at IS NULL`,
		time.Now().UnixMilli(), roomID)
}

func (s *Store) update(query string, args ...any) error {
	result, err := s.db.Exec(query, args...)
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return store.ErrNotOpen
	}
	return nil
}

func (s *Store) OpenRooms() ([]store.OpenRoom, error) {
	rows, err := s.db.Query(`SELECT id, code, room_state, game_state FROM rooms WHERE closed_at IS NULL ORDER BY created_at, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var rooms []store.OpenRoom
	for rows.Next() {
		var r store.OpenRoom
		var room, game sql.NullString
		if err := rows.Scan(&r.ID, &r.Code, &room, &game); err != nil {
			return nil, err
		}
		if room.Valid {
			r.Room = []byte(room.String)
		}
		if game.Valid {
			r.Game = []byte(game.String)
		}
		rooms = append(rooms, r)
	}
	return rooms, rows.Err()
}
