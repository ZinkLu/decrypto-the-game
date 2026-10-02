package game

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/ZinkLu/decrypto-the-game/server/internal/core"
	"github.com/ZinkLu/decrypto-the-game/server/internal/ws"
)

// Timings are assigned before Start. Tests can exercise real deadlines without waiting minutes.
// Grace keeps accepting a submission sent just before the deadline while it crosses the network;
// players are always shown the deadline itself.
type Timings struct{ Encrypt, Guess, AI, Request, BetweenRounds, Grace time.Duration }

var DefaultTimings = Timings{Encrypt: 90 * time.Second, Guess: 60 * time.Second, AI: 120 * time.Second,
	Request: 30 * time.Second, BetweenRounds: 8 * time.Second, Grace: 1500 * time.Millisecond}

// action is one team's task in the current phase: the clues while encrypting;
// the decoding and, from round 3, the interception while guessing. Each has its
// own deadline, so that a team of AI players gets the time its requests need.
type action struct {
	team        string // "A" or "B"
	deadline    time.Time
	accepted    bool
	ai          bool
	submitterID string             // one designated AI when all eligible guessers are AI
	cancel      context.CancelFunc // stop every AI worker as soon as the team answers
	// The acting seats' latest draft, sent if the time runs out.
	clues [3]string
	guess [3]int
}

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

// seatAction is the action a seat takes in a phase, or "" for a seat that only watches.
func seatAction(role, phase string, round int) string {
	switch {
	case phase == "encrypting" && role == "encryptor":
		return "encrypt"
	case phase == "guess" && role == "teammate":
		return "decrypt"
	case phase == "guess" && role == "opponent" && round > 2:
		return "intercept"
	}
	return ""
}

// phaseActions lists who acts in a phase, and until when. A guess given before
// a restart is already in.
func (b *Bridge) phaseActions(phase string, r *core.Round) map[string]*action {
	now := time.Now()
	limit := func(human time.Duration, ai bool) time.Time {
		if ai {
			return now.Add(b.Timing.AI)
		}
		return now.Add(human)
	}
	sending, receiving := b.teamLabel(r.GetCurrentTeam()), b.teamLabel(r.GetOpponent())
	actions := map[string]*action{}
	switch phase {
	case "encrypting":
		ai := isAI(r.EncryptPlayer().UID)
		actions["encrypt"] = &action{team: sending, ai: ai, deadline: limit(b.Timing.Encrypt, ai)}
	case "guess":
		ai := b.areDecryptorsAllAI(r.GetCurrentTeam(), r.EncryptPlayer().UID)
		actions["decrypt"] = &action{team: sending, ai: ai, deadline: limit(b.Timing.Guess, ai), accepted: !r.NeedsDecrypt()}
		if r.HasInterception() {
			ai := b.isTeamAllAI(r.GetOpponent())
			actions["intercept"] = &action{team: receiving, ai: ai, deadline: limit(b.Timing.Guess, ai), accepted: !r.NeedsIntercept()}
		}
	}
	for name, a := range actions {
		if !a.ai || name == "encrypt" {
			continue
		}
		team := r.GetCurrentTeam()
		if name == "intercept" {
			team = r.GetOpponent()
		}
		for _, player := range team.Members() {
			if player.UID != r.EncryptPlayer().UID && isAI(player.UID) {
				a.submitterID = player.UID
				break
			}
		}
	}
	return actions
}

