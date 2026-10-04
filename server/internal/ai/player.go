package ai

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/ZinkLu/decrypto-the-game/server/internal/ai/prompts"
)

// AIPlayer uses an LLMProvider to play Encrypto. What it asks the model lives
// in the prompts package, one file per action.
type AIPlayer struct {
	Provider LLMProvider
}

// NewAIPlayer creates a new AIPlayer backed by the given LLMProvider.
func NewAIPlayer(provider LLMProvider) *AIPlayer {
	return &AIPlayer{Provider: provider}
}

// GenerateSingleClue asks the AI to produce 1 clue word for a specific secret digit.
// alreadyGenerated contains clues produced so far in this round (for context).
func (a *AIPlayer) GenerateSingleClue(ctx context.Context, digit int, words [4]string, history string, alreadyGenerated []string) (string, error) {
	prompt, err := prompts.Clue(prompts.ClueInput{
		Words:    words[:],
		Digit:    digit,
		Word:     words[digit-1],
		Previous: alreadyGenerated,
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

	clue := strings.TrimSpace(resp)
	// Remove quotes if wrapped
	clue = strings.TrimSpace(strings.Trim(clue, "\"'\u201c\u201d\u2018\u2019"))
	if clue == "" || utf8.RuneCountInString(clue) > 80 {
		return "", fmt.Errorf("invalid clue output")
	}
	log.Printf("[AI] GenerateSingleClue digit=%d word=%s → %q", digit, words[digit-1], clue)
	return clue, nil
}

// GuessSingleNumber asks the AI to guess the number (1-4) for a single clue.
// alreadyGuessed contains numbers guessed so far in this round (for context).
func (a *AIPlayer) GuessSingleNumber(ctx context.Context, clue string, words [4]string, isIntercept bool, history string, alreadyGuessed []int) (int, error) {
	prompt, err := prompts.Guess(prompts.GuessInput{
		Clue:      clue,
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

	trimmed := strings.TrimSpace(resp)
	n, err := strconv.Atoi(trimmed)
	if err != nil || n < 1 || n > 4 {
		return 0, fmt.Errorf("invalid guess output: %q", trimmed)
	}
	for _, previous := range alreadyGuessed {
		if n == previous {
			return 0, fmt.Errorf("duplicate guess output: %d", n)
		}
	}
	log.Printf("[AI] GuessSingleNumber clue=%q → %d", clue, n)
	return n, nil
}
