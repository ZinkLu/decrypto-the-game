package ai

import (
	"context"
	"fmt"
	"log"
	"sync/atomic"

	"github.com/ZinkLu/decrypto-the-game/server/internal/ai/prompts"
)

// AIPlayer uses an LLMProvider to play Encrypto. What it asks the model lives
// in the prompts package, one file per action.
type AIPlayer struct {
	Provider LLMProvider
	// strategy counts the clue requests, one drawn strategy each, so a run of
	// clues rotates through the whole list instead of settling into one trick.
	strategy atomic.Uint64
}

// NewAIPlayer creates a new AIPlayer backed by the given LLMProvider.
func NewAIPlayer(provider LLMProvider) *AIPlayer {
	return &AIPlayer{Provider: provider}
}

// GenerateSingleClue asks the AI to produce the clue at position index of
// this round's code. digits is the whole code, so the clue can be chosen
// against the other two; alreadyGenerated contains the clues produced so far.
func (a *AIPlayer) GenerateSingleClue(ctx context.Context, digits [3]int, index int, words [4]string, history string, alreadyGenerated []string) (string, error) {
	digit := digits[index]
	prompt, err := prompts.Clue(prompts.ClueInput{
		Words:    words[:],
		Digits:   digits[:],
		Index:    index,
		Digit:    digit,
		Word:     words[digit-1],
		Previous: alreadyGenerated,
		Strategy: prompts.DrawStrategy(a.strategy.Add(1)),
		History:  history,
	})
	if err != nil {
		return "", err
	}

	messages := []Message{
		{Role: "system", Content: prompts.System()},
		{Role: "user", Content: prompt},
	}

	resp, err := a.Provider.Complete(ctx, messages)
	if err != nil {
		log.Printf("[AI] GenerateSingleClue error: %v", err)
		return "", err
	}

	clue, err := parseClue(resp)
	if err != nil {
		return "", err
	}
	log.Printf("[AI] GenerateSingleClue digit=%d word=%s → %q", digit, words[digit-1], clue)
	return clue, nil
}

// GuessSingleNumber asks the AI for the digit at position index of this
// round's clues. The whole triple goes along, as every guesser sees all three
// clues at once and reasons with the other two. alreadyGuessed contains the
// digits guessed for the earlier clues of this round.
func (a *AIPlayer) GuessSingleNumber(ctx context.Context, clues [3]string, index int, words [4]string, isIntercept bool, history string, alreadyGuessed []int) (int, error) {
	prompt, err := prompts.Guess(prompts.GuessInput{
		Clues:     clues[:],
		Index:     index,
		Clue:      clues[index],
		Words:     words[:],
		Intercept: isIntercept,
		Previous:  alreadyGuessed,
		History:   history,
	})
	if err != nil {
		return 0, err
	}

	messages := []Message{
		{Role: "system", Content: prompts.System()},
		{Role: "user", Content: prompt},
	}

	resp, err := a.Provider.Complete(ctx, messages)
	if err != nil {
		log.Printf("[AI] GuessSingleNumber error: %v", err)
		return 0, err
	}

	n, err := parseGuess(resp)
	if err != nil {
		return 0, err
	}
	for _, previous := range alreadyGuessed {
		if n == previous {
			return 0, fmt.Errorf("duplicate guess output: %d", n)
		}
	}
	log.Printf("[AI] GuessSingleNumber clue=%q → %d", clues[index], n)
	return n, nil
}
