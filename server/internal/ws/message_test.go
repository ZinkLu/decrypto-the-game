package ws

import (
	"encoding/json"
	"testing"
)

// TestRoomCreatedDataHasPlayerID verifies that room_created includes my_player_id.
func TestRoomCreatedDataHasPlayerID(t *testing.T) {
	data := RoomCreatedData{
		RoomCode:   "ABCD",
		MyPlayerID: "player-123",
	}
	b, err := json.Marshal(data)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]interface{}
	json.Unmarshal(b, &m)

	if m["room_code"] != "ABCD" {
		t.Errorf("room_code = %v, want ABCD", m["room_code"])
	}
	if m["my_player_id"] != "player-123" {
		t.Errorf("my_player_id = %v, want player-123", m["my_player_id"])
	}
}

// TestRoomStateDataHasPlayerID verifies that room_state includes my_player_id.
func TestRoomStateDataHasPlayerID(t *testing.T) {
	data := RoomStateData{
		RoomCode:   "ABCD",
		OwnerID:    "owner-1",
		CanStart:   true,
		MyPlayerID: "player-456",
		Players:    []PlayerInfo{{ID: "player-456", Nickname: "Alice", IsAI: false}},
		TeamA:      []PlayerInfo{{ID: "player-456", Nickname: "Alice", IsAI: false}},
		TeamB:      []PlayerInfo{},
	}
	b, err := json.Marshal(data)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]interface{}
	json.Unmarshal(b, &m)

	if m["my_player_id"] != "player-456" {
		t.Errorf("my_player_id = %v, want player-456", m["my_player_id"])
	}
	if m["room_code"] != "ABCD" {
		t.Errorf("room_code = %v, want ABCD", m["room_code"])
	}
	if m["can_start"] != true {
		t.Errorf("can_start = %v, want true", m["can_start"])
	}
}

// TestRoomStateDataOmitsEmptyPlayerID verifies my_player_id is omitted when empty.
func TestRoomStateDataOmitsEmptyPlayerID(t *testing.T) {
	data := RoomStateData{
		RoomCode: "ABCD",
		OwnerID:  "owner-1",
	}
	b, _ := json.Marshal(data)
	var m map[string]interface{}
	json.Unmarshal(b, &m)

	if _, exists := m["my_player_id"]; exists {
		t.Error("my_player_id should be omitted when empty")
	}
}

// TestGameStartDataFieldNames verifies the JSON keys match what the frontend expects.
// Frontend reads: d.round, d.your_role, d.your_team, d.words
func TestGameStartDataFieldNames(t *testing.T) {
	data := GameStartData{
		Round:    1,
		YourRole: "encryptor",
		YourTeam: "A",
		Words:    []string{"apple", "banana", "cherry", "date"},
	}
	b, err := json.Marshal(data)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]interface{}
	json.Unmarshal(b, &m)

	tests := map[string]interface{}{
		"round":     float64(1),
		"your_role": "encryptor",
		"your_team": "A",
	}
	for key, want := range tests {
		got, ok := m[key]
		if !ok {
			t.Errorf("key %q missing from JSON", key)
			continue
		}
		if got != want {
			t.Errorf("%s = %v, want %v", key, got, want)
		}
	}
	words, ok := m["words"].([]interface{})
	if !ok || len(words) != 4 {
		t.Errorf("words = %v, want 4-element array", m["words"])
	}

	// Verify old field names do NOT exist (frontend used to read these by mistake)
	for _, oldKey := range []string{"my_role", "my_team", "my_words"} {
		if _, exists := m[oldKey]; exists {
			t.Errorf("old key %q should not exist in JSON", oldKey)
		}
	}
}

