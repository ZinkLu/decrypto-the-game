package game

import (
	"context"
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	"github.com/ZinkLu/decrypto-the-game/server/internal/ai"
	"github.com/ZinkLu/decrypto-the-game/server/internal/ai/providers"
	"github.com/ZinkLu/decrypto-the-game/server/internal/core"
	"github.com/ZinkLu/decrypto-the-game/server/internal/room"
	"github.com/ZinkLu/decrypto-the-game/server/internal/ws"
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
	// The actions of the current phase by name: "encrypt", "decrypt", "intercept".
	actions     map[string]*action
	roundNotice string
	Timing      Timings
	// This round's timeouts, and every timed-out action by round.
	roundTimeouts []ws.TimeoutData
	timeouts      map[int][]string
	// OnSave receives the game each time it moves on, to keep it across a
	// restart. Assign it before Start.
	OnSave func(Snapshot)
	// Closed once the running game has shown its players where it stands.
	shown     chan struct{}
	shownOnce sync.Once
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

	b := newBridge(r, hub, session, roster)
	RegisterBridge(session.SessionID(), b)
	return b, nil
}

func newBridge(r *room.Room, hub *ws.Hub, session *core.Session, roster room.Snapshot) *Bridge {
	b := &Bridge{
		Room:        r,
		Timing:      DefaultTimings,
		views:       make(map[string]ws.GameSyncData),
		timeouts:    make(map[int][]string),
		Session:     session,
		Hub:         hub,
		CluesCh:     make(chan [3]string, 1),
		InterceptCh: make(chan [3]int, 1),
		DecryptCh:   make(chan [3]int, 1),
		shown:       make(chan struct{}),
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
	return b
}

// Start forwards the game in a background goroutine. A restored game goes on
// from the phase it was saved in; a finished one has nothing left to run.
// Start returns once the game shows where it stands, so that a phase taking
// input is never seen without its deadline.
func (b *Bridge) Start() {
	b.startOnce.Do(func() {
		ctx, cancel := context.WithCancel(context.Background())
		b.mu.Lock()
		defer b.mu.Unlock()
		if b.phase == "game_over" {
			cancel()
			b.show()
			return
		}
		if b.OnSave != nil {
			b.OnSave(b.snapshotLocked())
		}
		b.cancel = cancel
		go func() {
			defer b.show()
			b.Session.Resume(ctx)
		}()
	})
	<-b.shown
}

func (b *Bridge) show() { b.shownOnce.Do(func() { close(b.shown) }) }

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
	core.RegisterGuessHandler(guessHandler)
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
	var clues [3]string
	select {
	case clues = <-b.CluesCh:
	case <-time.After(b.remaining("encrypt")):
		log.Printf("bridge: encryptHandler: timeout waiting for clues in session %s", r.GetGameSession().SessionID())
		b.closeInput()
		var outcome string
		clues, outcome = b.draftCluesOnTimeout()
		b.timedOut(r, "encrypt", b.teamLabel(t), p.NickName, outcome)
	case <-ctx.Done():
		return [3]string{}, true
	}
	b.Hub.BroadcastToRoom(b.Room.Code, ws.ServerMessage{
		Type: ws.MsgCluesSubmitted,
		Data: ws.PhaseChangeData{Phase: "encrypting", Round: int(r.GetNumberOfRounds()), Clues: clues[:], History: b.buildHistory(r)},
	})
	return clues, false
}

