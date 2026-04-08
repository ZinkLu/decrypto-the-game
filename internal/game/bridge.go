package game

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/ZinkLu/decrypto-the-game/internal/ai"
	"github.com/ZinkLu/decrypto-the-game/internal/ai/providers"
	"github.com/ZinkLu/decrypto-the-game/internal/core"
	"github.com/ZinkLu/decrypto-the-game/internal/room"
	"github.com/ZinkLu/decrypto-the-game/internal/ws"
)

// Bridge connects the WebSocket layer to the core game engine.
// It creates channels that WebSocket handlers write to, and registered
// core handlers block on those channels to feed data into AutoForward.
type Bridge struct {
	Room        *room.Room
	Session     *core.Session
	Hub         *ws.Hub
	CluesCh     chan [3]string
	InterceptCh chan [3]int
	DecryptCh   chan [3]int
	AIPlayer    *ai.AIPlayer
	cancel      context.CancelFunc
}

// NewBridge creates a Bridge from room data, initialises the core Session,
// and registers the bridge in the global registry.
func NewBridge(r *room.Room, hub *ws.Hub) (*Bridge, error) {
	teamAPlayers := make([]*core.Player, len(r.TeamA))
	for i, p := range r.TeamA {
		teamAPlayers[i] = &core.Player{UID: p.ID, NickName: p.Nickname}
	}

	teamBPlayers := make([]*core.Player, len(r.TeamB))
	for i, p := range r.TeamB {
		teamBPlayers[i] = &core.Player{UID: p.ID, NickName: p.Nickname}
	}

	session, err := core.NewWithTeams(r.Code, teamAPlayers, teamBPlayers)
	if err != nil {
		return nil, err
	}

	r.SessionID = session.SessionID()
	r.Started = true

	b := &Bridge{
		Room:        r,
		Session:     session,
		Hub:         hub,
		CluesCh:     make(chan [3]string, 1),
		InterceptCh: make(chan [3]int, 1),
		DecryptCh:   make(chan [3]int, 1),
	}

	// Wire up AI player if any team has AI members.
	hasAI := false
	for _, p := range r.TeamA {
		if p.IsAI {
			hasAI = true
			break
		}
	}
	if !hasAI {
		for _, p := range r.TeamB {
			if p.IsAI {
				hasAI = true
				break
			}
		}
	}
	if hasAI {
		var provider ai.LLMProvider
		if key := os.Getenv("OPENAI_API_KEY"); key != "" {
			baseURL := os.Getenv("OPENAI_BASE_URL")
			model := os.Getenv("OPENAI_MODEL")
			provider = providers.NewOpenAIProvider(key, baseURL, model)
			log.Printf("bridge: using OpenAI-compatible provider (base=%s, model=%s)", baseURL, model)
		} else if key := os.Getenv("ANTHROPIC_API_KEY"); key != "" {
			provider = providers.NewClaudeProvider(key)
			log.Printf("bridge: using Claude provider")
		}
		if provider != nil {
			b.AIPlayer = ai.NewAIPlayer(provider)
		} else {
			log.Printf("bridge: no LLM API key set (OPENAI_API_KEY or ANTHROPIC_API_KEY); AI players will use fallback stubs")
		}
	}

	RegisterBridge(session.SessionID(), b)
	return b, nil
}

// Start launches AutoForward in a background goroutine.
func (b *Bridge) Start() {
	ctx, cancel := context.WithCancel(context.Background())
	b.cancel = cancel

	go func() {
		defer RemoveBridge(b.Session.SessionID())
		b.Session.AutoForward(ctx)
	}()
}

// Stop cancels the AutoForward goroutine.
func (b *Bridge) Stop() {
	if b.cancel != nil {
		b.cancel()
	}
}

// ---------------------------------------------------------------------------
// RegisterHandlers registers all core handlers. Call ONCE at server startup.
// ---------------------------------------------------------------------------

func RegisterHandlers() {
	core.RegisterInitHandler(initHandler)
	core.RegisterEncryptHandler(encryptHandler)
	core.RegisterInterceptHandler(interceptHandler)
	core.RegisterInterceptSuccessHandler(interceptSuccessHandler)
	core.RegisterInterceptFailHandler(interceptFailHandler)
	core.RegisterDecryptHandler(decryptHandler)
	core.RegisterDecryptSuccessHandler(decryptSuccessHandler)
	core.RegisterDecryptFailHandler(decryptFailHandler)
	core.RegisterDoneHandler(doneHandler)
	core.RegisterGameOverHandler(gameOverHandler)
}

