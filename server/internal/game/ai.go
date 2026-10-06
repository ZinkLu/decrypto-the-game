package game

import (
	"context"
	"fmt"
	"log"
	"math/rand/v2"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/ZinkLu/decrypto-the-game/server/internal/core"
	"github.com/ZinkLu/decrypto-the-game/server/internal/ws"
)

// defaultAIAttempts is one try and one retry.
const defaultAIAttempts = 2

// aiAttempts is how many tries one step gets, the first one included, so a
// slow or unstable model can be given more room. DECRYPTO_AI_ATTEMPTS says how
// many; anything below one means the default.
func aiAttempts() int {
	n, err := strconv.Atoi(strings.TrimSpace(os.Getenv("DECRYPTO_AI_ATTEMPTS")))
	if err != nil || n < 1 {
		return defaultAIAttempts
	}
	return n
}

// aiStatus tells every seat how an AI action is going. Both teams' AI players
// may be guessing at once, so each action keeps its own status.
func (b *Bridge) aiStatus(action, player, state string, step, completed int, notice string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.aiStatusLocked(action, player, state, step, completed, notice)
}

func (b *Bridge) aiStatusLocked(action, player, state string, step, completed int, notice string) {
	d := &ws.AIStatusData{Action: action, Player: player, State: state, Step: step, Completed: completed, Total: 3, Notice: notice}
	if state == "fallback" {
		b.roundNotice = notice
	}
	for id, v := range b.views {
		// The views share these maps: replace, never change.
		statuses := make(map[string]*ws.AIStatusData, len(v.AIStatus)+1)
		for name, status := range v.AIStatus {
			statuses[name] = status
		}
		statuses[action] = d
		v.AIStatus = statuses
		v.Notice = notice
		if b.roundNotice != "" {
			v.Notice = b.roundNotice
		}
		b.views[id] = v
	}
	typ := ws.MsgAIThinking
	if state == "completed" || state == "fallback" {
		typ = ws.MsgAIActed
	}
	b.Hub.BroadcastToRoom(b.Room.Code, ws.ServerMessage{Type: typ, Data: d})
}

// One retry per action by default, bounded both by request and whole-action
// deadlines; DECRYPTO_AI_ATTEMPTS says how many tries an action gets.
func aiStep[T any](ctx context.Context, b *Bridge, action, player string, step int, call func(context.Context) (T, error), fallback T) T {
	return aiStepWithStatus(ctx, b, action, step, call, fallback, func(state string, completed int, notice string) {
		b.aiStatus(action, player, state, step, completed, notice)
	})
}

func aiStepWithStatus[T any](ctx context.Context, b *Bridge, action string, step int, call func(context.Context) (T, error), fallback T, report func(string, int, string)) T {
	attempts := aiAttempts()
	for attempt := 0; attempt < attempts && ctx.Err() == nil; attempt++ {
		state := "thinking"
		notice := ""
		if attempt > 0 {
			state = "retrying"
			notice = "AI 回答无效或超时，正在重试。"
		}
		report(state, step-1, notice)
		requestCtx, cancel := context.WithTimeout(ctx, b.Timing.Request)
		value, err := call(requestCtx)
		if err == nil {
			err = requestCtx.Err()
		}
		cancel()
		if err == nil {
			report("completed", step, "")
			return value
		}
		log.Printf("[AI] %s step=%d attempt=%d failed: %v", action, step, attempt+1, err)
	}
	report("fallback", step, "AI 未能完成回答，已使用备用线索或合法猜测继续。")
	return fallback
}

