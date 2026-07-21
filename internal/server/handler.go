package server

import (
	"encoding/json"
	"log"

	"github.com/google/uuid"

	"github.com/ZinkLu/decrypto-the-game/internal/game"
	"github.com/ZinkLu/decrypto-the-game/internal/room"
	"github.com/ZinkLu/decrypto-the-game/internal/ws"

	"github.com/ZinkLu/decrypto-the-game/internal/core"
)

// Handler is the central WebSocket message dispatcher.
type Handler struct {
	RoomManager *room.Manager
	Hub         *ws.Hub
}

// NewHandler constructs a Handler with the given RoomManager and Hub.
// hub may be nil at construction time and set later via Handler.Hub.
func NewHandler(roomManager *room.Manager, hub *ws.Hub) *Handler {
	return &Handler{
		RoomManager: roomManager,
		Hub:         hub,
	}
}

// HandleMessage dispatches inbound client messages to the appropriate handler.
func (h *Handler) HandleMessage(client *ws.Client, msg ws.ClientMessage) {
	switch msg.Type {

	// ----- Room operations -----

	case ws.MsgCreateRoom:
		var data ws.CreateRoomData
		if err := json.Unmarshal(msg.Data, &data); err != nil {
			client.SendError("invalid create_room data")
			return
		}
		client.PlayerID = uuid.NewString()
		client.Nickname = data.Nickname

		owner := &room.PlayerInfo{
			ID:       client.PlayerID,
			Nickname: client.Nickname,
		}
		r := h.RoomManager.CreateRoom(owner)
		h.Hub.JoinRoom(client, r.Code)

		client.SendMessage(ws.ServerMessage{
			Type: ws.MsgRoomCreated,
			Data: ws.RoomCreatedData{RoomCode: r.Code, MyPlayerID: client.PlayerID},
		})
		h.broadcastRoomState(r)

	case ws.MsgJoinRoom:
		var data ws.JoinRoomData
		if err := json.Unmarshal(msg.Data, &data); err != nil {
			client.SendError("invalid join_room data")
			return
		}
		r := h.RoomManager.GetRoom(data.RoomCode)
		if r == nil {
			client.SendError("room not found")
			return
		}
		if r.Started {
			client.SendError("game already started")
			return
		}
		client.PlayerID = uuid.NewString()
		client.Nickname = data.Nickname

		h.Hub.JoinRoom(client, r.Code)
		h.broadcastRoomState(r)

	case ws.MsgSelectTeam:
		var data ws.SelectTeamData
		if err := json.Unmarshal(msg.Data, &data); err != nil {
			client.SendError("invalid select_team data")
			return
		}
		r := h.RoomManager.GetRoom(client.RoomCode)
		if r == nil {
			client.SendError("room not found")
			return
		}
		player := &room.PlayerInfo{
			ID:       client.PlayerID,
			Nickname: client.Nickname,
		}
		if err := r.AddToTeam(player, data.Team); err != nil {
			client.SendError(err.Error())
			return
		}
		h.broadcastRoomState(r)

	case ws.MsgLeaveTeam:
		r := h.RoomManager.GetRoom(client.RoomCode)
		if r == nil {
			client.SendError("room not found")
			return
		}
		r.RemovePlayer(client.PlayerID)
		h.broadcastRoomState(r)

	case ws.MsgAddAI:
		var data ws.AddAIData
		if err := json.Unmarshal(msg.Data, &data); err != nil {
			client.SendError("invalid add_ai data")
			return
		}
		r := h.RoomManager.GetRoom(client.RoomCode)
		if r == nil {
			client.SendError("room not found")
			return
		}
		if r.OwnerID != client.PlayerID {
			client.SendError("only the room owner can add AI players")
			return
		}
		if err := r.AddAI(data.Team); err != nil {
			client.SendError(err.Error())
			return
		}
		h.broadcastRoomState(r)

	case ws.MsgRemoveAI:
		var data ws.RemoveAIData
		if err := json.Unmarshal(msg.Data, &data); err != nil {
			client.SendError("invalid remove_ai data")
			return
		}
		r := h.RoomManager.GetRoom(client.RoomCode)
		if r == nil {
			client.SendError("room not found")
			return
		}
		if r.OwnerID != client.PlayerID {
			client.SendError("only the room owner can remove AI players")
			return
		}
		if err := r.RemoveAI(data.Team, data.Index); err != nil {
			client.SendError(err.Error())
			return
		}
		h.broadcastRoomState(r)

	case ws.MsgStartGame:
		r := h.RoomManager.GetRoom(client.RoomCode)
		if r == nil {
			client.SendError("room not found")
			return
		}
		if r.OwnerID != client.PlayerID {
			client.SendError("only the room owner can start the game")
			return
		}
		if !r.CanStart() {
			client.SendError("not enough players to start (need at least 2 per team)")
			return
		}
		bridge, err := game.NewBridge(r, h.Hub)
		if err != nil {
			log.Printf("server: failed to create bridge: %v", err)
			client.SendError("failed to start game: " + err.Error())
			return
		}
		bridge.Start()

	// ----- Game operations -----

	case ws.MsgSubmitClues:
		var data ws.SubmitCluesData
		if err := json.Unmarshal(msg.Data, &data); err != nil {
			client.SendError("invalid submit_clues data")
			return
		}
		r := h.RoomManager.GetRoom(client.RoomCode)
		if r == nil {
			client.SendError("room not found")
			return
		}
		bridge, ok := game.GetBridge(r.SessionID)
		if !ok {
			client.SendError("game session not found")
			return
		}
		round := bridge.Session.GetCurrentRound()
		if round == nil || round.EncryptPlayer().UID != client.PlayerID {
			client.SendError("you are not the current encryptor")
			return
		}
		select {
		case bridge.CluesCh <- data.Clues:
		default:
			client.SendError("clues already submitted")
		}

	case ws.MsgSubmitIntercept:
		var data ws.SubmitGuessData
		if err := json.Unmarshal(msg.Data, &data); err != nil {
			client.SendError("invalid submit_intercept data")
			return
		}
		r := h.RoomManager.GetRoom(client.RoomCode)
		if r == nil {
			client.SendError("room not found")
			return
		}
		bridge, ok := game.GetBridge(r.SessionID)
		if !ok {
			client.SendError("game session not found")
			return
		}
		select {
		case bridge.InterceptCh <- data.Guess:
		default:
			client.SendError("intercept already submitted")
		}

	case ws.MsgSubmitDecrypt:
		var data ws.SubmitGuessData
		if err := json.Unmarshal(msg.Data, &data); err != nil {
			client.SendError("invalid submit_decrypt data")
			return
		}
		r := h.RoomManager.GetRoom(client.RoomCode)
		if r == nil {
			client.SendError("room not found")
			return
		}
		bridge, ok := game.GetBridge(r.SessionID)
		if !ok {
			client.SendError("game session not found")
			return
		}
		select {
		case bridge.DecryptCh <- data.Guess:
		default:
			client.SendError("decrypt already submitted")
		}

	case ws.MsgProgress:
		var data ws.ProgressData
		if err := json.Unmarshal(msg.Data, &data); err != nil {
			client.SendError("invalid progress data")
			return
		}
		if data.Step < 0 || data.Step > 3 {
			return
		}
		if data.Focus < 0 || data.Focus > 3 {
			return
		}
		switch data.State {
		case "", "idle", "editing", "submitted":
		default:
			return
		}
		r := h.RoomManager.GetRoom(client.RoomCode)
		if r == nil {
			return
		}
		h.Hub.BroadcastToRoom(r.Code, ws.ServerMessage{
			Type: ws.MsgPlayerProgress,
			Data: ws.PlayerProgressData{
				Action:  data.Action,
				Player:  client.Nickname,
				State:   data.State,
				Step:    data.Step,
				Focus:   data.Focus,
				Guesses: data.Guesses,
				Total:   3,
			},
		})

	case ws.MsgRequestSync:
		r := h.RoomManager.GetRoom(client.RoomCode)
		syncData := &ws.FullSyncData{}
		if r != nil {
			syncData.Room = h.buildRoomStateData(r)
			syncData.Room.MyPlayerID = client.PlayerID
		}
		if r != nil && r.SessionID != "" {
			bridge, ok := game.GetBridge(r.SessionID)
			if ok {
				syncData.Game = h.buildGameSyncData(client, bridge)
			}
		}
		client.SendMessage(ws.ServerMessage{
			Type: ws.MsgFullSync,
			Data: syncData,
		})

	// ----- Disconnect pseudo-message -----

	case "_disconnect":
		r := h.RoomManager.GetRoom(client.RoomCode)
		if r == nil {
			return
		}
		if !r.Started {
			r.RemovePlayer(client.PlayerID)
			h.broadcastRoomState(r)
		}

	default:
		log.Printf("server: unknown message type %q from player %s", msg.Type, client.PlayerID)
		client.SendError("unknown message type: " + msg.Type)
	}
}