// ---------------------------------------------------------------------------
// Handler implementations
// ---------------------------------------------------------------------------

func initHandler(ctx context.Context, r *core.Round, ts core.TeamState) bool {
	b, ok := GetBridge(r.GetGameSession().SessionID())
	if !ok {
		log.Printf("bridge: initHandler: bridge not found for session %s", r.GetGameSession().SessionID())
		return true // cancel
	}

	if r.GetNumberOfRounds() == 1 {
		b.broadcastGameStart(r)
	} else {
		// Give players time to review the previous round result.
		select {
		case <-time.After(5 * time.Second):
		case <-ctx.Done():
			return true
		}
		b.broadcastPhaseChange("new_round", r)
	}
	return false
}

func encryptHandler(ctx context.Context, r *core.Round, t *core.Team, p *core.Player, ts core.TeamState) ([3]string, bool) {
	b, ok := GetBridge(r.GetGameSession().SessionID())
	if !ok {
		log.Printf("bridge: encryptHandler: bridge not found for session %s", r.GetGameSession().SessionID())
		return [3]string{}, true
	}

	log.Printf("[PHASE] Round %d → ENCRYPTING | encryptor=%s (AI=%v) | team=%s",
		r.GetNumberOfRounds(), p.NickName, isAI(p.UID), b.teamLabel(t))
	b.broadcastPhaseChange("encrypting", r)

	// Check if the encryptor is an AI player.
	if isAI(p.UID) {
		return handleAIEncrypt(ctx, b, r), false
	}

	// Block on channel waiting for player input.
	select {
	case clues := <-b.CluesCh:
		// Broadcast clues_submitted to the room.
		scoreA, scoreB := b.buildScores()
		b.Hub.BroadcastToRoom(b.Room.Code, ws.ServerMessage{
			Type: ws.MsgCluesSubmitted,
			Data: ws.PhaseChangeData{
				Phase:   "encrypting",
				Round:   int(r.GetNumberOfRounds()),
				Clues:   clues[:],
				History: b.buildHistory(r),
				Waiting: false,
			},
		})
		_ = scoreA
		_ = scoreB
		return clues, false
	case <-time.After(90 * time.Second):
		log.Printf("bridge: encryptHandler: timeout waiting for clues in session %s", r.GetGameSession().SessionID())
		return [3]string{"...", "...", "..."}, false
	case <-ctx.Done():
		return [3]string{}, true
	}
}

func interceptHandler(ctx context.Context, r *core.Round, opponent *core.Team, ts core.TeamState) ([3]int, bool) {
	b, ok := GetBridge(r.GetGameSession().SessionID())
	if !ok {
		log.Printf("bridge: interceptHandler: bridge not found for session %s", r.GetGameSession().SessionID())
		return [3]int{}, true
	}

	log.Printf("[PHASE] Round %d → INTERCEPT | opponent team=%s allAI=%v",
		r.GetNumberOfRounds(), b.teamLabel(opponent), b.isTeamAllAI(opponent))
	b.broadcastPhaseChange("intercept", r)

	if b.isTeamAllAI(opponent) {
		return handleAIIntercept(ctx, b, r), false
	}

	select {
	case guess := <-b.InterceptCh:
		return guess, false
	case <-time.After(60 * time.Second):
		log.Printf("bridge: interceptHandler: timeout waiting for intercept in session %s", r.GetGameSession().SessionID())
		return [3]int{0, 0, 0}, false
	case <-ctx.Done():
		return [3]int{}, true
	}
}

func interceptSuccessHandler(ctx context.Context, r *core.Round, opponent *core.Team, ts core.TeamState) bool {
	b, ok := GetBridge(r.GetGameSession().SessionID())
	if !ok {
		return false
	}

	log.Printf("[RESULT] Round %d | INTERCEPT SUCCESS by team %s", r.GetNumberOfRounds(), b.teamLabel(opponent))
	b.broadcastRoundResult(r, boolPtr(true), nil)
	return false
}

func interceptFailHandler(ctx context.Context, r *core.Round, opponent *core.Team, ts core.TeamState) bool {
	b, ok := GetBridge(r.GetGameSession().SessionID())
	if !ok {
		return false
	}

	log.Printf("[RESULT] Round %d | INTERCEPT FAILED by team %s", r.GetNumberOfRounds(), b.teamLabel(opponent))
	b.broadcastRoundResult(r, boolPtr(false), nil)

	select {
	case <-time.After(3 * time.Second):
	case <-ctx.Done():
		return true
	}
	return false
}

