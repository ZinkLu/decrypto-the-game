package ai

import (
	"context"
	"log"
	"sync/atomic"

	"github.com/ZinkLu/decrypto-the-game/server/internal/ai/prompts"
)

// AIPlayer uses an LLMProvider to play Encrypto. What it asks the model lives
// in the prompts package, one file per action.
type AIPlayer struct {
	Provider LLMProvider
	// strategy counts the drawn strategies, so a run of clue requests rotates
	// through the whole list instead of settling into one trick.
	strategy atomic.Uint64
}

// NewAIPlayer creates a new AIPlayer backed by the given LLMProvider.
func NewAIPlayer(provider LLMProvider) *AIPlayer {
	return &AIPlayer{Provider: provider}
}

// GenerateClues asks the AI for this round's three clue words in one request:
// the three clues are published together and must be chosen against each
// other anyway, and one slow request per word would not fit the action's
// deadline. Each position draws its own strategy from the rotation.
func (a *AIPlayer) GenerateClues(ctx context.Context, digits [3]int, words [4]string, history string) ([3]string, error) {
	strategies := make([]string, len(digits))
	for i := range strategies {
		strategies[i] = prompts.DrawStrategy(a.strategy.Add(1))
	}
	prompt, err := prompts.Clue(prompts.ClueInput{
		Words:      words[:],
		Digits:     digits[:],
		Strategies: strategies,
		History:    history,
	})
	if err != nil {
		return [3]string{}, err
	}

	messages := []Message{
		{Role: "system", Content: prompts.System()},
		{Role: "user", Content: prompt},
	}

	resp, err := a.Provider.Complete(ctx, messages)
	if err != nil {
		log.Printf("[AI] GenerateClues error: %v", err)
		return [3]string{}, err
	}

	clues, err := parseClues(resp)
	if err != nil {
		return [3]string{}, err
	}
	log.Printf("[AI] GenerateClues digits=%v → %q", digits, clues)
	return clues, nil
}

// GuessCode asks the AI for the digits this round's three clues point at, in
// one request: every guesser sees all three clues at once and answers them
// against each other.
func (a *AIPlayer) GuessCode(ctx context.Context, clues [3]string, words [4]string, isIntercept bool, history string) ([3]int, error) {
	prompt, err := prompts.Guess(prompts.GuessInput{
		Clues:     clues[:],
		Words:     words[:],
		Intercept: isIntercept,
		History:   history,
	})
	if err != nil {
		return [3]int{}, err
	}

	messages := []Message{
		{Role: "system", Content: prompts.System()},
		{Role: "user", Content: prompt},
	}

	resp, err := a.Provider.Complete(ctx, messages)
	if err != nil {
		log.Printf("[AI] GuessCode error: %v", err)
		return [3]int{}, err
	}

	guess, err := parseGuessTriple(resp)
	if err != nil {
		return [3]int{}, err
	}
	log.Printf("[AI] GuessCode clues=%q → %v", clues, guess)
	return guess, nil
}
