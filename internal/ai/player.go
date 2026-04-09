package ai

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"strings"
)

const systemPrompt = `你是一个正在玩 Decrypto（谍报风云）桌游的 AI 玩家。

游戏规则：
- 两支队伍各有 4 个密语词（编号 1-4）
- 每轮，一名加密者获得 3 个数字密码（如 [3,1,4]），需要为对应的密语词各给出一个线索词
- 对方队伍根据线索猜测密码序列（拦截）
- 己方队伍根据线索猜测密码序列（解密）
- 线索要让队友能猜到，但不能太明显让对手也猜到

你需要认真思考后给出答案。`

// AIPlayer uses an LLMProvider to play Decrypto.
type AIPlayer struct {
	Provider LLMProvider
}

// NewAIPlayer creates a new AIPlayer backed by the given LLMProvider.
func NewAIPlayer(provider LLMProvider) *AIPlayer {
	return &AIPlayer{Provider: provider}
}

// GenerateSingleClue asks the AI to produce 1 clue word for a specific secret digit.
// alreadyGenerated contains clues produced so far in this round (for context).
func (a *AIPlayer) GenerateSingleClue(ctx context.Context, digit int, words [4]string, history string, alreadyGenerated []string) string {
	targetWord := words[digit-1]

	var prevContext string
	if len(alreadyGenerated) > 0 {
		prevContext = fmt.Sprintf("\n你本轮已经给出的线索：%s\n请不要给出重复或相似的线索。", strings.Join(alreadyGenerated, ", "))
	}

	prompt := fmt.Sprintf(`你是加密者。你的队伍有 4 个密语词：
1: %s
2: %s
3: %s
4: %s

请为密语词 #%d（%s）给出一个线索词。
线索要让队友能猜到对应的编号，但不能太明显让对手也猜到。%s

历史记录：
%s

请只输出一个线索词，不要其他内容。`,
		words[0], words[1], words[2], words[3],
		digit, targetWord,
		prevContext,
		history,
	)

	messages := []Message{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: prompt},
	}

	resp, err := a.Provider.Complete(ctx, messages)
	if err != nil {
		log.Printf("[AI] GenerateSingleClue error: %v", err)
		return fmt.Sprintf("clue%d", digit)
	}

	clue := strings.TrimSpace(resp)
	// Remove quotes if wrapped
	clue = strings.Trim(clue, "\"'\u201c\u201d\u2018\u2019")
	if clue == "" {
		clue = fmt.Sprintf("clue%d", digit)
	}
	log.Printf("[AI] GenerateSingleClue digit=%d word=%s → %q", digit, targetWord, clue)
	return clue
}

// GuessSingleNumber asks the AI to guess the number (1-4) for a single clue.
// alreadyGuessed contains numbers guessed so far in this round (for context).
func (a *AIPlayer) GuessSingleNumber(ctx context.Context, clue string, words [4]string, isIntercept bool, history string, alreadyGuessed []int) int {
	var prevContext string
	if len(alreadyGuessed) > 0 {
		parts := make([]string, len(alreadyGuessed))
		for i, n := range alreadyGuessed {
			parts[i] = strconv.Itoa(n)
		}
		prevContext = fmt.Sprintf("\n你本轮已经猜测的编号：%s", strings.Join(parts, ", "))
	}

	var prompt string
	if isIntercept {
		prompt = fmt.Sprintf(`你是拦截者，你不知道对方的密语词。
当前需要猜测的线索词是："%s"%s

历史记录：
%s

请根据历史记录和线索，猜测这个线索对应的编号（1-4 之间的一个数字），只输出数字，不要其他内容。`,
			clue, prevContext, history)
	} else {
		prompt = fmt.Sprintf(`你是解密者。你的队伍有 4 个密语词：
1: %s
2: %s
3: %s
4: %s

当前需要猜测的线索词是："%s"%s

历史记录：
%s

请猜测这个线索对应的编号（1-4 之间的一个数字），只输出数字，不要其他内容。`,
			words[0], words[1], words[2], words[3],
			clue, prevContext, history)
	}

	messages := []Message{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: prompt},
	}

	resp, err := a.Provider.Complete(ctx, messages)
	if err != nil {
		log.Printf("[AI] GuessSingleNumber error: %v", err)
		return 1
	}

	trimmed := strings.TrimSpace(resp)
	n, err := strconv.Atoi(trimmed)
	if err != nil || n < 1 || n > 4 {
		log.Printf("[AI] GuessSingleNumber invalid response %q, fallback to 1", trimmed)
		return 1
	}
	log.Printf("[AI] GuessSingleNumber clue=%q → %d", clue, n)
	return n
}

// parseClues splits a comma-separated response into exactly 3 clue strings.
func parseClues(resp string) [3]string {
	resp = strings.TrimSpace(resp)
	// Try both ASCII and full-width commas.
	var parts []string
	if strings.Contains(resp, "，") {
		parts = strings.Split(resp, "，")
	} else {
		parts = strings.Split(resp, ",")
	}

	result := [3]string{"clue1", "clue2", "clue3"}
	for i := 0; i < 3 && i < len(parts); i++ {
		trimmed := strings.TrimSpace(parts[i])
		if trimmed != "" {
			result[i] = trimmed
		}
	}
	return result
}

// parseGuess splits a comma-separated response into exactly 3 ints in range [1,4].
func parseGuess(resp string) [3]int {
	resp = strings.TrimSpace(resp)
	var parts []string
	if strings.Contains(resp, "，") {
		parts = strings.Split(resp, "，")
	} else {
		parts = strings.Split(resp, ",")
	}

	result := [3]int{1, 2, 3}
	for i := 0; i < 3 && i < len(parts); i++ {
		trimmed := strings.TrimSpace(parts[i])
		n, err := strconv.Atoi(trimmed)
		if err != nil || n < 1 || n > 4 {
			return [3]int{1, 2, 3}
		}
		result[i] = n
	}
	return result
}
