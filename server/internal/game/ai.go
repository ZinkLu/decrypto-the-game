package game

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/ZinkLu/decrypto-the-game/server/internal/core"
	"github.com/ZinkLu/decrypto-the-game/server/internal/ws"
)

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

// One retry per step, bounded both by request and whole-action deadlines.
func aiStep[T any](ctx context.Context, b *Bridge, action, player string, step int, call func(context.Context) (T, error), fallback T) T {
	return aiStepWithStatus(ctx, b, action, step, call, fallback, func(state string, completed int, notice string) {
		b.aiStatus(action, player, state, step, completed, notice)
	})
}

func aiStepWithStatus[T any](ctx context.Context, b *Bridge, action string, step int, call func(context.Context) (T, error), fallback T, report func(string, int, string)) T {
	for attempt := 0; attempt < 2 && ctx.Err() == nil; attempt++ {
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

func handleAIEncrypt(parent context.Context, b *Bridge, r *core.Round) [3]string {
	ctx, cancel := context.WithDeadline(parent, b.actionDeadline("encrypt"))
	defer cancel()
	b.mu.Lock()
	actionState := b.actions["encrypt"]
	b.mu.Unlock()
	digits := r.GetSecretDigits()
	words := r.GetCurrentTeam().GetWords()
	history := formatHistoryForAI(b, r)
	var result [3]string
	for i := range result {
		if parent.Err() != nil {
			break
		}
		result[i] = aiStepWithStatus(ctx, b, "encrypt", i+1, func(ctx context.Context) (string, error) {
			if b.AIPlayer == nil {
				return "", fmt.Errorf("AI provider unavailable")
			}
			return b.AIPlayer.GenerateSingleClue(ctx, digits[i], words, history, result[:i])
		}, "线索暂缺", func(state string, completed int, notice string) {
			if parent.Err() == nil {
				b.aiEncryptStatus(int(r.GetNumberOfRounds()), r.EncryptPlayer().UID, r.EncryptPlayer().NickName, actionState, state, i+1, completed, notice)
			}
		})
		log.Printf("[AI-ENCRYPT] Round %d step %d/3 → %q", r.GetNumberOfRounds(), i+1, result[i])
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
		clues: r.GetEncryptedMessage(), history: formatHistoryForAI(b, r)}
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

// aiGuess answers for an AI team, one digit at a time, and always answers: a
// step the model cannot settle in time takes a legal fallback.
func (b *Bridge) aiGuess(parent context.Context, job aiGuessJob, answers chan<- aiAnswer) {
	if job.suggestion {
		b.aiSuggest(parent, job)
		return
	}
	ctx, cancel := context.WithDeadline(parent, job.deadline)
	defer cancel()
	var result [3]int
	for i := range result {
		if parent.Err() != nil {
			return
		}
		fallback := 1
		for {
			used := false
			for _, n := range result[:i] {
				if n == fallback {
					used = true
				}
			}
			if !used {
				break
			}
			fallback++
		}
		if !b.broadcastAIProgress(job, "thinking", i, i+1, result[:i]) {
			return
		}
		if placeholderClue(job.clues[i]) {
			// A line left empty by a timeout carries nothing to reason about.
			result[i] = fallback
		} else {
			result[i] = aiStepWithStatus(ctx, b, job.action, i+1, func(ctx context.Context) (int, error) {
				if b.AIPlayer == nil {
					return 0, fmt.Errorf("AI provider unavailable")
				}
				return b.AIPlayer.GuessSingleNumber(ctx, job.clues[i], job.words, job.intercept, job.history, result[:i])
			}, fallback, func(state string, completed int, notice string) {
				b.aiGuessStatus(job, state, i+1, completed, notice)
				if state == "thinking" || state == "retrying" {
					b.broadcastAIProgress(job, state, i, i+1, result[:i])
				}
			})
		}
		state := "thinking"
		if i == len(result)-1 {
			state = "ready"
		}
		if parent.Err() != nil || !b.broadcastAIProgress(job, state, i+1, 0, result[:i+1]) {
			return
		}
		log.Printf("[AI-%s] Round %d step %d/3 → %d", job.action, job.round, i+1, result[i])
	}
	select {
	case answers <- aiAnswer{job: job, guess: result}:
	case <-parent.Done():
	}
}

// The selected AI offers advice when a human can submit. Failed model calls
// leave an unavailable suggestion; a human answer cancels the request.
func (b *Bridge) aiSuggest(parent context.Context, job aiGuessJob) {
	ctx, cancel := context.WithDeadline(parent, job.deadline)
	defer cancel()
	var result [3]int
	for i := range result {
		if ctx.Err() != nil || !b.broadcastAIProgress(job, "thinking", i, i+1, result[:i]) {
			return
		}
		var n int
		err := fmt.Errorf("AI suggestion unavailable")
		if b.AIPlayer != nil && !placeholderClue(job.clues[i]) {
			for attempt := 0; attempt < 2 && ctx.Err() == nil; attempt++ {
				if attempt > 0 && !b.broadcastAIProgress(job, "retrying", i, i+1, result[:i]) {
					return
				}
				requestCtx, stop := context.WithTimeout(ctx, b.Timing.Request)
				n, err = b.AIPlayer.GuessSingleNumber(requestCtx, job.clues[i], job.words, job.intercept, job.history, result[:i])
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
			b.broadcastAIProgress(job, "unavailable", i, 0, result[:i])
			return
		}
		result[i] = n
		state := "thinking"
		if i == len(result)-1 {
			state = "ready"
		}
		if !b.broadcastAIProgress(job, state, i+1, 0, result[:i+1]) {
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