// broadcastRoomState sends a personalized room state to each client in the room,
// so that each client receives their own my_player_id.
func (h *Handler) broadcastRoomState(r *room.Room) {
	base := h.buildRoomStateData(r)
	clients := h.Hub.GetRoomClients(r.Code)
	for _, c := range clients {
		data := *base
		data.MyPlayerID = c.PlayerID
		c.SendMessage(ws.ServerMessage{
			Type: ws.MsgRoomState,
			Data: &data,
		})
	}
}

// buildRoomStateData converts a room into the wire-format RoomStateData.
func (h *Handler) buildRoomStateData(r *room.Room) *ws.RoomStateData {
	toPlayerInfoSlice := func(players []*room.PlayerInfo) []ws.PlayerInfo {
		out := make([]ws.PlayerInfo, len(players))
		for i, p := range players {
			out[i] = ws.PlayerInfo{
				ID:       p.ID,
				Nickname: p.Nickname,
				IsAI:     p.IsAI,
			}
		}
		return out
	}

	allPlayers := r.GetAllPlayers()

	return &ws.RoomStateData{
		RoomCode: r.Code,
		Players:  toPlayerInfoSlice(allPlayers),
		TeamA:    toPlayerInfoSlice(r.TeamA),
		TeamB:    toPlayerInfoSlice(r.TeamB),
		OwnerID:  r.OwnerID,
		CanStart: r.CanStart(),
	}
}

