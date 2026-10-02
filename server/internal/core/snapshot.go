package core

import "fmt"

// SessionSnapshot holds what is needed to rebuild a Session after a restart.
// Scores are not part of it: they follow from the rounds.
type SessionSnapshot struct {
	ID        string          `json:"id"`
	MaxRounds uint8           `json:"max_rounds"`
	Teams     [2]TeamSnapshot `json:"teams"`
	Rounds    []RoundSnapshot `json:"rounds"`
}

type TeamSnapshot struct {
	Players []Player  `json:"players"`
	Words   [4]string `json:"words"`
}

// RoundSnapshot is one round, finished or interrupted. Phase is the phase the
// round was in. Intercepted and Decrypted tell whether that guess was given:
// a guess that ran out of time is all zeros, like one not given yet. Guesses
// are scored only once the round is DONE, when the code is revealed.
type RoundSnapshot struct {
	Number      uint8     `json:"number"`
	Phase       TeamState `json:"phase"`
	Encryptor   uint8     `json:"encryptor"` // index within the encrypting team
	Secret      [3]int    `json:"secret"`
	Clues       [3]string `json:"clues"`
	Intercept   [3]int    `json:"intercept"`
	Intercepted bool      `json:"intercepted"`
	Decrypt     [3]int    `json:"decrypt"`
	Decrypted   bool      `json:"decrypted"`
}

// Snapshot copies the session. Like every read of a running session, it
// belongs to the goroutine that forwards the game.
func (s *Session) Snapshot() SessionSnapshot {
	snap := SessionSnapshot{ID: s.sessionId, MaxRounds: s.maxRounds, Rounds: make([]RoundSnapshot, 0, len(s.rounds))}
	for i, t := range s.teams {
		players := make([]Player, 0, len(t.Players))
		for _, p := range t.Players {
			players = append(players, *p)
		}
		snap.Teams[i] = TeamSnapshot{Players: players, Words: t.Words}
	}
	for _, r := range s.rounds {
		snap.Rounds = append(snap.Rounds, RoundSnapshot{
			Number:      r.roundN,
			Phase:       r.state,
			Encryptor:   r.encryptPlayerIndex,
			Secret:      r.secret,
			Clues:       r.encryptedMessage,
			Intercept:   r.interceptedSecret,
			Intercepted: r.intercepted,
			Decrypt:     r.decryptSecret,
			Decrypted:   r.decrypted,
		})
	}
	return snap
}

// Restore rebuilds a session from a snapshot, ready for Resume. It refuses a
// snapshot the game could not have produced, rather than fail later mid-game.
func Restore(snap SessionSnapshot) (*Session, error) {
	if snap.ID == "" || snap.MaxRounds == 0 || len(snap.Rounds) > int(snap.MaxRounds) {
		return nil, fmt.Errorf("invalid session snapshot %q: %d of %d rounds", snap.ID, len(snap.Rounds), snap.MaxRounds)
	}
	s := &Session{sessionId: snap.ID, maxRounds: snap.MaxRounds}
	for i, t := range snap.Teams {
		if len(t.Players) < 2 {
			return nil, fmt.Errorf("invalid session snapshot %q: team %d has %d players", snap.ID, i, len(t.Players))
		}
		for _, w := range t.Words {
			if w == "" {
				return nil, fmt.Errorf("invalid session snapshot %q: team %d lacks a word", snap.ID, i)
			}
		}
		players := make([]*Player, len(t.Players))
		for j := range t.Players {
			p := t.Players[j]
			players[j] = &p
		}
		s.teams[i] = &Team{Players: players, Words: t.Words}
	}
	for i, rs := range snap.Rounds {
		current, opponent := s.teams[i%2], s.teams[(i+1)%2]
		if err := rs.validate(i, len(current.Players), i == len(snap.Rounds)-1); err != nil {
			return nil, fmt.Errorf("invalid session snapshot %q: round %d: %w", snap.ID, i+1, err)
		}
		r := &Round{
			gameSession:        s,
			previousRound:      s.currentRound,
			opponent:           opponent,
			currentTeam:        current,
			state:              rs.Phase,
			roundN:             rs.Number,
			secret:             rs.Secret,
			encryptedMessage:   rs.Clues,
			encryptPlayerIndex: rs.Encryptor,
			encryptPlayer:      current.Players[rs.Encryptor],
			interceptedSecret:  rs.Intercept,
			decryptSecret:      rs.Decrypt,
			intercepted:        rs.Intercepted,
			decrypted:          rs.Decrypted,
		}
		if r.state == DONE {
			r.reveal()
		}
		s.rounds = append(s.rounds, r)
		s.currentRound = r
	}
	return s, nil
}

func (rs RoundSnapshot) validate(index, teamSize int, last bool) error {
	intercepts := rs.Number > 2 // the first round of each team is not intercepted
	switch {
	case int(rs.Number) != index+1:
		return fmt.Errorf("numbered %d", rs.Number)
	case rs.Phase > DONE:
		return fmt.Errorf("unknown phase %d", rs.Phase)
	case !last && rs.Phase != DONE:
		return fmt.Errorf("unfinished before a later round")
	case int(rs.Encryptor) >= teamSize:
		return fmt.Errorf("encryptor %d of %d players", rs.Encryptor, teamSize)
	case !validCode(rs.Secret):
		return fmt.Errorf("code %v", rs.Secret)
	case rs.Intercepted && (!intercepts || rs.Phase < GUESSING):
		return fmt.Errorf("interception given in phase %d", rs.Phase)
	case rs.Decrypted && rs.Phase < GUESSING:
		return fmt.Errorf("decoding given in phase %d", rs.Phase)
	case rs.Phase == DONE && intercepts && !rs.Intercepted:
		return fmt.Errorf("finished without the interception")
	case rs.Phase == DONE && !rs.Decrypted:
		return fmt.Errorf("finished without decoding")
	}
	return nil
}

// validCode reports whether code holds three different digits from 1 to 4.
func validCode(code [3]int) bool {
	seen := [5]bool{}
	for _, n := range code {
		if n < 1 || n > 4 || seen[n] {
			return false
		}
		seen[n] = true
	}
	return true
}