func (b *Bridge) setPhase(phase string, r *core.Round) {
	actions := b.phaseActions(phase, r)
	views := map[string]ws.GameSyncData{}
	history := b.buildHistory(r)
	a, bb := b.buildScores()
	roster := b.Room.Snapshot().Players
	for _, p := range roster {
		team := b.playerTeamLabel(p.ID)
		role := b.playerRole(p.ID, r)
		v := ws.GameSyncData{Phase: phase, Round: int(r.GetNumberOfRounds()), YourRole: role, YourTeam: team,
			Encryptor: r.EncryptPlayer().NickName, EncryptorID: r.EncryptPlayer().UID, History: history, ScoreA: a, ScoreB: bb}
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
		if phase == "guess" {
			clues := r.GetEncryptedMessage()
			v.Clues = clues[:]
		}
		views[p.ID] = v
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, old := range b.actions {
		if old.cancel != nil {
			old.cancel()
		}
	}
	// A submission racing its deadline must never leak into a later phase.
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
		b.roundTimeouts = nil
	}
	// Resuming this guessing phase keeps an already accepted answer while the
	// other team finishes. Each saved view already has its own redacted digits.
	if phase == "guess" && b.phase == phase && b.round == int(r.GetNumberOfRounds()) {
		for id, v := range views {
			for playerID, progress := range b.views[id].TeammateProgress {
				if a := actions[progress.Action]; a != nil && a.accepted && progress.Round == b.round {
					if v.TeammateProgress == nil {
						v.TeammateProgress = make(map[string]*ws.PlayerProgressData)
					}
					v.TeammateProgress[playerID] = progress
				}
			}
			views[id] = v
		}
	}
	b.phase = phase
	b.round = int(r.GetNumberOfRounds())
	b.actions = actions
	public := b.publicActionsLocked()
	for id, v := range views {
		v.Notice = b.roundNotice
		v.Timeouts = b.roundTimeouts
		views[id] = b.seatViewLocked(v, public)
	}
	b.views = views
	// Seed every eligible seat before phase_change, so absent network events do
	// not make a slow AI or a quiet human disappear from another seat's view.
	for _, p := range roster {
		v := b.views[p.ID]
		name := seatAction(v.YourRole, phase, b.round)
		if name == "" || b.actions[name].accepted || v.TeammateProgress[p.ID] != nil {
			continue
		}
		state, focus := "idle", 0
		if p.IsAI && !b.actions[name].accepted {
			state, focus = "thinking", 1
		}
		progress := ws.PlayerProgressData{Round: b.round, Action: name, Player: p.Nickname, PlayerID: p.ID,
			IsAI: p.IsAI, CanSubmit: b.canSubmitLocked(p.ID, name), State: state, Focus: focus, Total: 3}
		progress.Suggestion = p.IsAI && !progress.CanSubmit
		if name == "encrypt" {
			progress.Filled = []bool{false, false, false}
		} else {
			progress.Guesses = []int{0, 0, 0}
		}
		b.updateProgressLocked(progress, false)
	}
	// "new_round" only announces the phase that follows at once.
	if phase != "new_round" {
		b.saveLocked()
	}
}

// publicActionsLocked is what every seat may know of the phase's actions. The
// views share the map, so it is replaced, never changed.
func (b *Bridge) publicActionsLocked() map[string]ws.ActionInfo {
	if len(b.actions) == 0 {
		return nil
	}
	public := make(map[string]ws.ActionInfo, len(b.actions))
	for name, a := range b.actions {
		public[name] = ws.ActionInfo{Team: a.team, Deadline: a.deadline.UnixMilli(), Submitted: a.accepted}
	}
	return public
}

// seatViewLocked fills in what depends on the seat's own action: whether it
// may still act, and the deadline it sees. A seat that only watches sees the
// latest deadline of the phase.
func (b *Bridge) seatViewLocked(v ws.GameSyncData, public map[string]ws.ActionInfo) ws.GameSyncData {
	v.Actions = public
	own := b.actions[seatAction(v.YourRole, v.Phase, v.Round)]
	v.Submitted = own != nil && own.accepted
	v.Waiting = own == nil || own.accepted
	v.Deadline = 0
	if own != nil {
		v.Deadline = own.deadline.UnixMilli()
	} else {
		for _, a := range b.actions {
			v.Deadline = max(v.Deadline, a.deadline.UnixMilli())
		}
	}
	return v
}

// refreshLocked shows every seat the actions as they stand.
func (b *Bridge) refreshLocked() {
	public := b.publicActionsLocked()
	for id, v := range b.views {
		b.views[id] = b.seatViewLocked(v, public)
	}
}

func (b *Bridge) validateLocked(playerID string, round int, name string) (*action, error) {
	v, ok := b.views[playerID]
	if !ok || name == "" || seatAction(v.YourRole, b.phase, b.round) != name {
		return nil, fmt.Errorf("not allowed to act in this phase")
	}
	a := b.actions[name]
	if a == nil || b.round != round || a.accepted || !time.Now().Before(a.deadline.Add(b.Timing.Grace)) {
		return nil, fmt.Errorf("stale or already submitted action; sync and try again")
	}
	return a, nil
}