func decryptHandler(ctx context.Context, r *core.Round, t *core.Team, ts core.TeamState) ([3]int, bool) {
	b, ok := GetBridge(r.GetGameSession().SessionID())
	if !ok {
		log.Printf("bridge: decryptHandler: bridge not found for session %s", r.GetGameSession().SessionID())
		return [3]int{}, true
	}

	encryptorUID := r.EncryptPlayer().UID
	decryptorsAllAI := b.areDecryptorsAllAI(t, encryptorUID)
	log.Printf("[PHASE] Round %d → DECRYPT | team=%s allAI=%v decryptorsAllAI=%v encryptor=%s",
		r.GetNumberOfRounds(), b.teamLabel(t), b.isTeamAllAI(t), decryptorsAllAI, r.EncryptPlayer().NickName)
	b.broadcastPhaseChange("decrypt", r)

	if decryptorsAllAI {
		return handleAIDecrypt(ctx, b, r), false
	}

	select {
	case guess := <-b.DecryptCh:
		return guess, false
	case <-time.After(60 * time.Second):
		log.Printf("bridge: decryptHandler: timeout waiting for decrypt in session %s", r.GetGameSession().SessionID())
		return [3]int{0, 0, 0}, false
	case <-ctx.Done():
		return [3]int{}, true
	}
}

func decryptSuccessHandler(ctx context.Context, r *core.Round, t *core.Team, ts core.TeamState) bool {
	b, ok := GetBridge(r.GetGameSession().SessionID())
	if !ok {
		return false
	}

	log.Printf("[RESULT] Round %d | DECRYPT SUCCESS by team %s", r.GetNumberOfRounds(), b.teamLabel(t))
	b.broadcastRoundResult(r, nil, boolPtr(true))
	return false
}

func decryptFailHandler(ctx context.Context, r *core.Round, t *core.Team, ts core.TeamState) bool {
	b, ok := GetBridge(r.GetGameSession().SessionID())
	if !ok {
		return false
	}

	log.Printf("[RESULT] Round %d | DECRYPT FAILED by team %s", r.GetNumberOfRounds(), b.teamLabel(t))
	b.broadcastRoundResult(r, nil, boolPtr(false))
	return false
}

func doneHandler(ctx context.Context, r *core.Round, ts core.TeamState) bool {
	return false
}

func gameOverHandler(ctx context.Context, s *core.Session, winner *core.Team) bool {
	b, ok := GetBridge(s.SessionID())
	if !ok {
		return true
	}

	b.broadcastGameOver(winner)
	return true
}

// ---------------------------------------------------------------------------
// Helper methods on Bridge
// ---------------------------------------------------------------------------

// playerTeamLabel returns "A" or "B" for the given player ID.
func (b *Bridge) playerTeamLabel(playerID string) string {
	teams := b.Session.GetTeams()
	for _, p := range teams[0].Members() {
		if p.UID == playerID {
			return "A"
		}
	}
	return "B"
}

// teamLabel returns "A" or "B" by comparing the team to Session's first team.
func (b *Bridge) teamLabel(team *core.Team) string {
	if team == b.Session.GetTeams()[0] {
		return "A"
	}
	return "B"
}

// playerRole returns "encryptor", "teammate", or "opponent" for the given player
// in the context of the current round.
func (b *Bridge) playerRole(playerID string, round *core.Round) string {
	if round.EncryptPlayer().UID == playerID {
		return "encryptor"
	}

	currentTeam := round.GetCurrentTeam()
	for _, p := range currentTeam.Members() {
		if p.UID == playerID {
			return "teammate"
		}
	}
	return "opponent"
}

// buildHistory traverses the previous-round chain and builds a history slice.
func (b *Bridge) buildHistory(currentRound *core.Round) []ws.RoundHistoryRow {
	var rows []ws.RoundHistoryRow

	for r := currentRound.GetPreviousRound(); r != nil; r = r.GetPreviousRound() {
		clues := r.GetEncryptedMessage()
		secret := r.GetSecretDigits()
		intercept := r.GetInterceptSecret()
		decrypt := r.GetDecryptSecret()

		row := ws.RoundHistoryRow{
			Round:     int(r.GetNumberOfRounds()),
			Team:      b.teamLabel(r.GetCurrentTeam()),
			Clues:     clues[:],
			Secret:    secret[:],
			Intercept: intercept[:],
			Decrypt:   decrypt[:],
		}
		rows = append(rows, row)
	}

	// Reverse so oldest round is first.
	for i, j := 0, len(rows)-1; i < j; i, j = i+1, j-1 {
		rows[i], rows[j] = rows[j], rows[i]
	}

	return rows
}

