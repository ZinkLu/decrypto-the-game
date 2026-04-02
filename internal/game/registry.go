package game

import "sync"

var bridges sync.Map

// RegisterBridge stores a Bridge in the global registry keyed by session ID.
func RegisterBridge(sessionID string, b *Bridge) {
	bridges.Store(sessionID, b)
}

// GetBridge retrieves a Bridge from the global registry by session ID.
func GetBridge(sessionID string) (*Bridge, bool) {
	v, ok := bridges.Load(sessionID)
	if !ok {
		return nil, false
	}
	return v.(*Bridge), true
}

// RemoveBridge deletes a Bridge from the global registry by session ID.
func RemoveBridge(sessionID string) {
	bridges.Delete(sessionID)
}