// Humans can answer their own action; AI guessers require the designated
// authority of an all-AI team. The encryptor never qualifies as a guesser.
func (b *Bridge) canSubmitLocked(playerID, name string) bool {
	v, exists := b.views[playerID]
	a := b.actions[name]
	if !exists || a == nil || seatAction(v.YourRole, b.phase, b.round) != name {
		return false
	}
	return !isAI(playerID) || name == "encrypt" || a.ai && a.submitterID == playerID
}

func (b *Bridge) ValidateProgress(playerID string, data ws.ProgressData) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.validateProgressLocked(playerID, data)
}

func (b *Bridge) validateProgressLocked(playerID string, data ws.ProgressData) error {
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
	_, err := b.validateLocked(playerID, data.Round, data.Action)
	return err
}

// RecordDraft keeps the acting seats' latest draft, used if time runs out.
// Call only after ValidateProgress accepted the same data.
func (b *Bridge) RecordDraft(data ws.ProgressData) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.recordDraftLocked(data)
}

func (b *Bridge) recordDraftLocked(data ws.ProgressData) {
	a := b.actions[data.Action]
	if a == nil || a.accepted || data.Round != b.round {
		return
	}
	if data.Action == "encrypt" && len(data.Clues) > 0 {
		a.clues = [3]string{}
		copy(a.clues[:], data.Clues)
	}
	if data.Action != "encrypt" && len(data.Guesses) == 3 {
		copy(a.guess[:], data.Guesses)
	}
}

// RelayProgress validates, saves and shares a human seat's input atomically.
// The authenticated sender supplies the identity; client payloads cannot choose it.
func (b *Bridge) RelayProgress(playerID, player string, data ws.ProgressData) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if isAI(playerID) || b.validateProgressLocked(playerID, data) != nil {
		return
	}
	// A client announces its dispatch before the submission arrives. Only the
	// accepted SubmitGuess may mark a guess submitted, so reconnects can identify
	// the winner when several teammates dispatch at the same time.
	if data.Action != "encrypt" && data.State == "submitted" {
		data.State = "editing"
	}
	b.recordDraftLocked(data)
	b.relayProgressLocked(ws.PlayerProgressData{Round: data.Round, Action: data.Action, Player: player, PlayerID: playerID, CanSubmit: b.canSubmitLocked(playerID, data.Action), State: data.State, Step: data.Step,
		Focus: data.Focus, Guesses: data.Guesses, Filled: data.Filled, Total: 3})
}

// relayProgress sends progress to every seat, the digits only to those who may
// read them; the others learn which slots are chosen and which one is being
// worked on, never a digit.
// The bridge lock also orders progress before a submission or phase transition.
func (b *Bridge) relayProgressLocked(full ws.PlayerProgressData) {
	b.updateProgressLocked(full, true)
}

func (b *Bridge) updateProgressLocked(full ws.PlayerProgressData, broadcast bool) {
	full.Guesses = append([]int(nil), full.Guesses...)
	full.Filled = append([]bool(nil), full.Filled...)
	readers := b.progressReadersLocked(full.Action)
	hidden := full
	hidden.Guesses = nil
	if full.Action != "encrypt" && full.Guesses != nil {
		hidden.Filled = make([]bool, len(full.Guesses))
		for i, n := range full.Guesses {
			hidden.Filled[i] = n != 0
		}
	}
	for id, v := range b.views {
		progress := make(map[string]*ws.PlayerProgressData, len(v.TeammateProgress)+1)
		for playerID, p := range v.TeammateProgress {
			progress[playerID] = p
		}
		if readers[id] {
			progress[full.PlayerID] = &full
		} else {
			progress[full.PlayerID] = &hidden
		}
		v.TeammateProgress = progress
		b.views[id] = v
	}
	if !broadcast {
		return
	}
	b.broadcastToEachPlayer(func(playerID string) *ws.ServerMessage {
		if readers[playerID] {
			return &ws.ServerMessage{Type: ws.MsgPlayerProgress, Data: full}
		}
		return &ws.ServerMessage{Type: ws.MsgPlayerProgress, Data: hidden}
	})
}