// buildScores returns ScoreInfo for team A and team B.
func (b *Bridge) buildScores() (ws.ScoreInfo, ws.ScoreInfo) {
	teams := b.Session.GetTeams()
	scoreA := ws.ScoreInfo{
		Interceptions:   int(teams[0].InterceptedCounts),
		DecryptFailures: int(teams[0].DecryptWrongCounts),
	}
	scoreB := ws.ScoreInfo{
		Interceptions:   int(teams[1].InterceptedCounts),
		DecryptFailures: int(teams[1].DecryptWrongCounts),
	}
	return scoreA, scoreB
}

// broadcastToEachPlayer sends a personalized message to each player in the room.
func (b *Bridge) broadcastToEachPlayer(buildMsg func(playerID string) *ws.ServerMessage) {
	clients := b.Hub.GetRoomClients(b.Room.Code)
	for _, c := range clients {
		if c.PlayerID == "" {
			continue
		}
		msg := buildMsg(c.PlayerID)
		if msg != nil {
			c.SendMessage(*msg)
		}
	}
}

// broadcastGameStart sends a personalized game_start message to each player.
func (b *Bridge) broadcastGameStart(round *core.Round) {
	teams := b.Session.GetTeams()

	b.broadcastToEachPlayer(func(playerID string) *ws.ServerMessage {
		teamLabel := b.playerTeamLabel(playerID)
		role := b.playerRole(playerID, round)

		var words [4]string
		if teamLabel == "A" {
			words = teams[0].GetWords()
		} else {
			words = teams[1].GetWords()
		}

		return &ws.ServerMessage{
			Type: ws.MsgGameStart,
			Data: ws.GameStartData{
				Round:    int(round.GetNumberOfRounds()),
				YourRole: role,
				YourTeam: teamLabel,
				Words:    words[:],
			},
		}
	})
}

// broadcastPhaseChange sends a personalized phase_change message to each player.
func (b *Bridge) broadcastPhaseChange(phase string, round *core.Round) {
	b.broadcastToEachPlayer(func(playerID string) *ws.ServerMessage {
		role := b.playerRole(playerID, round)
		encryptor := round.EncryptPlayer()

		data := ws.PhaseChangeData{
			Phase:     phase,
			Round:     int(round.GetNumberOfRounds()),
			YourRole:  role,
			Encryptor: encryptor.NickName,
			History:   b.buildHistory(round),
		}

		switch phase {
		case "encrypting":
			if role == "encryptor" {
				digits := round.GetSecretDigits()
				secretWords := round.GetSecretWords()
				data.SecretDigits = digits[:]
				data.SecretWords = secretWords[:]
			} else {
				data.Waiting = true
			}

		case "intercept":
			if role == "opponent" {
				clues := round.GetEncryptedMessage()
				data.Clues = clues[:]
			} else {
				data.Waiting = true
			}

		case "decrypt":
			if role == "teammate" {
				clues := round.GetEncryptedMessage()
				data.Clues = clues[:]
			} else if role == "encryptor" {
				// Encryptor watches teammates decode; they already know the answer.
				digits := round.GetSecretDigits()
				data.SecretDigits = digits[:]
				data.Waiting = true
			} else {
				data.Waiting = true
			}

		case "new_round":
			// No special data; just the phase and round info.
		}

		return &ws.ServerMessage{
			Type: ws.MsgPhaseChange,
			Data: data,
		}
	})
}

// broadcastRoundResult sends round_result to the room.
func (b *Bridge) broadcastRoundResult(round *core.Round, interceptSuccess *bool, decryptSuccess *bool) {
	scoreA, scoreB := b.buildScores()

	b.Hub.BroadcastToRoom(b.Room.Code, ws.ServerMessage{
		Type: ws.MsgRoundResult,
		Data: ws.RoundResultData{
			InterceptSuccess: interceptSuccess,
			DecryptSuccess:   decryptSuccess,
			ScoreA:           scoreA,
			ScoreB:           scoreB,
		},
	})
}

