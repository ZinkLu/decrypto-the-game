package api

import (
	"github.com/ZinkLu/decrypto-the-game/internal/core/api"
)

// NewSessionManager creates a new SessionManager
func NewSessionManager() *SessionManager {
	return &SessionManager{
		sessions: make(map[string]*api.Session),
	}
}

// CreateSession creates a new game session with auto team assignment
func (m *SessionManager) CreateSession(sessionID string, players []*api.Player) (*api.Session, error) {
	return api.NewWithAutoTeamUp(sessionID, players)
}

// GetSession retrieves a session by ID
func (m *SessionManager) GetSession(sessionID string) *api.Session {
	return m.sessions[sessionID]
}

// AddSession adds a session to the manager
func (m *SessionManager) AddSession(session *api.Session) {
	m.sessions[session.SessionID()] = session
}

// RemoveSession removes a session by ID
func (m *SessionManager) RemoveSession(sessionID string) {
	delete(m.sessions, sessionID)
}