// progressReadersLocked names the seats that read the digits of an action's
// progress: every seat for the clues, whose text never travels; for a guess,
// the guessing team, and the round's encryptor, who can check it against the
// code. Nobody else learns a guess before the code is revealed.
func (b *Bridge) progressReadersLocked(name string) map[string]bool {
	team := ""
	if a := b.actions[name]; a != nil {
		team = a.team
	}
	readers := make(map[string]bool, len(b.views))
	for id, v := range b.views {
		readers[id] = name == "encrypt" || team != "" && v.YourTeam == team || v.YourRole == "encryptor"
	}
	return readers
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

func (b *Bridge) SubmitClues(playerID string, data ws.SubmitCluesData) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	a, err := b.validateLocked(playerID, data.Round, "encrypt")
	if err != nil {
		return err
	}
	for i, c := range data.Clues {
		c = strings.TrimSpace(c)
		if c == "" || utf8.RuneCountInString(c) > 80 {
			return fmt.Errorf("provide three nonempty clues (80 characters max)")
		}
		data.Clues[i] = c
	}
	a.accepted = true
	b.refreshLocked()
	b.CluesCh <- data.Clues
	return nil
}

// SubmitGuess takes a team's decoding ("decrypt") or interception
// ("intercept"). The other team may still be guessing: the round is revealed
// once both have answered.
func (b *Bridge) SubmitGuess(playerID, name string, data ws.SubmitGuessData) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	a, err := b.validateLocked(playerID, data.Round, name)
	if err != nil {
		return err
	}
	if !b.canSubmitLocked(playerID, name) {
		return fmt.Errorf("this seat may only suggest an answer")
	}
	if !validGuess(data.Guess) {
		return fmt.Errorf("guess must contain three different digits from 1 to 4")
	}
	player := playerID
	for _, p := range b.Room.Snapshot().Players {
		if p.ID == playerID {
			player = p.Nickname
			break
		}
	}
	b.relayProgressLocked(ws.PlayerProgressData{Round: data.Round, Action: name, Player: player, PlayerID: playerID, IsAI: isAI(playerID), CanSubmit: true,
		State: "submitted", Step: 3, Guesses: data.Guess[:], Total: 3})
	a.accepted = true
	if a.cancel != nil {
		a.cancel()
	}
	b.refreshLocked()
	if name == "intercept" {
		b.InterceptCh <- data.Guess
	} else {
		b.DecryptCh <- data.Guess
	}
	return nil
}

// Finished reports whether the game has ended.
func (b *Bridge) Finished() bool { b.mu.Lock(); defer b.mu.Unlock(); return b.phase == "game_over" }

// closeInput takes no more answers in this phase.
func (b *Bridge) closeInput() {
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, a := range b.actions {
		a.accepted = true
		if a.cancel != nil {
			a.cancel()
		}
	}
}

func (b *Bridge) actionDeadline(name string) time.Time {
	b.mu.Lock()
	defer b.mu.Unlock()
	if a := b.actions[name]; a != nil {
		return a.deadline
	}
	return time.Time{}
}

func (b *Bridge) remaining(name string) time.Duration {
	return time.Until(b.actionDeadline(name)) + b.Timing.Grace
}

// nextExpiry is how long until the first open action of people runs out,
// grace included. An AI action settles itself by its deadline.
func (b *Bridge) nextExpiry() (time.Duration, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	var first time.Time
	for _, a := range b.actions {
		if a.accepted || a.ai {
			continue
		}
		if end := a.deadline.Add(b.Timing.Grace); first.IsZero() || end.Before(first) {
			first = end
		}
	}
	return time.Until(first), !first.IsZero()
}

// expired closes the open actions of people whose time ran out, and names them.
func (b *Bridge) expired() []string {
	b.mu.Lock()
	defer b.mu.Unlock()
	var names []string
	for name, a := range b.actions {
		if !a.accepted && !a.ai && !time.Now().Before(a.deadline.Add(b.Timing.Grace)) {
			a.accepted = true
			if a.cancel != nil {
				a.cancel()
			}
			names = append(names, name)
		}
	}
	sort.Strings(names)
	if len(names) > 0 {
		b.refreshLocked()
	}
	return names
}

