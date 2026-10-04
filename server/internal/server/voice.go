package server

import (
	"github.com/ZinkLu/decrypto-the-game/server/internal/room"
	"github.com/ZinkLu/decrypto-the-game/server/internal/voice"
	"github.com/ZinkLu/decrypto-the-game/server/internal/ws"
)

// voicePlan says who may hear whom in a room. Everyone hears everyone at the
// table, and a team's channel is heard by that team alone; a player without a
// team, who watches a full room, hears the table only. AI players have no
// voice. When each channel is open is up to the pages: the server only makes
// sure that no one else can receive it.
func voicePlan(s room.Snapshot) voice.Plan {
	team := map[string]string{}
	for _, p := range s.TeamA {
		team[p.ID] = "A"
	}
	for _, p := range s.TeamB {
		team[p.ID] = "B"
	}
	var humans []string
	for _, p := range s.Players {
		if !p.IsAI {
			humans = append(humans, p.ID)
		}
	}
	plan := voice.Plan{}
	for _, listener := range humans {
		heard := []voice.Source{}
		for _, speaker := range humans {
			if speaker == listener {
				continue
			}
			heard = append(heard, voice.Source{Speaker: speaker, Channel: voice.Table})
			if own := team[listener]; own != "" && own == team[speaker] {
				heard = append(heard, voice.Source{Speaker: speaker, Channel: voice.Team})
			}
		}
		plan[listener] = heard
	}
	return plan
}

// hearVoice tells the voice service who may now hear whom in the room.
func (h *Handler) hearVoice(r *room.Room) {
	if h.Voice != nil {
		h.Voice.Hear(r.Code, voicePlan(r.Snapshot()))
	}
}

func (h *Handler) hangupVoice(code, player string) {
	if h.Voice != nil {
		h.Voice.Hangup(code, player)
	}
}

// voiceClient names the page code for the voice service, if there is one.
func (h *Handler) voiceClient() string {
	if h.Voice == nil {
		return ""
	}
	return h.Voice.Client()
}

// SendVoice delivers a signal of the voice service to a player's page.
func (h *Handler) SendVoice(code, player string, signal any) {
	h.Hub.SendToPlayer(code, player, ws.ServerMessage{Type: ws.MsgVoiceSignal, Data: signal})
}
