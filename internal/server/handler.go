package server

import (
	"encoding/json"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/ZinkLu/decrypto-the-game/internal/game"
	"github.com/ZinkLu/decrypto-the-game/internal/room"
	"github.com/ZinkLu/decrypto-the-game/internal/ws"
	"github.com/google/uuid"
)

// Room operations are serialized; the game goroutine exposes synchronized snapshots.
type Handler struct {
	RoomManager *room.Manager
	Hub         *ws.Hub
	mu          sync.Mutex
	active      map[string]*ws.Client
	expiry      map[string]*time.Timer
}

func NewHandler(manager *room.Manager, hub *ws.Hub) *Handler {
	return &Handler{RoomManager: manager, Hub: hub, active: map[string]*ws.Client{}, expiry: map[string]*time.Timer{}}
}

func validName(name string) bool {
	return strings.TrimSpace(name) != "" && utf8.RuneCountInString(name) <= 20
}

func (h *Handler) attach(client *ws.Client, r *room.Room, p *room.PlayerInfo, token string, resume bool) {
	if old := h.active[p.ID]; old != nil && old != client {
		old.Close()
	}
	client.SetIdentity(p.ID, p.Nickname)
	h.active[p.ID] = client
	h.Hub.JoinRoom(client, r.Code)
	if timer := h.expiry[r.Code]; timer != nil {
		timer.Stop()
		delete(h.expiry, r.Code)
	}
	typ := ws.MsgRoomCreated
	if resume {
		typ = "room_resumed"
	}
	client.SendMessage(ws.ServerMessage{Type: typ, Data: ws.RoomCreatedData{RoomCode: r.Code, MyPlayerID: p.ID, ResumeToken: token}})
	h.broadcastRoomState(r)
	if resume {
		h.sendSync(client, r)
	}
}

func (h *Handler) HandleMessage(client *ws.Client, msg ws.ClientMessage) {
	h.mu.Lock()
	defer h.mu.Unlock()
	identity := client.Identity()
	if identity.PlayerID != "" && h.active[identity.PlayerID] != client {
		return
	}
	r := h.RoomManager.GetRoom(identity.RoomCode)
	if msg.Type == "_disconnect" {
		if r == nil {
			return
		}
		delete(h.active, identity.PlayerID)
		r.Disconnect(identity.PlayerID)
		h.broadcastRoomState(r)
		if r.OnlineHumans() == 0 {
			if timer := h.expiry[r.Code]; timer != nil {
				timer.Stop()
			}
			// Preserve active and finished sessions for ten minutes after the last human disconnects.
			h.expiry[r.Code] = time.AfterFunc(10*time.Minute, func() {
				h.mu.Lock()
				defer h.mu.Unlock()
				if r.OnlineHumans() != 0 {
					return
				}
				if b, ok := game.GetBridge(r.Snapshot().SessionID); ok {
					b.Stop()
					game.RemoveBridge(b.Session.SessionID())
				}
				h.RoomManager.RemoveRoom(r.Code)
				delete(h.expiry, r.Code)
			})
		}
		return
	}
	switch msg.Type {
	case ws.MsgCreateRoom:
		if identity.PlayerID != "" {
			client.SendError("already in a room")
			return
		}
		var d ws.CreateRoomData
		if json.Unmarshal(msg.Data, &d) != nil || !validName(d.Nickname) {
			client.SendError("nickname must contain 1 to 20 characters")
			return
		}
		p := &room.PlayerInfo{ID: uuid.NewString(), Nickname: strings.TrimSpace(d.Nickname)}
		r = h.RoomManager.CreateRoom(p)
		if r == nil {
			client.SendError("room capacity reached; try later")
			return
		}
		h.attach(client, r, p, r.Token(p.ID), false)
		return
	case ws.MsgJoinRoom:
		if identity.PlayerID != "" {
			client.SendError("already in a room")
			return
		}
		var d ws.JoinRoomData
		if json.Unmarshal(msg.Data, &d) != nil || !validName(d.Nickname) {
			client.SendError("nickname must contain 1 to 20 characters")
			return
		}
		r = h.RoomManager.GetRoom(strings.ToUpper(strings.TrimSpace(d.RoomCode)))
		if r == nil {
			client.SendError("room not found")
			return
		}
		p := &room.PlayerInfo{ID: uuid.NewString(), Nickname: strings.TrimSpace(d.Nickname)}
		token, err := r.Join(p)
		if err != nil {
			client.SendError(err.Error())
			return
		}
		h.attach(client, r, p, token, false)
		return
	case ws.MsgResumeRoom:
		if identity.PlayerID != "" {
			client.SendError("already in a room")
			return
		}
		var d ws.ResumeRoomData
		if json.Unmarshal(msg.Data, &d) != nil {
			h.resumeError(client)
			return
		}
		r = h.RoomManager.GetRoom(d.RoomCode)
		if r == nil {
			h.resumeError(client)
			return
		}
		p, err := r.Resume(d.Token)
		if err != nil {
			h.resumeError(client)
			return
		}
		h.attach(client, r, p, d.Token, true)
		return
	}
	if r == nil || identity.PlayerID == "" {
		client.SendError("room not found")
		return
	}
	state := r.Snapshot()
	switch msg.Type {
	case ws.MsgSelectTeam:
		var d ws.SelectTeamData
		if json.Unmarshal(msg.Data, &d) != nil {
			client.SendError("invalid select_team data")
			return
		}
		// Use the room's membership record, including its connection state.
		var player *room.PlayerInfo
		for _, p := range state.Players {
			if p.ID == identity.PlayerID {
				player = p
				break
			}
		}
		if player == nil {
			client.SendError("player not found")
			return
		}
		if err := r.AddToTeam(player, d.Team); err != nil {
			client.SendError(err.Error())
			return
		}
		h.broadcastRoomState(r)
	case ws.MsgLeaveTeam:
		if err := r.LeaveTeam(identity.PlayerID); err != nil {
			client.SendError(err.Error())
			return
		}
		h.broadcastRoomState(r)
	case ws.MsgAddAI:
		var d ws.AddAIData
		if json.Unmarshal(msg.Data, &d) != nil {
			client.SendError("invalid add_ai data")
			return
		}
		if state.OwnerID != identity.PlayerID {
			client.SendError("only the room owner can add AI players")
			return
		}
		if err := r.AddAI(d.Team); err != nil {
			client.SendError(err.Error())
			return
		}
		h.broadcastRoomState(r)
	case ws.MsgRemoveAI:
		var d ws.RemoveAIData
		if json.Unmarshal(msg.Data, &d) != nil {
			client.SendError("invalid remove_ai data")
			return
		}
		if state.OwnerID != identity.PlayerID {
			client.SendError("only the room owner can remove AI players")
			return
		}
		if err := r.RemoveAI(d.Team, d.Index); err != nil {
			client.SendError(err.Error())
			return
		}
		h.broadcastRoomState(r)
	case ws.MsgStartGame:
		if state.OwnerID != identity.PlayerID {
			client.SendError("only the room owner can start the game")
			return
		}
		b, err := game.NewBridge(r, h.Hub)
		if err != nil {
			client.SendError(err.Error())
			return
		}
		b.Start()
	case ws.MsgRequestSync:
		h.sendSync(client, r)
	case ws.MsgSubmitClues, ws.MsgSubmitIntercept, ws.MsgSubmitDecrypt, ws.MsgProgress:
		b, ok := game.GetBridge(state.SessionID)
		if !ok {
			client.SendError("game session not found")
			return
		}
		var err error
		switch msg.Type {
		case ws.MsgSubmitClues:
			var d ws.SubmitCluesData
			err = json.Unmarshal(msg.Data, &d)
			if err == nil {
				err = b.SubmitClues(identity.PlayerID, d)
			}
		case ws.MsgSubmitIntercept, ws.MsgSubmitDecrypt:
			var d ws.SubmitGuessData
			err = json.Unmarshal(msg.Data, &d)
			phase := "decrypt"
			if msg.Type == ws.MsgSubmitIntercept {
				phase = "intercept"
			}
			if err == nil {
				err = b.SubmitGuess(identity.PlayerID, phase, d)
			}
		case ws.MsgProgress:
			var d ws.ProgressData
			if json.Unmarshal(msg.Data, &d) != nil || b.ValidateProgress(identity.PlayerID, d) != nil {
				return
			}
			h.Hub.BroadcastToRoom(r.Code, ws.ServerMessage{Type: ws.MsgPlayerProgress, Data: ws.PlayerProgressData{Action: d.Action, Player: identity.Nickname, State: d.State, Step: d.Step, Focus: d.Focus, Guesses: d.Guesses, Filled: d.Filled, Total: 3}})
		}
		if err != nil {
			client.SendError(err.Error())
		}
	default:
		client.SendError("unknown message type: " + msg.Type)
	}
}

