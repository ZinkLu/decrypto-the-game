package game

import (
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/ZinkLu/decrypto-the-game/internal/core"
	"github.com/ZinkLu/decrypto-the-game/internal/ws"
)

// Timings are assigned before Start. Tests can exercise real deadlines without waiting minutes.
// Grace keeps accepting a submission sent just before the deadline while it crosses the network;
// players are always shown the deadline itself.
type Timings struct{ Encrypt, Guess, AI, Request, BetweenRounds, AfterIntercept, Grace time.Duration }

var DefaultTimings = Timings{90 * time.Second, 60 * time.Second, 120 * time.Second, 30 * time.Second, 8 * time.Second, 4 * time.Second, 1500 * time.Millisecond}

// Only the game goroutine reads core state. Socket handlers use these immutable snapshots.
func (b *Bridge) Sync(playerID string) *ws.GameSyncData {
	b.mu.Lock()
	defer b.mu.Unlock()
	v, ok := b.views[playerID]
	if !ok {
		return nil
	}
	cp := v
	return &cp
}

func (b *Bridge) aiPhase(phase string, r *core.Round) bool {
	switch phase {
	case "encrypting":
		return isAI(r.EncryptPlayer().UID)
	case "intercept":
		return b.isTeamAllAI(r.GetOpponent())
	case "decrypt":
		return b.areDecryptorsAllAI(r.GetCurrentTeam(), r.EncryptPlayer().UID)
	}
	return false
}

func (b *Bridge) setPhase(phase string, r *core.Round) {
	duration := time.Duration(0)
	switch phase {
	case "encrypting":
		duration = b.Timing.Encrypt
	case "intercept", "decrypt":
		duration = b.Timing.Guess
	}
	if b.aiPhase(phase, r) {
		duration = b.Timing.AI
	}
	deadline := time.Time{}
	if duration > 0 {
		deadline = time.Now().Add(duration)
	}
	views := map[string]ws.GameSyncData{}
	history := b.buildHistory(r)
	a, bb := b.buildScores()
	for _, p := range b.Room.Snapshot().Players {
		team := b.playerTeamLabel(p.ID)
		role := b.playerRole(p.ID, r)
		v := ws.GameSyncData{Phase: phase, Round: int(r.GetNumberOfRounds()), YourRole: role, YourTeam: team,
			Encryptor: r.EncryptPlayer().NickName, History: history, ScoreA: a, ScoreB: bb, Waiting: !canAct(role, phase)}
		if !deadline.IsZero() {
			v.Deadline = deadline.UnixMilli()
		}
		if team != "" {
			idx := 0
			if team == "B" {
				idx = 1
			}
			words := b.Session.GetTeams()[idx].GetWords()
			v.Words = words[:]
		}
		// The encryptor keeps the code for the whole round, to follow the guesses.
		if role == "encryptor" {
			digits := r.GetSecretDigits()
			words := r.GetSecretWords()
			v.SecretDigits = digits[:]
			v.SecretWords = words[:]
		}
		if phase == "intercept" || phase == "decrypt" {
			clues := r.GetEncryptedMessage()
			v.Clues = clues[:]
		}
		views[p.ID] = v
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	// A submission racing its deadline must never leak into a later round.
	select {
	case <-b.CluesCh:
	default:
	}
	select {
	case <-b.InterceptCh:
	default:
	}
	select {
	case <-b.DecryptCh:
	default:
	}
	if b.round != int(r.GetNumberOfRounds()) {
		b.roundNotice = ""
		b.timeout = nil
	}
	b.draftClues = [3]string{}
	b.draftGuess = [3]int{}
	for id, v := range views {
		v.Notice = b.roundNotice
		v.Timeout = b.timeout
		if phase == "decrypt" {
			v.RoundResult = b.views[id].RoundResult
		}
		views[id] = v
	}
	b.phase = phase
	b.round = int(r.GetNumberOfRounds())
	b.deadline = deadline
	b.accepted = false
	b.views = views
}

func canAct(role, phase string) bool {
	return phase == "encrypting" && role == "encryptor" || phase == "intercept" && role == "opponent" || phase == "decrypt" && role == "teammate"
}

func (b *Bridge) validateLocked(playerID string, round int, phase string) error {
	v, ok := b.views[playerID]
	if !ok || !canAct(v.YourRole, phase) {
		return fmt.Errorf("not allowed to act in this phase")
	}
	if b.round != round || b.phase != phase || b.accepted || !time.Now().Before(b.deadline.Add(b.Timing.Grace)) {
		return fmt.Errorf("stale or already submitted action; sync and try again")
	}
	return nil
}

func (b *Bridge) ValidateProgress(playerID string, data ws.ProgressData) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	phase := data.Action
	if phase == "encrypt" {
		phase = "encrypting"
	}
	if data.Step < 0 || data.Step > 3 || data.Focus < 0 || data.Focus > 3 {
		return fmt.Errorf("invalid progress")
	}
	switch data.State {
	case "", "idle", "editing", "submitted":
	default:
		return fmt.Errorf("invalid progress")
	}
	if len(data.Guesses) > 3 || len(data.Filled) > 3 || len(data.Clues) > 3 || len(data.Clues) > 0 && data.Action != "encrypt" {
		return fmt.Errorf("invalid progress")
	}
	for _, c := range data.Clues {
		if utf8.RuneCountInString(c) > 80 {
			return fmt.Errorf("invalid progress")
		}
	}
	for _, n := range data.Guesses {
		if n < 0 || n > 4 {
			return fmt.Errorf("invalid progress")
		}
	}
	return b.validateLocked(playerID, data.Round, phase)
}

