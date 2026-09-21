package game

import (
	"context"
	"fmt"
	"log"
	"os"
	"sync"
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
	mu          sync.Mutex
	startOnce   sync.Once
	views       map[string]ws.GameSyncData
	phase       string
	round       int
	deadline    time.Time
	accepted    bool
	roundNotice string
	Timing      Timings
}

// NewBridge creates a Bridge from room data, initialises the core Session,
// and registers the bridge in the global registry.
func NewBridge(r *room.Room, hub *ws.Hub) (*Bridge, error) {
	roster, err := r.BeginGame()
	if err != nil {
		return nil, err
	}
	teamAPlayers := make([]*core.Player, len(roster.TeamA))
	for i, p := range roster.TeamA {
		teamAPlayers[i] = &core.Player{UID: p.ID, NickName: p.Nickname}
	}

	teamBPlayers := make([]*core.Player, len(roster.TeamB))
	for i, p := range roster.TeamB {
		teamBPlayers[i] = &core.Player{UID: p.ID, NickName: p.Nickname}
	}

	session, err := core.NewWithTeams(r.Code, teamAPlayers, teamBPlayers)
	if err != nil {
		r.AbortStart()
		return nil, err
	}

	b := &Bridge{
		Room:        r,
		Timing:      DefaultTimings,
		views:       make(map[string]ws.GameSyncData),
		Session:     session,
		Hub:         hub,
		CluesCh:     make(chan [3]string, 1),
		InterceptCh: make(chan [3]int, 1),
		DecryptCh:   make(chan [3]int, 1),
	}

	// Wire up AI player if any team has AI members.
	hasAI := false
	for _, p := range roster.TeamA {
		if p.IsAI {
			hasAI = true
			break
		}
	}
	if !hasAI {
		for _, p := range roster.TeamB {
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
	b.startOnce.Do(func() {
		ctx, cancel := context.WithCancel(context.Background())
		b.mu.Lock()
		b.cancel = cancel
		b.mu.Unlock()
		go b.Session.AutoForward(ctx)
	})
}

func (b *Bridge) Stop() {
	b.mu.Lock()
	defer b.mu.Unlock()
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
		case <-time.After(b.Timing.BetweenRounds):
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
	defer b.closeInput()

	// Check if the encryptor is an AI player.
	if isAI(p.UID) {
		clues := handleAIEncrypt(ctx, b, r)
		return clues, ctx.Err() != nil
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
	case <-time.After(b.remaining()):
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
	defer b.closeInput()

	if b.isTeamAllAI(opponent) {
		guess := handleAIGuess(ctx, b, r, true)
		return guess, ctx.Err() != nil
	}

	select {
	case guess := <-b.InterceptCh:
		return guess, false
	case <-time.After(b.remaining()):
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
	case <-time.After(b.Timing.AfterIntercept):
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
	defer b.closeInput()

	if decryptorsAllAI {
		guess := handleAIGuess(ctx, b, r, false)
		return guess, ctx.Err() != nil
	}

	select {
	case guess := <-b.DecryptCh:
		return guess, false
	case <-time.After(b.remaining()):
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
	if b, ok := GetBridge(r.GetGameSession().SessionID()); ok {
		b.finishRound(r)
	}
	return ctx.Err() != nil
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
	for _, p := range teams[1].Members() {
		if p.UID == playerID {
			return "B"
		}
	}
	return ""
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
	if b.playerTeamLabel(playerID) != "" {
		return "opponent"
	}
	return "observer"
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
		if c.Identity().PlayerID == "" {
			continue
		}
		msg := buildMsg(c.Identity().PlayerID)
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

		var words []string
		if teamLabel == "A" {
			w := teams[0].GetWords()
			words = w[:]
		} else if teamLabel == "B" {
			w := teams[1].GetWords()
			words = w[:]
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
	b.setPhase(phase, round)
	b.broadcastToEachPlayer(func(playerID string) *ws.ServerMessage {
		v := b.Sync(playerID)
		if v == nil {
			return nil
		}
		return &ws.ServerMessage{Type: ws.MsgPhaseChange, Data: ws.PhaseChangeData{
			Phase: phase, Round: v.Round, YourRole: v.YourRole, Encryptor: v.Encryptor, SecretDigits: v.SecretDigits,
			SecretWords: v.SecretWords, Clues: v.Clues, History: v.History, Waiting: v.Waiting, Deadline: v.Deadline, Notice: v.Notice}}
	})
}

// broadcastRoundResult sends round_result to the room.
func (b *Bridge) broadcastRoundResult(round *core.Round, interceptSuccess *bool, decryptSuccess *bool) {
	scoreA, scoreB := b.buildScores()
	b.mu.Lock()
	b.phase = "round_result"
	b.accepted = true
	for id, v := range b.views {
		result := ws.RoundResultData{Round: int(round.GetNumberOfRounds()), ScoreA: scoreA, ScoreB: scoreB}
		if v.RoundResult != nil {
			result.InterceptSuccess = v.RoundResult.InterceptSuccess
			result.DecryptSuccess = v.RoundResult.DecryptSuccess
		}
		if interceptSuccess != nil {
			result.InterceptSuccess = interceptSuccess
		}
		if decryptSuccess != nil {
			result.DecryptSuccess = decryptSuccess
		}
		v.RoundResult = &result
		v.Phase = "round_result"
		v.ScoreA = scoreA
		v.ScoreB = scoreB
		v.Deadline = 0
		b.views[id] = v
	}
	b.mu.Unlock()

	b.Hub.BroadcastToRoom(b.Room.Code, ws.ServerMessage{
		Type: ws.MsgRoundResult,
		Data: ws.RoundResultData{
			Notice:           b.roundNotice,
			Round:            int(round.GetNumberOfRounds()),
			InterceptSuccess: interceptSuccess,
			DecryptSuccess:   decryptSuccess,
			ScoreA:           scoreA,
			ScoreB:           scoreB,
		},
	})
}

// broadcastAIProgress mirrors a human player's player_progress stream for AI
// players, so observer pages light up the selector oscilloscopes with AI's
// chosen digits just like they do for humans.
func (b *Bridge) broadcastAIProgress(action, player, state string, step, focus int, guesses []int) {
	padded := make([]int, 3)
	copy(padded, guesses)
	b.Hub.BroadcastToRoom(b.Room.Code, ws.ServerMessage{
		Type: ws.MsgPlayerProgress,
		Data: ws.PlayerProgressData{
			Action:  action,
			Player:  player,
			State:   state,
			Step:    step,
			Focus:   focus,
			Guesses: padded,
			Total:   3,
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

	r := b.Session.GetCurrentRound()
	result := &ws.GameOverData{Notice: b.roundNotice, Winner: winnerLabel, ScoreA: scoreA, ScoreB: scoreB, Round: int(r.GetNumberOfRounds()), History: append(b.buildHistory(r), b.historyRow(r))}
	b.mu.Lock()
	b.phase = "game_over"
	b.accepted = true
	for id, v := range b.views {
		v.Phase = "game_over"
		v.GameOver = result
		v.History = result.History
		v.ScoreA = scoreA
		v.ScoreB = scoreB
		v.Deadline = 0
		b.views[id] = v
	}
	b.mu.Unlock()
	b.Hub.BroadcastToRoom(b.Room.Code, ws.ServerMessage{Type: ws.MsgGameOver, Data: result})
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

// formatHistoryForAI builds a human-readable history string from previous rounds.
func formatHistoryForAI(b *Bridge, r *core.Round) string {
	rows := b.buildHistory(r)
	if len(rows) == 0 {
		return "(no history yet)"
	}

	result := ""
	for _, row := range rows {
		result += fmt.Sprintf("Round %d (Team %s): clues=%v, secret=%v, intercept=%v, decrypt=%v\n",
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
