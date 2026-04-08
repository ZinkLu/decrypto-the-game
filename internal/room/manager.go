package room

import (
	"math/rand"
	"sync"
)

// codeChars excludes I, O, 0, and 1 to avoid visual confusion.
const codeChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

const codeLength = 4

// Manager holds all active rooms and manages their lifecycle.
type Manager struct {
	rooms map[string]*Room
	mu    sync.RWMutex
}

// NewManager returns an initialised Manager.
func NewManager() *Manager {
	return &Manager{
		rooms: make(map[string]*Room),
	}
}

// CreateRoom generates a unique 4-character room code, creates a room owned by owner,
// places the owner in Team A, and registers it in the manager.
func (m *Manager) CreateRoom(owner *PlayerInfo) *Room {
	m.mu.Lock()
	defer m.mu.Unlock()

	code := m.generateUniqueCode()
	r := NewRoom(code, owner)
	m.rooms[code] = r
	return r
}

// GetRoom returns the room with the given code, or nil if not found.
func (m *Manager) GetRoom(code string) *Room {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return m.rooms[code]
}

// RemoveRoom deletes the room with the given code from the manager.
func (m *Manager) RemoveRoom(code string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	delete(m.rooms, code)
}

// FindRoomByPlayer returns the room that contains the given player, or nil.
func (m *Manager) FindRoomByPlayer(playerID string) *Room {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, r := range m.rooms {
		if r.HasPlayer(playerID) {
			return r
		}
	}
	return nil
}

// generateUniqueCode generates a random 4-char code not already in use.
// Must be called with m.mu held (write lock).
func (m *Manager) generateUniqueCode() string {
	for {
		code := randomCode()
		if _, exists := m.rooms[code]; !exists {
			return code
		}
	}
}

func randomCode() string {
	b := make([]byte, codeLength)
	for i := range b {
		b[i] = codeChars[rand.Intn(len(codeChars))]
	}
	return string(b)
}
