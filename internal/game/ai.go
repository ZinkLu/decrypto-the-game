package game

import (
	"context"
	"fmt"
	"log"

	"github.com/ZinkLu/decrypto-the-game/internal/core"
	"github.com/ZinkLu/decrypto-the-game/internal/ws"
)

func (b *Bridge) aiStatus(action, player, state string, step, completed int, notice string) {
	d := &ws.AIStatusData{Action: action, Player: player, State: state, Step: step, Completed: completed, Total: 3, Notice: notice}
	b.mu.Lock()
	if state == "fallback" {
		b.roundNotice = notice
	}
	for id, v := range b.views {
		v.AIStatus = d
		v.Notice = notice
		if b.roundNotice != "" {
			v.Notice = b.roundNotice
		}
		b.views[id] = v
	}
	b.mu.Unlock()
	typ := ws.MsgAIThinking
	if state == "completed" || state == "fallback" {
		typ = ws.MsgAIActed
	}
	b.Hub.BroadcastToRoom(b.Room.Code, ws.ServerMessage{Type: typ, Data: d})
}

// One retry per step, bounded both by request and whole-action deadlines.
func aiStep[T any](ctx context.Context, b *Bridge, action, player string, step int, call func(context.Context) (T, error), fallback T) T {
	for attempt := 0; attempt < 2 && ctx.Err() == nil; attempt++ {
		state := "thinking"
		notice := ""
		if attempt > 0 {
			state = "retrying"
			notice = "AI 回答无效或超时，正在重试。"
		}
		b.aiStatus(action, player, state, step, step-1, notice)
		requestCtx, cancel := context.WithTimeout(ctx, b.Timing.Request)
		value, err := call(requestCtx)
		if err == nil {
			err = requestCtx.Err()
		}
		cancel()
		if err == nil {
			b.aiStatus(action, player, "completed", step, step, "")
			return value
		}
		log.Printf("[AI] %s step=%d attempt=%d failed: %v", action, step, attempt+1, err)
	}
	b.aiStatus(action, player, "fallback", step, step, "AI 未能完成回答，已使用备用线索或合法猜测继续。")
	return fallback
}

func handleAIEncrypt(parent context.Context, b *Bridge, r *core.Round) [3]string {
	ctx, cancel := context.WithDeadline(parent, b.phaseDeadline())
	defer cancel()
	digits := r.GetSecretDigits()
	words := r.GetCurrentTeam().GetWords()
	history := formatHistoryForAI(b, r)
	var result [3]string
	for i := range result {
		if parent.Err() != nil {
			break
		}
		result[i] = aiStep(ctx, b, "encrypt", r.EncryptPlayer().NickName, i+1, func(ctx context.Context) (string, error) {
			if b.AIPlayer == nil {
				return "", fmt.Errorf("AI provider unavailable")
			}
			return b.AIPlayer.GenerateSingleClue(ctx, digits[i], words, history, result[:i])
		}, "线索暂缺")
		log.Printf("[AI-ENCRYPT] Round %d step %d/3 → %q", r.GetNumberOfRounds(), i+1, result[i])
	}
	return result
}

func handleAIGuess(parent context.Context, b *Bridge, r *core.Round, intercept bool) [3]int {
	ctx, cancel := context.WithDeadline(parent, b.phaseDeadline())
	defer cancel()
	action := "decrypt"
	var words [4]string
	if intercept {
		action = "intercept"
	} else {
		words = r.GetCurrentTeam().GetWords()
	}
	clues := r.GetEncryptedMessage()
	history := formatHistoryForAI(b, r)
	var result [3]int
	for i := range result {
		if parent.Err() != nil {
			break
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
		b.broadcastAIProgress(action, "AI Agent", "editing", i, i+1, result[:i])
		result[i] = aiStep(ctx, b, action, "AI Agent", i+1, func(ctx context.Context) (int, error) {
			if b.AIPlayer == nil {
				return 0, fmt.Errorf("AI provider unavailable")
			}
			return b.AIPlayer.GuessSingleNumber(ctx, clues[i], words, intercept, history, result[:i])
		}, fallback)
		b.broadcastAIProgress(action, "AI Agent", "editing", i+1, 0, result[:i+1])
		log.Printf("[AI-%s] Round %d step %d/3 → %d", action, r.GetNumberOfRounds(), i+1, result[i])
	}
	b.broadcastAIProgress(action, "AI Agent", "submitted", 3, 0, result[:])
	return result
}