// timedOut settles an action whose time ran out and tells every seat how.
func (b *Bridge) timedOut(r *core.Round, name, team, player, outcome string) {
	round := int(r.GetNumberOfRounds())
	d := ws.TimeoutData{Round: round, Action: name, Team: team, Player: player, Outcome: outcome}
	b.mu.Lock()
	b.roundTimeouts = append(append([]ws.TimeoutData(nil), b.roundTimeouts...), d)
	b.timeouts[round] = append(b.timeouts[round], name)
	for id, v := range b.views {
		v.Timeouts = b.roundTimeouts
		b.views[id] = v
	}
	b.mu.Unlock()
	b.Hub.BroadcastToRoom(b.Room.Code, ws.ServerMessage{Type: ws.MsgTimeout, Data: d})
}

// draftCluesOnTimeout sends what the encryptor wrote; empty lines become a dash.
func (b *Bridge) draftCluesOnTimeout() ([3]string, string) {
	b.mu.Lock()
	var clues [3]string
	if a := b.actions["encrypt"]; a != nil {
		clues = a.clues
	}
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

// draftGuessOnTimeout sends a team's chosen digits when all three are chosen.
func (b *Bridge) draftGuessOnTimeout(name string) ([3]int, string) {
	b.mu.Lock()
	var guess [3]int
	if a := b.actions[name]; a != nil {
		guess = a.guess
	}
	b.mu.Unlock()
	if validGuess(guess) {
		return guess, "guess"
	}
	return [3]int{}, "none"
}

// recordGuess hands a team's answer to the round and tells the table that the
// team has answered. Neither guess is scored before the other is in.
func (b *Bridge) recordGuess(r *core.Round, name string, guess [3]int) {
	switch {
	case name == "intercept" && r.NeedsIntercept():
		r.SetInterceptSecret(guess)
	case name == "decrypt" && r.NeedsDecrypt():
		r.SetDecryptedSecret(guess)
	default:
		return
	}
	round := int(r.GetNumberOfRounds())
	b.mu.Lock()
	team := ""
	if a := b.actions[name]; a != nil {
		a.accepted = true
		if a.cancel != nil {
			a.cancel()
		}
		team = a.team
	}
	b.refreshLocked()
	b.saveLocked()
	b.mu.Unlock()
	b.Hub.BroadcastToRoom(b.Room.Code, ws.ServerMessage{Type: ws.MsgActionSubmitted,
		Data: ws.ActionSubmittedData{Round: round, Action: name, Team: team}})
}

// finishRound reveals the code: both guesses and their verdicts, at once.
func (b *Bridge) finishRound(r *core.Round) {
	history := append(b.buildHistory(r), b.historyRow(r))
	a, bb := b.buildScores()
	result := &ws.RoundResultData{Round: int(r.GetNumberOfRounds()), DecryptSuccess: boolPtr(r.IsDecryptedCorrect()), ScoreA: a, ScoreB: bb}
	if r.HasInterception() {
		result.InterceptSuccess = boolPtr(r.IsInterceptSuccess())
	}
	b.mu.Lock()
	b.phase = "round_result"
	b.actions = nil
	for id, v := range b.views {
		v.Phase = "round_result"
		v.History = history
		v.ScoreA = a
		v.ScoreB = bb
		v.RoundResult = result
		v.Actions = nil
		v.Deadline = 0
		v.Submitted = false
		v.Waiting = true
		v.TeammateProgress = nil
		b.views[id] = v
	}
	b.saveLocked()
	sent := *result
	sent.Notice, sent.History, sent.Complete = b.roundNotice, history, true
	b.mu.Unlock()
	b.Hub.BroadcastToRoom(b.Room.Code, ws.ServerMessage{Type: ws.MsgRoundResult, Data: sent})
}

func (b *Bridge) historyRow(r *core.Round) ws.RoundHistoryRow {
	clues := r.GetEncryptedMessage()
	secret := r.GetSecretDigits()
	intercept := r.GetInterceptSecret()
	decrypt := r.GetDecryptSecret()
	return ws.RoundHistoryRow{Round: int(r.GetNumberOfRounds()), Team: b.teamLabel(r.GetCurrentTeam()), Clues: clues[:], Secret: secret[:], Intercept: intercept[:], Decrypt: decrypt[:], Timeouts: b.timeouts[int(r.GetNumberOfRounds())]}
}
