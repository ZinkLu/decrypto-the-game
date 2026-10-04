package server

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"regexp"

	"github.com/ZinkLu/decrypto-the-game/server/internal/game"
	"github.com/ZinkLu/decrypto-the-game/server/internal/room"
	"github.com/ZinkLu/decrypto-the-game/server/internal/store"
)

// Storing is best effort: a room that cannot be written is still played, and
// the failure is logged.

var deviceToken = regexp.MustCompile(`^[0-9a-f]{64}$`)

// deviceID names a browser across rooms by the hash of its token, so the
// stored record cannot be used to pass for that browser. It is empty for a
// browser that sent no token.
func deviceID(token string) string {
	if !deviceToken.MatchString(token) {
		return ""
	}
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// roomChanged stores the room, shows it to everyone in it, and tells the voice
// service who may now hear whom.
func (h *Handler) roomChanged(r *room.Room) {
	h.saveRoom(r)
	h.broadcastRoomState(r)
	h.hearVoice(r)
}

// saveRoom writes the room if it differs from what is stored. Connections are
// not part of the stored state, so players coming and going write nothing.
func (h *Handler) saveRoom(r *room.Room) {
	if h.Store == nil {
		return
	}
	state, err := json.Marshal(r.State())
	if err == nil && !bytes.Equal(state, h.stored[r.ID]) {
		if err = h.Store.SaveRoom(r.ID, state); err == nil {
			h.stored[r.ID] = state
		}
	}
	if err != nil {
		log.Printf("store: room %s: %v", r.Code, err)
	}
}

// saveGame writes the state of the room's game; nil removes it.
func (h *Handler) saveGame(r *room.Room, state []byte) {
	if h.Store == nil {
		return
	}
	if err := h.Store.SaveGame(r.ID, state); err != nil {
		log.Printf("store: game of room %s: %v", r.Code, err)
	}
}

// keepGame stores the game each time it moves on. It is called from the game
// goroutine, and takes no lock of the handler.
func (h *Handler) keepGame(b *game.Bridge, r *room.Room) {
	if h.Store == nil {
		return
	}
	b.OnSave = func(snap game.Snapshot) {
		state, err := json.Marshal(snap)
		if err != nil {
			log.Printf("store: game of room %s: %v", r.Code, err)
			return
		}
		h.saveGame(r, state)
	}
}

func (h *Handler) recordCreated(r *room.Room, p *room.PlayerInfo, token string) {
	if h.Store == nil {
		return
	}
	state, err := json.Marshal(r.State())
	if err == nil {
		err = h.Store.CreateRoom(r.ID, r.Code, store.Member{PlayerID: p.ID, DeviceID: deviceID(token), Nickname: p.Nickname}, state)
	}
	if err != nil {
		log.Printf("store: new room %s: %v", r.Code, err)
		return
	}
	h.stored[r.ID] = state
}

func (h *Handler) recordJoined(r *room.Room, p *room.PlayerInfo, token string) {
	if h.Store == nil {
		return
	}
	if err := h.Store.AddMember(r.ID, store.Member{PlayerID: p.ID, DeviceID: deviceID(token), Nickname: p.Nickname}); err != nil {
		log.Printf("store: room %s: player %s: %v", r.Code, p.ID, err)
	}
}

func (h *Handler) closeStored(r *room.Room) {
	delete(h.stored, r.ID)
	if h.Store == nil {
		return
	}
	if err := h.Store.CloseRoom(r.ID); err != nil {
		log.Printf("store: closing room %s: %v", r.Code, err)
	}
}

// Restore brings back the rooms that were open when the server stopped, with
// every human offline: seats and rooms are held as after a disconnection. Call
// it before serving, as a player whose resume is refused forgets their seat.
func (h *Handler) Restore() error {
	if h.Store == nil {
		return nil
	}
	saved, err := h.Store.OpenRooms()
	if err != nil {
		return err
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	restored := 0
	for _, s := range saved {
		r, err := restoreRoom(s)
		if err == nil {
			err = h.RoomManager.Add(r)
		}
		if err != nil {
			log.Printf("restore: closing room %s: %v", s.Code, err)
			if err := h.Store.CloseRoom(s.ID); err != nil {
				log.Printf("store: closing room %s: %v", s.Code, err)
			}
			continue
		}
		h.stored[r.ID] = s.Room
		h.restoreGame(r, s.Game)
		for _, p := range r.State().Players {
			if !p.IsAI {
				h.holdSeat(r, p.ID)
			}
		}
		h.expireLater(r)
		restored++
	}
	if len(saved) > 0 {
		log.Printf("restore: %d of %d rooms are back", restored, len(saved))
	}
	return nil
}

func restoreRoom(s store.OpenRoom) (*room.Room, error) {
	var state room.State
	if err := json.Unmarshal(s.Room, &state); err != nil {
		return nil, err
	}
	if state.ID != s.ID || state.Code != s.Code {
		return nil, fmt.Errorf("stored as room %s (%s), but its state is of room %s (%s)", s.Code, s.ID, state.Code, state.ID)
	}
	return room.Restore(state)
}

// restoreGame brings back the game the room was playing. A room whose game is
// missing or cannot be read by this version returns to its lobby.
func (h *Handler) restoreGame(r *room.Room, state []byte) {
	started := r.Snapshot().Started
	if started && state != nil {
		var snap game.Snapshot
		err := json.Unmarshal(state, &snap)
		if err == nil {
			var b *game.Bridge
			if b, err = game.Restore(r, h.Hub, snap); err == nil {
				h.keepGame(b, r)
				return
			}
		}
		log.Printf("restore: room %s returns to its lobby: %v", r.Code, err)
	}
	if started {
		r.AbortStart()
		h.saveRoom(r)
	}
	if state != nil {
		h.saveGame(r, nil)
	}
}
