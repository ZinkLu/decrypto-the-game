package api

import (
	core "github.com/ZinkLu/decrypto-the-game/internal/core/api"
)

// GameAPI handles HTTP API requests for game operations
type GameAPI struct {
	sessionManager *SessionManager
}

// NewGameAPI creates a new GameAPI instance
func NewGameAPI() *GameAPI {
	return &GameAPI{
		sessionManager: NewSessionManager(),
	}
}

// SessionManager manages game sessions
type SessionManager struct {
	sessions map[string]*core.Session
}