// broadcastGameOver sends game_over to the room.
func (b *Bridge) broadcastGameOver(winner *core.Team) {
	scoreA, scoreB := b.buildScores()

	var winnerLabel *string
	if winner != nil {
		label := b.teamLabel(winner)
		winnerLabel = &label
	}

	b.Hub.BroadcastToRoom(b.Room.Code, ws.ServerMessage{
		Type: ws.MsgGameOver,
		Data: ws.GameOverData{
			Winner: winnerLabel,
			ScoreA: scoreA,
			ScoreB: scoreB,
		},
	})
}

// isTeamAllAI returns true if every member of the team is an AI player.
func (b *Bridge) isTeamAllAI(team *core.Team) bool {
	for _, p := range team.Members() {
		if !isAI(p.UID) {
			return false
		}
	}
	return true
}

// areDecryptorsAllAI returns true if every non-encryptor member of the team is AI.
// During decrypt, the encryptor doesn't participate, so we only check teammates.
func (b *Bridge) areDecryptorsAllAI(team *core.Team, encryptorUID string) bool {
	for _, p := range team.Members() {
		if p.UID == encryptorUID {
			continue
		}
		if !isAI(p.UID) {
			return false
		}
	}
	return true
}

// ---------------------------------------------------------------------------
// AI player helpers
// ---------------------------------------------------------------------------

func isAI(uid string) bool {
	return len(uid) > 3 && uid[:3] == "ai-"
}

func handleAIEncrypt(ctx context.Context, b *Bridge, r *core.Round) [3]string {
	digits := r.GetSecretDigits()
	words := r.GetCurrentTeam().GetWords()
	log.Printf("[AI-ENCRYPT] Round %d | AI %s encrypting | secret digits=%v | words=%v",
		r.GetNumberOfRounds(), r.EncryptPlayer().NickName, digits, words)

	if b.AIPlayer == nil {
		log.Printf("[AI-ENCRYPT] No LLM provider, using stub clues")
		time.Sleep(2 * time.Second)
		return [3]string{"提示1", "提示2", "提示3"}
	}
	history := formatHistoryForAI(b, r)
	clues := b.AIPlayer.GenerateClues(ctx, digits, words, history)
	log.Printf("[AI-ENCRYPT] Round %d | AI %s produced clues: %v",
		r.GetNumberOfRounds(), r.EncryptPlayer().NickName, clues)
	return clues
}

func handleAIIntercept(ctx context.Context, b *Bridge, r *core.Round) [3]int {
	clues := r.GetEncryptedMessage()
	log.Printf("[AI-INTERCEPT] Round %d | Opponent AI team intercepting | clues=%v",
		r.GetNumberOfRounds(), clues)

	if b.AIPlayer == nil {
		log.Printf("[AI-INTERCEPT] No LLM provider, using stub guess [1,2,3]")
		time.Sleep(2 * time.Second)
		return [3]int{1, 2, 3}
	}
	var emptyWords [4]string
	history := formatHistoryForAI(b, r)
	guess := b.AIPlayer.GuessSequence(ctx, clues, emptyWords, true, history)
	log.Printf("[AI-INTERCEPT] Round %d | AI intercept guess: %v", r.GetNumberOfRounds(), guess)
	return guess
}

func handleAIDecrypt(ctx context.Context, b *Bridge, r *core.Round) [3]int {
	clues := r.GetEncryptedMessage()
	words := r.GetCurrentTeam().GetWords()
	log.Printf("[AI-DECRYPT] Round %d | AI team decrypting | clues=%v | words=%v",
		r.GetNumberOfRounds(), clues, words)

	if b.AIPlayer == nil {
		log.Printf("[AI-DECRYPT] No LLM provider, using secret digits as stub")
		time.Sleep(2 * time.Second)
		return r.GetSecretDigits()
	}
	history := formatHistoryForAI(b, r)
	guess := b.AIPlayer.GuessSequence(ctx, clues, words, false, history)
	log.Printf("[AI-DECRYPT] Round %d | AI decrypt guess: %v (actual secret: %v)",
		r.GetNumberOfRounds(), guess, r.GetSecretDigits())
	return guess
}

// formatHistoryForAI builds a human-readable history string from previous rounds.
func formatHistoryForAI(b *Bridge, r *core.Round) string {
	rows := b.buildHistory(r)
	if len(rows) == 0 {
		return "（暂无历史记录）"
	}

	result := ""
	for _, row := range rows {
		result += fmt.Sprintf("第%d轮（队伍%s）：线索=%v，密码=%v，拦截=%v，解密=%v\n",
			row.Round, row.Team, row.Clues, row.Secret, row.Intercept, row.Decrypt)
	}
	return result
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

func boolPtr(v bool) *bool {
	return &v
}