// handleAIEncrypt writes this round's three clues in one model request, then
// reads them out one at a time, at the pace a player would give them.
func handleAIEncrypt(parent context.Context, b *Bridge, r *core.Round) [3]string {
	ctx, cancel := context.WithDeadline(parent, b.actionDeadline("encrypt"))
	defer cancel()
	b.mu.Lock()
	actionState := b.actions["encrypt"]
	b.mu.Unlock()
	digits := r.GetSecretDigits()
	words := r.GetCurrentTeam().GetWords()
	history := formatHistoryForAI(b, r, b.teamLabel(r.GetCurrentTeam()))
	round := int(r.GetNumberOfRounds())
	playerID, player := r.EncryptPlayer().UID, r.EncryptPlayer().NickName
	report := func(state string, completed int, notice string) {
		if parent.Err() == nil {
			b.aiEncryptStatus(round, playerID, player, actionState, state, completed+1, completed, notice)
		}
	}
	result := aiStepWithStatus(ctx, b, "encrypt", 1, func(ctx context.Context) ([3]string, error) {
		if b.AIPlayer == nil {
			return [3]string{}, fmt.Errorf("AI provider unavailable")
		}
		return b.AIPlayer.GenerateClues(ctx, digits, words, history)
	}, [3]string{"线索暂缺", "线索暂缺", "线索暂缺"}, report)
	log.Printf("[AI-ENCRYPT] Round %d → %q", round, result)
	for completed := 2; completed <= 3; completed++ {
		if parent.Err() != nil {
			break
		}
		b.aiEncryptStatus(round, playerID, player, actionState, "thinking", completed, completed-1, "")
		b.aiPace(ctx)
		b.aiEncryptStatus(round, playerID, player, actionState, "completed", completed, completed, "")
	}
	return result
}

func (b *Bridge) aiEncryptStatus(round int, playerID, player string, actionState *action, state string, step, completed int, notice string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.phase != "encrypting" || b.round != round || actionState == nil || b.actions["encrypt"] != actionState || actionState.accepted ||
		!isAI(playerID) || !b.canSubmitLocked(playerID, "encrypt") {
		return
	}
	b.aiStatusLocked("encrypt", player, state, step, completed, notice)
	visibleState, focus := state, step
	if state == "completed" || state == "fallback" {
		visibleState, focus = "thinking", 0
		if completed == 3 {
			visibleState = "ready"
		}
	}
	filled := []bool{completed >= 1, completed >= 2, completed >= 3}
	b.relayProgressLocked(ws.PlayerProgressData{Round: round, Action: "encrypt", Player: player, PlayerID: playerID,
		IsAI: true, CanSubmit: true, State: visibleState, Step: completed, Focus: focus, Filled: filled, Total: 3})
}

// aiGuessJob is everything an AI guess reads, gathered on the game goroutine,
// so that the guess can run beside the other team's without touching the core
// session.
type aiGuessJob struct {
	action      string // "decrypt" or "intercept"
	intercept   bool
	player      string
	playerID    string
	suggestion  bool
	canSubmit   bool
	actionState *action // identity of the phase action; prevents late work entering another phase
	round       uint8
	clues       [3]string
	words       [4]string // the decoding team's own words; none for an interception
	history     string
	deadline    time.Time
}

type aiAnswer struct {
	job   aiGuessJob
	guess [3]int
}

