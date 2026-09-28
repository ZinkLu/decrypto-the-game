// Package store says what the server needs from the place where rooms are
// kept: the states that bring open rooms back after a restart, and the record
// of who opened and entered each room. Implementations are in its subpackages.
package store

import "errors"

// ErrNotOpen is returned when saving to a room that is closed or was never stored.
var ErrNotOpen = errors.New("store: room is not open")

// Member is a human who entered a room. DeviceID names their browser across
// rooms; it is empty when the browser sent no device token.
type Member struct {
	PlayerID string
	DeviceID string
	Nickname string
}

// OpenRoom is a room to bring back after a restart. Game is nil outside a game.
type OpenRoom struct {
	ID, Code   string
	Room, Game []byte
}

// Rooms keeps rooms. It does not read their states, which the server writes
// as JSON. Two open rooms never share a code, and a player enters a room once.
// Its methods are called from several goroutines at once.
type Rooms interface {
	// CreateRoom records a new room and the player who opened it.
	CreateRoom(id, code string, creator Member, state []byte) error
	// AddMember records a player who joined the room.
	AddMember(roomID string, m Member) error
	// SaveRoom and SaveGame replace the states of an open room, and return
	// ErrNotOpen for any other. A nil game state removes the game.
	SaveRoom(roomID string, state []byte) error
	SaveGame(roomID string, state []byte) error
	// CloseRoom ends a room: its states are dropped and its code is free
	// again, while the record of who opened and entered it stays. It returns
	// ErrNotOpen for a room that is not open.
	CloseRoom(roomID string) error
	// OpenRooms lists the open rooms with their states, oldest first.
	OpenRooms() ([]OpenRoom, error)
}