// buildGameSyncData constructs a GameSyncData for the requesting client from the active bridge.
func (h *Handler) buildGameSyncData(client *ws.Client, bridge *game.Bridge) *ws.GameSyncData {
	round := bridge.Session.GetCurrentRound()
	teams := bridge.Session.GetTeams()

	scoreA := ws.ScoreInfo{
		Interceptions:   int(teams[0].InterceptedCounts),
		DecryptFailures: int(teams[0].DecryptWrongCounts),
	}
	scoreB := ws.ScoreInfo{
		Interceptions:   int(teams[1].InterceptedCounts),
		DecryptFailures: int(teams[1].DecryptWrongCounts),
	}

	if round == nil {
		return &ws.GameSyncData{
			Phase:  "waiting",
			ScoreA: scoreA,
			ScoreB: scoreB,
		}
	}

	// Determine which team the client is on ("A" or "B") and their words.
	teamLabel := "A"
	var words [4]string
	for _, p := range teams[0].Members() {
		if p.UID == client.PlayerID {
			words = teams[0].GetWords()
			teamLabel = "A"
			break
		}
	}
	for _, p := range teams[1].Members() {
		if p.UID == client.PlayerID {
			words = teams[1].GetWords()
			teamLabel = "B"
			break
		}
	}

	// Determine the player's role in the current round.
	role := "observer"
	if round.EncryptPlayer().UID == client.PlayerID {
		role = "encryptor"
	} else {
		currentTeam := round.GetCurrentTeam()
		for _, p := range currentTeam.Members() {
			if p.UID == client.PlayerID {
				role = "teammate"
				break
			}
		}
		if role == "observer" {
			// Check opponent team.
			opponent := round.GetOpponent()
			for _, p := range opponent.Members() {
				if p.UID == client.PlayerID {
					role = "opponent"
					break
				}
			}
		}
	}

	state := round.GetTeamState()
	phase := stateToPhase(state)

	syncData := &ws.GameSyncData{
		Phase:    phase,
		Round:    int(round.GetNumberOfRounds()),
		YourRole: role,
		YourTeam: teamLabel,
		Words:    words[:],
		ScoreA:   scoreA,
		ScoreB:   scoreB,
	}

	// Replay the server-side countdown for clients resyncing mid-phase.
	switch phase {
	case "encrypting", "intercept", "decrypt":
		syncData.Deadline = bridge.PhaseDeadline()
	}

	// Include clues if they are available (encrypting phase done or later).
	encryptedMsg := round.GetEncryptedMessage()
	if encryptedMsg[0] != "" {
		syncData.Clues = encryptedMsg[:]
	}

	// If the client is the encryptor, share the secret digits/words.
	if role == "encryptor" {
		digits := round.GetSecretDigits()
		secretWords := round.GetSecretWords()
		syncData.SecretDigits = digits[:]
		syncData.SecretWords = secretWords[:]
	}

	return syncData
}

// stateToPhase converts a core TeamState to the string phase name used on the wire.
func stateToPhase(state core.TeamState) string {
	switch state {
	case core.NEW:
		return "new"
	case core.INIT:
		return "init"
	case core.ENCRYPTING:
		return "encrypting"
	case core.INTERCEPT:
		return "intercept"
	case core.DECRYPT:
		return "decrypt"
	case core.DONE:
		return "done"
	default:
		return "unknown"
	}
}
