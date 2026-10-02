// Package voice says what the server needs from a voice service: carrying each
// player's voice to the players allowed to hear it. The server decides who may
// hear whom; a service only carries it out, and never lets a voice reach anyone
// else. Implementations are in its subpackages.
package voice

import "encoding/json"

// Channel is where a player speaks.
type Channel string

const (
	// Table is heard by everyone in the room.
	Table Channel = "table"
	// Team is heard by the speaker's teammates only.
	Team Channel = "team"
)

// Source is one player speaking on one channel.
type Source struct {
	Speaker string
	Channel Channel
}

// Plan says, for each player of a room, what they may hear. A player missing
// from it hears nothing.
type Plan map[string][]Source

// Outbox delivers a service's signal to one player's page.
type Outbox func(room, player string, signal any)

// Service carries voices between the pages of a room. Its methods return at
// once and may be called from several goroutines; the work is done in the
// background, and its signals to pages go through the Outbox it was made with.
type Service interface {
	// Client names the page code that speaks this service's signals.
	Client() string
	// Signal handles a signal from a player's page.
	Signal(room, player string, signal json.RawMessage)
	// Hear replaces the plan of a room.
	Hear(room string, plan Plan)
	// Hangup ends a player's voice, as when their page goes away.
	Hangup(room, player string)
	// Close ends every voice of a room that is gone.
	Close(room string)
}