// TestPhaseChangeDataFieldNames verifies the JSON keys for phase_change messages.
// Frontend reads: d.your_role (not d.my_role)
func TestPhaseChangeDataFieldNames(t *testing.T) {
	data := PhaseChangeData{
		Phase:        "encrypting",
		Round:        2,
		YourRole:     "teammate",
		Encryptor:    "Alice",
		SecretDigits: []int{1, 3, 4},
		SecretWords:  []string{"apple", "cherry", "date"},
		Clues:        []string{"red", "yellow", "sweet"},
		Waiting:      true,
	}
	b, err := json.Marshal(data)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]interface{}
	json.Unmarshal(b, &m)

	if m["your_role"] != "teammate" {
		t.Errorf("your_role = %v, want teammate", m["your_role"])
	}
	if m["phase"] != "encrypting" {
		t.Errorf("phase = %v, want encrypting", m["phase"])
	}
	if m["encryptor"] != "Alice" {
		t.Errorf("encryptor = %v, want Alice", m["encryptor"])
	}

	// Verify old field name does NOT exist
	if _, exists := m["my_role"]; exists {
		t.Error("old key my_role should not exist in JSON")
	}
}

// TestGameSyncDataFieldNames verifies the JSON keys for full_sync game data.
// Frontend reads: gameData.your_role, gameData.your_team, gameData.words
func TestGameSyncDataFieldNames(t *testing.T) {
	data := GameSyncData{
		Phase:    "encrypting",
		Round:    3,
		YourRole: "opponent",
		YourTeam: "B",
		Words:    []string{"w1", "w2", "w3", "w4"},
		ScoreA:   ScoreInfo{Interceptions: 1, DecryptFailures: 0},
		ScoreB:   ScoreInfo{Interceptions: 0, DecryptFailures: 1},
	}
	b, err := json.Marshal(data)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]interface{}
	json.Unmarshal(b, &m)

	tests := map[string]interface{}{
		"your_role": "opponent",
		"your_team": "B",
		"phase":     "encrypting",
		"round":     float64(3),
	}
	for key, want := range tests {
		got, ok := m[key]
		if !ok {
			t.Errorf("key %q missing from JSON", key)
			continue
		}
		if got != want {
			t.Errorf("%s = %v, want %v", key, got, want)
		}
	}

	if _, exists := m["words"]; !exists {
		t.Error("key 'words' missing from JSON")
	}
	for _, oldKey := range []string{"my_words", "my_role", "my_team"} {
		if _, exists := m[oldKey]; exists {
			t.Errorf("old key %q should not exist in JSON", oldKey)
		}
	}
}

// TestFullSyncDataRoomIncludesPlayerID verifies full_sync room data carries my_player_id.
func TestFullSyncDataRoomIncludesPlayerID(t *testing.T) {
	syncData := FullSyncData{
		Room: &RoomStateData{
			RoomCode:   "XYZ",
			MyPlayerID: "player-789",
			OwnerID:    "owner-1",
			Players:    []PlayerInfo{},
			TeamA:      []PlayerInfo{},
			TeamB:      []PlayerInfo{},
		},
	}
	b, err := json.Marshal(syncData)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]interface{}
	json.Unmarshal(b, &m)

	roomData, ok := m["room"].(map[string]interface{})
	if !ok {
		t.Fatal("room field missing or not an object")
	}
	if roomData["my_player_id"] != "player-789" {
		t.Errorf("room.my_player_id = %v, want player-789", roomData["my_player_id"])
	}
}

// TestScoreInfoFieldNames verifies score JSON keys match frontend expectations.
// Frontend reads: score_a.interceptions, score_a.decrypt_failures
func TestScoreInfoFieldNames(t *testing.T) {
	data := RoundResultData{
		ScoreA: ScoreInfo{Interceptions: 2, DecryptFailures: 1},
		ScoreB: ScoreInfo{Interceptions: 0, DecryptFailures: 0},
	}
	b, _ := json.Marshal(data)
	var m map[string]interface{}
	json.Unmarshal(b, &m)

	scoreA, ok := m["score_a"].(map[string]interface{})
	if !ok {
		t.Fatal("score_a missing or not an object")
	}
	if scoreA["interceptions"] != float64(2) {
		t.Errorf("score_a.interceptions = %v, want 2", scoreA["interceptions"])
	}
	if scoreA["decrypt_failures"] != float64(1) {
		t.Errorf("score_a.decrypt_failures = %v, want 1", scoreA["decrypt_failures"])
	}
}