func (h *Handler) resumeError(client *ws.Client) {
	client.SendMessage(ws.ServerMessage{Type: ws.MsgError, Data: ws.ErrorData{Code: "resume_expired", Message: "room resume expired; please create or join a room"}})
}

func (h *Handler) sendSync(client *ws.Client, r *room.Room) {
	data := &ws.FullSyncData{Room: h.buildRoomStateData(r)}
	data.Room.MyPlayerID = client.Identity().PlayerID
	if b, ok := game.GetBridge(r.Snapshot().SessionID); ok {
		data.Game = b.Sync(client.Identity().PlayerID)
	}
	client.SendMessage(ws.ServerMessage{Type: ws.MsgFullSync, Data: data})
}

func (h *Handler) broadcastRoomState(r *room.Room) {
	base := h.buildRoomStateData(r)
	for _, c := range h.Hub.GetRoomClients(r.Code) {
		d := *base
		d.MyPlayerID = c.Identity().PlayerID
		c.SendMessage(ws.ServerMessage{Type: ws.MsgRoomState, Data: d})
	}
}

func (h *Handler) buildRoomStateData(r *room.Room) *ws.RoomStateData {
	s := r.Snapshot()
	convert := func(players []*room.PlayerInfo) []ws.PlayerInfo {
		out := make([]ws.PlayerInfo, 0, len(players))
		for _, p := range players {
			out = append(out, ws.PlayerInfo{ID: p.ID, Nickname: p.Nickname, IsAI: p.IsAI, Disconnected: p.Disconnected})
		}
		return out
	}
	return &ws.RoomStateData{RoomCode: s.Code, OwnerID: s.OwnerID, Started: s.Started, CanStart: s.CanStart, Players: convert(s.Players), TeamA: convert(s.TeamA), TeamB: convert(s.TeamB)}
}