func (b *Bridge) newAIGuess(r *core.Round, intercept bool) (aiGuessJob, bool) {
	action, team := "decrypt", r.GetCurrentTeam()
	if intercept {
		action, team = "intercept", r.GetOpponent()
	}
	job := aiGuessJob{action: action, intercept: intercept, player: "AI", round: r.GetNumberOfRounds(),
		clues: r.GetEncryptedMessage(), history: formatHistoryForAI(b, r, b.teamLabel(team))}
	if !intercept {
		job.words = team.GetWords()
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	a := b.actions[job.action]
	if a == nil || a.accepted || a.aiPlayerID == "" {
		return aiGuessJob{}, false
	}
	job.deadline, job.actionState = a.deadline, a
	for _, p := range team.Members() {
		if p.UID == a.aiPlayerID {
			job.player, job.playerID = p.NickName, p.UID
			job.canSubmit = b.canSubmitLocked(p.UID, job.action)
			job.suggestion = !job.canSubmit
			return job, true
		}
	}
	return aiGuessJob{}, false
}

func (b *Bridge) startAIGuess(parent context.Context, r *core.Round, intercept bool, answers chan<- aiAnswer) {
	if job, ok := b.newAIGuess(r, intercept); ok {
		b.runAIGuess(parent, job, answers)
	}
}

func (b *Bridge) runAIGuess(parent context.Context, job aiGuessJob, answers chan<- aiAnswer) {
	ctx, cancel := context.WithCancel(parent)
	b.mu.Lock()
	if !b.aiGuessActiveLocked(job) {
		b.mu.Unlock()
		cancel()
		return
	}
	job.actionState.cancel = cancel
	b.mu.Unlock()
	go b.aiGuess(ctx, job, answers)
}

func (b *Bridge) aiGuessActiveLocked(job aiGuessJob) bool {
	a := b.actions[job.action]
	v, exists := b.views[job.playerID]
	return b.phase == "guess" && b.round == int(job.round) && a != nil && a == job.actionState && !a.accepted && exists &&
		isAI(job.playerID) && a.aiPlayerID == job.playerID && seatAction(v.YourRole, b.phase, b.round) == job.action &&
		job.canSubmit == b.canSubmitLocked(job.playerID, job.action) && job.suggestion != job.canSubmit
}

// Submission authority is checked again when a completed job reaches the game
// goroutine. Advisory workers cannot gain authority by forging their flags.
func (b *Bridge) acceptAIGuess(answer aiAnswer) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	job := answer.job
	if !b.aiGuessActiveLocked(job) || !job.canSubmit || job.suggestion || !job.actionState.ai ||
		!validGuess(answer.guess) {
		return false
	}
	b.relayProgressLocked(ws.PlayerProgressData{Round: int(job.round), Action: job.action, Player: job.player, PlayerID: job.playerID,
		IsAI: true, CanSubmit: true, State: "submitted", Step: 3, Guesses: answer.guess[:], Total: 3})
	job.actionState.accepted = true
	if job.actionState.cancel != nil {
		job.actionState.cancel()
	}
	b.refreshLocked()
	return true
}

// AI choices are individual progress, never the timeout draft shared by humans.
func (b *Bridge) broadcastAIProgress(job aiGuessJob, state string, step, focus int, guesses []int) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	if state == "submitted" || !b.aiGuessActiveLocked(job) {
		return false
	}
	padded := make([]int, 3)
	copy(padded, guesses)
	b.relayProgressLocked(ws.PlayerProgressData{Round: int(job.round), Action: job.action, Player: job.player, PlayerID: job.playerID,
		IsAI: true, CanSubmit: job.canSubmit, Suggestion: job.suggestion, State: state, Step: step, Focus: focus, Guesses: padded, Total: 3})
	return true
}

func (b *Bridge) aiGuessStatus(job aiGuessJob, state string, step, completed int, notice string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.aiGuessActiveLocked(job) && job.canSubmit {
		b.aiStatusLocked(job.action, job.player, state, step, completed, notice)
	}
}