// RecordDraft keeps the acting seat's latest draft, used if time runs out.
// Call only after ValidateProgress accepted the same data.
func (b *Bridge) RecordDraft(data ws.ProgressData) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if data.Action == "encrypt" && len(data.Clues) > 0 {
		b.draftClues = [3]string{}
		copy(b.draftClues[:], data.Clues)
	}
	if data.Action != "encrypt" && len(data.Guesses) == 3 {
		copy(b.draftGuess[:], data.Guesses)
	}
}

func validGuess(guess [3]int) bool {
	seen := map[int]bool{}
	for _, n := range guess {
		if n < 1 || n > 4 || seen[n] {
			return false
		}
		seen[n] = true
	}
	return true
}

func (b *Bridge) acceptLocked() {
	b.accepted = true
	for id, v := range b.views {
		if canAct(v.YourRole, b.phase) {
			v.Submitted = true
			v.Waiting = true
			b.views[id] = v
		}
	}
}

func (b *Bridge) SubmitClues(playerID string, data ws.SubmitCluesData) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if err := b.validateLocked(playerID, data.Round, "encrypting"); err != nil {
		return err
	}
	for i, c := range data.Clues {
		c = strings.TrimSpace(c)
		if c == "" || utf8.RuneCountInString(c) > 80 {
			return fmt.Errorf("provide three nonempty clues (80 characters max)")
		}
		data.Clues[i] = c
	}
	b.acceptLocked()
	b.CluesCh <- data.Clues
	return nil
}

func (b *Bridge) SubmitGuess(playerID, phase string, data ws.SubmitGuessData) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if err := b.validateLocked(playerID, data.Round, phase); err != nil {
		return err
	}
	if !validGuess(data.Guess) {
		return fmt.Errorf("guess must contain three different digits from 1 to 4")
	}
	b.acceptLocked()
	if phase == "intercept" {
		b.InterceptCh <- data.Guess
	} else {
		b.DecryptCh <- data.Guess
	}
	return nil
}

// Finished reports whether the game has ended.
func (b *Bridge) Finished() bool { b.mu.Lock(); defer b.mu.Unlock(); return b.phase == "game_over" }

func (b *Bridge) closeInput()              { b.mu.Lock(); defer b.mu.Unlock(); b.accepted = true }
func (b *Bridge) phaseDeadline() time.Time { b.mu.Lock(); defer b.mu.Unlock(); return b.deadline }
func (b *Bridge) remaining() time.Duration {
	return time.Until(b.phaseDeadline()) + b.Timing.Grace
}

// timedOut settles an action whose time ran out and tells every seat how.
func (b *Bridge) timedOut(r *core.Round, action, team, player, outcome string) {
	round := int(r.GetNumberOfRounds())
	d := &ws.TimeoutData{Round: round, Action: action, Team: team, Player: player, Outcome: outcome}
	b.mu.Lock()
	b.timeout = d
	b.timeouts[round] = append(b.timeouts[round], action)
	for id, v := range b.views {
		v.Timeout = d
		b.views[id] = v
	}
	b.mu.Unlock()
	b.Hub.BroadcastToRoom(b.Room.Code, ws.ServerMessage{Type: ws.MsgTimeout, Data: d})
}

// draftCluesOnTimeout sends what the encryptor wrote; empty lines become a dash.
func (b *Bridge) draftCluesOnTimeout() ([3]string, string) {
	b.mu.Lock()
	clues := b.draftClues
	b.mu.Unlock()
	outcome := "blank"
	for i, c := range clues {
		if c = strings.TrimSpace(c); c == "" {
			clues[i] = "—"
		} else {
			clues[i] = c
			outcome = "draft"
		}
	}
	return clues, outcome
}

// draftGuessOnTimeout sends the chosen digits when all three are chosen.
func (b *Bridge) draftGuessOnTimeout() ([3]int, string) {
	b.mu.Lock()
	guess := b.draftGuess
	b.mu.Unlock()
	if validGuess(guess) {
		return guess, "guess"
	}
	return [3]int{}, "none"
}

func (b *Bridge) finishRound(r *core.Round) {
	history := append(b.buildHistory(r), b.historyRow(r))
	a, bb := b.buildScores()
	b.mu.Lock()
	b.phase = "round_result"
	b.accepted = true
	for id, v := range b.views {
		v.Phase = "round_result"
		v.History = history
		v.ScoreA = a
		v.ScoreB = bb
		v.Deadline = 0
		b.views[id] = v
	}
	b.mu.Unlock()
	b.Hub.BroadcastToRoom(b.Room.Code, ws.ServerMessage{Type: ws.MsgRoundResult, Data: ws.RoundResultData{
		Notice: b.roundNotice, Round: int(r.GetNumberOfRounds()), History: history, Complete: true, ScoreA: a, ScoreB: bb}})
}

func (b *Bridge) historyRow(r *core.Round) ws.RoundHistoryRow {
	clues := r.GetEncryptedMessage()
	secret := r.GetSecretDigits()
	intercept := r.GetInterceptSecret()
	decrypt := r.GetDecryptSecret()
	return ws.RoundHistoryRow{Round: int(r.GetNumberOfRounds()), Team: b.teamLabel(r.GetCurrentTeam()), Clues: clues[:], Secret: secret[:], Intercept: intercept[:], Decrypt: decrypt[:], Timeouts: b.timeouts[int(r.GetNumberOfRounds())]}
}
