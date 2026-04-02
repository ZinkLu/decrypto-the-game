package room

import (
	"strings"
	"testing"
)

func TestRoomTeamOperations(t *testing.T) {
	owner := &PlayerInfo{ID: "player-1", Nickname: "Alice"}
	r := NewRoom("TEST", owner)

	// Owner starts in Team A.
	if len(r.TeamA) != 1 {
		t.Fatalf("expected 1 player in TeamA, got %d", len(r.TeamA))
	}
	if r.TeamA[0].ID != "player-1" {
		t.Fatalf("expected owner in TeamA, got %s", r.TeamA[0].ID)
	}

	// Add a second player to Team B.
	player2 := &PlayerInfo{ID: "player-2", Nickname: "Bob"}
	if err := r.AddToTeam(player2, "B"); err != nil {
		t.Fatalf("AddToTeam B: %v", err)
	}
	if len(r.TeamB) != 1 {
		t.Fatalf("expected 1 player in TeamB, got %d", len(r.TeamB))
	}

	// With 1v1, CanStart should be false.
	if r.CanStart() {
		t.Fatal("CanStart should be false with 1v1")
	}

	// Add AI to Team A.
	if err := r.AddAI("A"); err != nil {
		t.Fatalf("AddAI A: %v", err)
	}
	if len(r.TeamA) != 2 {
		t.Fatalf("expected 2 in TeamA after AI, got %d", len(r.TeamA))
	}
	aiA := r.TeamA[1]
	if !aiA.IsAI {
		t.Fatal("expected AI flag on added AI player")
	}
	if aiA.ID != "ai-A-1" {
		t.Fatalf("unexpected AI ID: %s", aiA.ID)
	}

	// Add AI to Team B.
	if err := r.AddAI("B"); err != nil {
		t.Fatalf("AddAI B: %v", err)
	}

	// Now 2v2 — CanStart should be true.
	if !r.CanStart() {
		t.Fatal("CanStart should be true with 2v2")
	}

	// Switch player-1 from Team A to Team B.
	if err := r.AddToTeam(owner, "B"); err != nil {
		t.Fatalf("AddToTeam B for owner: %v", err)
	}
	// Should no longer be in Team A.
	for _, p := range r.TeamA {
		if p.ID == owner.ID {
			t.Fatal("owner should have been removed from TeamA after switching to TeamB")
		}
	}
	// Should be in Team B.
	found := false
	for _, p := range r.TeamB {
		if p.ID == owner.ID {
			found = true
		}
	}
	if !found {
		t.Fatal("owner should be in TeamB after switch")
	}

	// Remove AI from Team A at index 1 (the only AI).
	// After switching owner out, TeamA = [ai-A-1] (index 0).
	if err := r.RemoveAI("A", 0); err != nil {
		t.Fatalf("RemoveAI A 0: %v", err)
	}
	if len(r.TeamA) != 0 {
		t.Fatalf("expected TeamA to be empty after removing AI, got %d", len(r.TeamA))
	}

	// Removing a non-AI player should error.
	if err := r.RemoveAI("B", 0); err == nil {
		t.Fatal("expected error when removing non-AI player via RemoveAI")
	}

	// FindPlayer and HasPlayer.
	p2, team := r.FindPlayer("player-2")
	if p2 == nil {
		t.Fatal("FindPlayer should find player-2")
	}
	if team != "B" {
		t.Fatalf("expected player-2 in team B, got %s", team)
	}
	if !r.HasPlayer("player-2") {
		t.Fatal("HasPlayer should return true for player-2")
	}
	if r.HasPlayer("nonexistent") {
		t.Fatal("HasPlayer should return false for unknown player")
	}

	// GetAllPlayers should include players from both teams.
	all := r.GetAllPlayers()
	if len(all) == 0 {
		t.Fatal("GetAllPlayers should not be empty")
	}

	// RemovePlayer.
	r.RemovePlayer("player-2")
	if r.HasPlayer("player-2") {
		t.Fatal("player-2 should be gone after RemovePlayer")
	}
}

func TestManagerCreateAndFind(t *testing.T) {
	m := NewManager()

	owner := &PlayerInfo{ID: "user-1", Nickname: "Charlie"}
	room := m.CreateRoom(owner)

	// Code should be exactly 4 characters.
	if len(room.Code) != 4 {
		t.Fatalf("expected 4-char code, got %q (len %d)", room.Code, len(room.Code))
	}

	// Code should only contain allowed characters.
	for _, ch := range room.Code {
		if !strings.ContainsRune(codeChars, ch) {
			t.Fatalf("code %q contains disallowed character %c", room.Code, ch)
		}
	}

	// GetRoom should return the same room.
	fetched := m.GetRoom(room.Code)
	if fetched == nil {
		t.Fatal("GetRoom returned nil")
	}
	if fetched.Code != room.Code {
		t.Fatalf("code mismatch: got %s, want %s", fetched.Code, room.Code)
	}

	// GetRoom for unknown code returns nil.
	if m.GetRoom("ZZZZ") != nil {
		t.Fatal("GetRoom for unknown code should return nil")
	}

	// Add a player to Team B and find the room by player ID.
	player2 := &PlayerInfo{ID: "user-2", Nickname: "Diana"}
	if err := room.AddToTeam(player2, "B"); err != nil {
		t.Fatalf("AddToTeam: %v", err)
	}
	found := m.FindRoomByPlayer("user-2")
	if found == nil {
		t.Fatal("FindRoomByPlayer should find the room for user-2")
	}
	if found.Code != room.Code {
		t.Fatalf("FindRoomByPlayer returned wrong room: %s", found.Code)
	}

	// FindRoomByPlayer for unknown player returns nil.
	if m.FindRoomByPlayer("nobody") != nil {
		t.Fatal("FindRoomByPlayer for unknown player should return nil")
	}

	// RemoveRoom then GetRoom should return nil.
	m.RemoveRoom(room.Code)
	if m.GetRoom(room.Code) != nil {
		t.Fatal("GetRoom should return nil after RemoveRoom")
	}
}