// aiGuess answers for an AI team with one model request, and always answers:
// a request the model cannot settle in time takes a legal fallback. The
// answer is then read out one digit at a time, at a human pace.
func (b *Bridge) aiGuess(parent context.Context, job aiGuessJob, answers chan<- aiAnswer) {
	if job.suggestion {
		b.aiSuggest(parent, job)
		return
	}
	ctx, cancel := context.WithDeadline(parent, job.deadline)
	defer cancel()
	result := aiStepWithStatus(ctx, b, job.action, 1, func(ctx context.Context) ([3]int, error) {
		if b.AIPlayer == nil {
			return [3]int{}, fmt.Errorf("AI provider unavailable")
		}
		return b.AIPlayer.GuessCode(ctx, job.clues, job.words, job.intercept, job.history)
	}, [3]int{1, 2, 3}, func(state string, completed int, notice string) {
		b.aiGuessStatus(job, state, 1, completed, notice)
		if state == "thinking" || state == "retrying" {
			b.broadcastAIProgress(job, state, 0, 1, nil)
		}
	})
	result = fillPlaceholders(result, job.clues)
	log.Printf("[AI-%s] Round %d → %v", job.action, job.round, result)
	for i := range result {
		if parent.Err() != nil {
			return
		}
		if i > 0 {
			if !b.broadcastAIProgress(job, "thinking", i, i+1, result[:i]) {
				return
			}
			b.aiPace(ctx)
			b.aiGuessStatus(job, "completed", i+1, i+1, "")
		}
		state := "thinking"
		if i == len(result)-1 {
			state = "ready"
		}
		if !b.broadcastAIProgress(job, state, i+1, 0, result[:i+1]) {
			return
		}
	}
	select {
	case answers <- aiAnswer{job: job, guess: result}:
	case <-parent.Done():
	}
}

// A clue line a timeout left blank carries nothing to reason about; its digit
// is filled with the first digit the rest of the answer leaves free, keeping
// the guess legal whatever the model made of the blank.
func fillPlaceholders(result [3]int, clues [3]string) [3]int {
	used := map[int]bool{}
	for i, clue := range clues {
		if !placeholderClue(clue) {
			used[result[i]] = true
		}
	}
	for i, clue := range clues {
		if !placeholderClue(clue) {
			continue
		}
		for n := 1; n <= 4; n++ {
			if !used[n] {
				result[i], used[n] = n, true
				break
			}
		}
	}
	return result
}

// aiPace holds the next answer back for a random beat, as a player thinking
// aloud between two answers would. A game that moves on cuts the wait short;
// the answer itself is never held back.
func (b *Bridge) aiPace(ctx context.Context) {
	beat := b.Timing.AIPace
	if beat <= 0 {
		return
	}
	d := beat/2 + time.Duration(rand.Int64N(int64(beat)))
	select {
	case <-time.After(d):
	case <-ctx.Done():
	}
}

// The selected AI offers advice when a human can submit. Failed model calls
// leave an unavailable suggestion; a human answer cancels the request.
func (b *Bridge) aiSuggest(parent context.Context, job aiGuessJob) {
	ctx, cancel := context.WithDeadline(parent, job.deadline)
	defer cancel()
	var result [3]int
	err := fmt.Errorf("AI suggestion unavailable")
	if b.AIPlayer != nil {
		attempts := aiAttempts()
		for attempt := 0; attempt < attempts && ctx.Err() == nil; attempt++ {
			state := "thinking"
			if attempt > 0 {
				state = "retrying"
			}
			if !b.broadcastAIProgress(job, state, 0, 1, nil) {
				return
			}
			requestCtx, stop := context.WithTimeout(ctx, b.Timing.Request)
			result, err = b.AIPlayer.GuessCode(requestCtx, job.clues, job.words, job.intercept, job.history)
			if err == nil {
				err = requestCtx.Err()
			}
			stop()
			if err == nil {
				break
			}
		}
	}
	if parent.Err() != nil {
		return
	}
	if err != nil || ctx.Err() != nil {
		b.broadcastAIProgress(job, "unavailable", 0, 0, nil)
		return
	}
	for i := range result {
		if i > 0 {
			if !b.broadcastAIProgress(job, "thinking", i, i+1, result[:i]) {
				return
			}
			b.aiPace(ctx)
		}
		state := "thinking"
		if i == len(result)-1 {
			state = "ready"
		}
		if parent.Err() != nil || !b.broadcastAIProgress(job, state, i+1, 0, result[:i+1]) {
			return
		}
	}
}

func placeholderClue(clue string) bool {
	switch strings.TrimSpace(clue) {
	case "", "—", "...", "…":
		return true
	}
	return false
}