// guessHandler runs the guessing phase: the encrypting team decodes while, from
// round 3, the other team intercepts. Each team answers once, and the phase ends
// when both have answered or run out of time. Neither learns the other's guess,
// or whether it was right, before the code is revealed.
func guessHandler(ctx context.Context, r *core.Round, ts core.TeamState) bool {
	b, ok := GetBridge(r.GetGameSession().SessionID())
	if !ok {
		log.Printf("bridge: guessHandler: bridge not found for session %s", r.GetGameSession().SessionID())
		return true
	}

	decoders, interceptors := r.GetCurrentTeam(), r.GetOpponent()
	log.Printf("[PHASE] Round %d → GUESS | decoding team=%s (AI=%v) | intercepting team=%s (AI=%v, intercepts=%v)",
		r.GetNumberOfRounds(), b.teamLabel(decoders), b.areDecryptorsAllAI(decoders, r.EncryptPlayer().UID),
		b.teamLabel(interceptors), b.isTeamAllAI(interceptors), r.HasInterception())
	b.broadcastPhaseChange("guess", r)
	defer b.closeInput()

	// Every eligible AI starts independently. Only an all-AI team's designated
	// seat may submit; the others offer individual suggestions.
	guessCtx, cancelGuesses := context.WithCancel(ctx)
	defer cancelGuesses()
	answers := make(chan aiAnswer, 2)
	if r.NeedsDecrypt() {
		b.startAIGuesses(guessCtx, r, false, answers)
	}
	if r.NeedsIntercept() {
		b.startAIGuesses(guessCtx, r, true, answers)
	}

	for r.NeedsDecrypt() || r.NeedsIntercept() {
		var timer *time.Timer
		var expiry <-chan time.Time
		if wait, ok := b.nextExpiry(); ok {
			timer = time.NewTimer(wait)
			expiry = timer.C
		}
		select {
		case guess := <-b.DecryptCh:
			b.recordGuess(r, "decrypt", guess)
		case guess := <-b.InterceptCh:
			b.recordGuess(r, "intercept", guess)
		case answer := <-answers:
			if b.acceptAIGuess(answer) {
				b.recordGuess(r, answer.job.action, answer.guess)
			}
		case <-expiry:
			for _, name := range b.expired() {
				log.Printf("bridge: guessHandler: timeout waiting for %s in session %s", name, r.GetGameSession().SessionID())
				team := decoders
				if name == "intercept" {
					team = interceptors
				}
				guess, outcome := b.draftGuessOnTimeout(name)
				b.timedOut(r, name, b.teamLabel(team), "", outcome)
				b.recordGuess(r, name, guess)
			}
		case <-ctx.Done():
			if timer != nil {
				timer.Stop()
			}
			return true
		}
		if timer != nil {
			timer.Stop()
		}
	}
	return false
}

func doneHandler(ctx context.Context, r *core.Round, ts core.TeamState) bool {
	if b, ok := GetBridge(r.GetGameSession().SessionID()); ok {
		interception := "none"
		if r.HasInterception() {
			interception = fmt.Sprintf("team %s right=%v", b.teamLabel(r.GetOpponent()), r.IsInterceptSuccess())
		}
		log.Printf("[RESULT] Round %d | interception: %s | decoding: team %s right=%v",
			r.GetNumberOfRounds(), interception, b.teamLabel(r.GetCurrentTeam()), r.IsDecryptedCorrect())
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
			Phase: phase, Round: v.Round, YourRole: v.YourRole, Encryptor: v.Encryptor, EncryptorID: v.EncryptorID, SecretDigits: v.SecretDigits,
			SecretWords: v.SecretWords, Clues: v.Clues, History: v.History, Waiting: v.Waiting, Deadline: v.Deadline, Notice: v.Notice,
			Submitted: v.Submitted, Actions: v.Actions, TeammateProgress: v.TeammateProgress}}
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
	teams := b.Session.GetTeams()
	wordsA, wordsB := teams[0].GetWords(), teams[1].GetWords()
	result := &ws.GameOverData{Winner: winnerLabel, ScoreA: scoreA, ScoreB: scoreB, Round: int(r.GetNumberOfRounds()), History: append(b.buildHistory(r), b.historyRow(r)),
		Reason: gameOverReason(teams, winner), WordsA: wordsA[:], WordsB: wordsB[:]}
	b.mu.Lock()
	b.phase = "game_over"
	b.actions = nil
	result.Notice = b.roundNotice
	for id, v := range b.views {
		v.Phase = "game_over"
		v.GameOver = result
		v.History = result.History
		v.ScoreA = scoreA
		v.ScoreB = scoreB
		v.Actions = nil
		v.Deadline = 0
		v.Submitted = false
		v.Waiting = true
		b.views[id] = v
	}
	b.saveLocked()
	b.mu.Unlock()
	b.Hub.BroadcastToRoom(b.Room.Code, ws.ServerMessage{Type: ws.MsgGameOver, Data: result})
}

// gameOverReason names what decided the game: two interceptions, the opponent's
// two decoding errors, the score (both qualified, or all rounds played), or a draw.
func gameOverReason(teams [2]*core.Team, winner *core.Team) string {
	if winner == nil {
		return "draw"
	}
	qualified := func(t, o *core.Team) bool { return t.InterceptedCounts >= 2 || o.DecryptWrongCounts >= 2 }
	loser := teams[0]
	if winner == teams[0] {
		loser = teams[1]
	}
	if !qualified(winner, loser) || qualified(loser, winner) {
		return "score"
	}
	if winner.InterceptedCounts >= 2 {
		return "interceptions"
	}
	return "errors"
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
// The encryptor does not decode, so only the teammates count.
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
