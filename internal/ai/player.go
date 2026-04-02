package ai

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"
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

// GenerateClues asks the AI to produce 3 clue words for the given secret digits and words.
func (a *AIPlayer) GenerateClues(ctx context.Context, secretDigits [3]int, words [4]string, history string) [3]string {
	time.Sleep(2 * time.Second)

	prompt := fmt.Sprintf(`你是加密者。你的队伍有 4 个密语词：
1: %s
2: %s
3: %s
4: %s

本轮你需要为以下 3 个数字对应的密语词各给出一个线索词：
密码序列：[%d, %d, %d]
对应词语：%s, %s, %s

历史记录：
%s

请给出 3 个线索词（用逗号分隔，只输出线索词，不要其他内容），例如：苹果,天空,海洋`,
		words[0], words[1], words[2], words[3],
		secretDigits[0], secretDigits[1], secretDigits[2],
		words[secretDigits[0]-1], words[secretDigits[1]-1], words[secretDigits[2]-1],
		history,
	)

	messages := []Message{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: prompt},
	}

	resp, err := a.Provider.Complete(ctx, messages)
	if err != nil {
		log.Printf("ai: GenerateClues error: %v", err)
		return [3]string{"提示1", "提示2", "提示3"}
	}

	clues := parseClues(resp)
	return clues
}

// GuessSequence asks the AI to guess the 3-digit sequence from the given clues.
// If isIntercept is true, the AI is guessing without knowing the opponent's words.
func (a *AIPlayer) GuessSequence(ctx context.Context, clues [3]string, words [4]string, isIntercept bool, history string) [3]int {
	time.Sleep(2 * time.Second)

	var prompt string
	if isIntercept {
		prompt = fmt.Sprintf(`你是拦截者，你不知道对方的密语词。
对方的加密线索为：%s, %s, %s

历史记录：
%s

请根据以往的历史记录和线索，猜测对方的密码序列（每个数字在 1-4 之间，用逗号分隔，只输出数字，不要其他内容），例如：2,3,1`,
			clues[0], clues[1], clues[2],
			history,
		)
	} else {
		prompt = fmt.Sprintf(`你是解密者。你的队伍有 4 个密语词：
1: %s
2: %s
3: %s
4: %s

加密者给出的线索为：%s, %s, %s

历史记录：
%s

请猜测密码序列（每个数字在 1-4 之间，用逗号分隔，只输出数字，不要其他内容），例如：2,3,1`,
			words[0], words[1], words[2], words[3],
			clues[0], clues[1], clues[2],
			history,
		)
	}

	messages := []Message{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: prompt},
	}

	resp, err := a.Provider.Complete(ctx, messages)
	if err != nil {
		log.Printf("ai: GuessSequence error: %v", err)
		return [3]int{1, 2, 3}
	}

	return parseGuess(resp)
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

	result := [3]string{"提示1", "提示2", "提示3"}
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
