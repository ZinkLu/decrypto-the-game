package ai

// A text reply is not a stable protocol: a model asked for "答案：3" also
// answers "**答案：3**", a full-width ３, or three lines of reasoning with the
// answers at the end. So every prompt ends with fixed answer lines — three
// times 答案：<编号> for a guess, three times 线索：<词> for the clues — and
// the parsers here read those lines. A reply that broke the contract is still
// worth an answer: its bare lines each get a turn. Only a reply that carries
// fewer than three answers fails.

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

// maxClueRunes bounds a clue: a word or a very short phrase, never a sentence.
const maxClueRunes = 80

// The answer lines the prompts ask for, anchored to the start of a line so an
// example a model echoes from the prompt cannot pass for an answer. Markdown,
// a quote and the hedges 最终/我的 in front of the marker are models dressing
// the line up; the guess's colon may be missing.
var (
	guessLine = regexp.MustCompile(`(?im)^[*_>#\s"']*(?:最终|我的)?\s*(?:答案|answer)\s*(?:是|is)?\s*[：:]?\s*([0-9]+)`)
	clueLine  = regexp.MustCompile(`(?im)^[*_>#\s"']*(?:最终|我的)?\s*(?:线索|clue)\s*(?:是)?\s*[：:]\s*(.+?)\s*$`)
	// The marker a bare line may still wear when it is read as the clue
	// itself. The colon is required: a clue may legitimately be the word
	// "clue".
	cluePrefix = regexp.MustCompile(`(?i)^(?:最终|我的)?\s*(?:线索|clue)\s*(?:是)?\s*[：:]\s*`)
)

// parseGuessTriple reads the three digits 1-4 out of a one-shot reply: the
// marked answer lines first — the last three, so a corrected first attempt
// does not pass for the answer — then the bare digit lines of a reply that
// skipped the markers. The code never repeats a digit, so three equal digits
// are no answer.
func parseGuessTriple(reply string) ([3]int, error) {
	text := normalizeDigits(reply)
	var digits []int
	if matches := guessLine.FindAllStringSubmatch(text, -1); len(matches) >= 3 {
		for _, m := range matches[len(matches)-3:] {
			if n, ok := parseDigit(m[1]); ok {
				digits = append(digits, n)
			}
		}
	} else {
		for _, line := range nonEmptyLines(text) {
			if n, ok := parseDigit(line); ok {
				digits = append(digits, n)
			}
		}
	}
	var out [3]int
	if len(digits) >= 3 {
		copy(out[:], digits[:3])
		if out[0] != out[1] && out[1] != out[2] && out[0] != out[2] {
			return out, nil
		}
	}
	return [3]int{}, fmt.Errorf("invalid guess output: %q", strings.TrimSpace(reply))
}

// parseClues reads the three clue words out of a one-shot reply: the marked
// answer lines first, then the bare lines of a reply that skipped the markers.
func parseClues(reply string) ([3]string, error) {
	text := strings.TrimSpace(reply)
	var candidates []string
	if matches := clueLine.FindAllStringSubmatch(text, -1); len(matches) >= 3 {
		for _, m := range matches[len(matches)-3:] {
			candidates = append(candidates, m[1])
		}
	} else {
		candidates = nonEmptyLines(text)
	}
	var clues []string
	for _, candidate := range candidates {
		if clue := cleanClue(candidate); clue != "" && utf8.RuneCountInString(clue) <= maxClueRunes {
			clues = append(clues, clue)
		}
	}
	var out [3]string
	if len(clues) < 3 {
		return out, fmt.Errorf("invalid clues output: %q", text)
	}
	copy(out[:], clues[:3])
	return out, nil
}

func nonEmptyLines(text string) []string {
	var lines []string
	for _, line := range strings.Split(text, "\n") {
		if line = strings.TrimSpace(line); line != "" {
			lines = append(lines, line)
		}
	}
	return lines
}

// parseDigit reads a lone digit 1-4: markdown, quotes and a trailing period
// are what a model wraps one in.
func parseDigit(s string) (int, bool) {
	s = strings.Trim(strings.TrimSpace(s), "*_`\"'“”‘’「」 \t")
	s = strings.Trim(s, "。．.：:！!，,、")
	n, err := strconv.Atoi(s)
	return n, err == nil && n >= 1 && n <= 4
}

// cleanClue reduces one candidate to the clue word itself: no wrapping quotes
// or markdown, no answer-line marker, no explanation in brackets or after a
// sentence break. A candidate that still holds a newline is not a clue word.
func cleanClue(s string) string {
	s = strings.TrimSpace(s)
	if strings.ContainsAny(s, "\n\r") {
		return ""
	}
	s = strings.Trim(s, "*_`\"'“”‘’「」 \t")
	s = cluePrefix.ReplaceAllString(s, "")
	for _, open := range []string{"（", "("} {
		if i := strings.Index(s, open); i >= 0 {
			s = strings.TrimSpace(s[:i])
		}
	}
	if i := strings.IndexAny(s, "。；;！!？?"); i >= 0 {
		s = strings.TrimSpace(s[:i])
	}
	s = strings.Trim(s, "*_`\"'“”‘’「」 \t")
	return strings.Trim(s, "。．.：:！!，,、")
}

// normalizeDigits folds full-width digits onto ASCII ones.
func normalizeDigits(s string) string {
	return strings.Map(func(r rune) rune {
		if r >= '０' && r <= '９' {
			return r - '０' + '0'
		}
		return r
	}, s)
}
