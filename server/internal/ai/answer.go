package ai

// A text reply is not a stable protocol: a model asked for "3" also answers
// "答案：3", "**3**", a full sentence, or three lines of reasoning with the
// digit on the last one. So every prompt ends with a fixed answer line —
// 答案：<编号> for a guess, 线索：<词> for a clue — and the parsers here read
// that line. A reply that broke the contract is still worth an answer: the
// bare reply, its last line and its first line each get a turn, and a marker
// anywhere in a line is a last resort. Only a reply that carries no answer at
// all fails.

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

// maxClueRunes bounds a clue: a word or a very short phrase, never a sentence.
const maxClueRunes = 80

// The answer line the prompts ask for, anchored to the start of a line so an
// example a model echoes from the prompt cannot pass for an answer, and taken
// from the end so reasoning that mentions the format cannot pass for one
// either. Markdown, a quote and the hedges 最终/我的 in front of the marker
// are models dressing the line up; the colon may be missing.
var (
	guessLine = regexp.MustCompile(`(?im)^[*_>#\s"']*(?:最终|我的)?\s*(?:答案|answer)\s*(?:是|is)?\s*[：:]?\s*([0-9]+)`)
	clueLine  = regexp.MustCompile(`(?im)^[*_>#\s"']*(?:最终|我的)?\s*(?:线索|clue)\s*(?:是)?\s*[：:]\s*(.+?)\s*$`)
	// The same markers anywhere in a line, for an answer buried in a
	// sentence; only the last occurrence counts.
	guessInline = regexp.MustCompile(`(?i)(?:答案|answer)\s*(?:是|is)?\s*[：:]?\s*([0-9]+)`)
	clueInline  = regexp.MustCompile(`(?i)(?:线索|clue)\s*(?:是)?\s*[：:]\s*([^。\n]+)`)
	// The marker a reply may still wear when the whole reply is read as the
	// clue itself. The colon is required: a clue may legitimately be the word
	// "clue".
	cluePrefix = regexp.MustCompile(`(?i)^(?:最终|我的)?\s*(?:线索|clue)\s*(?:是)?\s*[：:]\s*`)
)

// parseGuess reads the digit 1-4 out of a reply: the marked answer line
// first, then the shapes a bare answer arrives in, then a marker buried in a
// sentence.
func parseGuess(reply string) (int, error) {
	text := normalizeDigits(reply)
	if matches := guessLine.FindAllStringSubmatch(text, -1); len(matches) > 0 {
		if n, ok := parseDigit(matches[len(matches)-1][1]); ok {
			return n, nil
		}
	}
	for _, candidate := range replyCandidates(text) {
		if n, ok := parseDigit(candidate); ok {
			return n, nil
		}
	}
	if matches := guessInline.FindAllStringSubmatch(text, -1); len(matches) > 0 {
		if n, ok := parseDigit(matches[len(matches)-1][1]); ok {
			return n, nil
		}
	}
	return 0, fmt.Errorf("invalid guess output: %q", strings.TrimSpace(reply))
}

// parseClue reads the clue word out of a reply.
func parseClue(reply string) (string, error) {
	text := strings.TrimSpace(reply)
	var candidates []string
	if matches := clueLine.FindAllStringSubmatch(text, -1); len(matches) > 0 {
		candidates = append(candidates, matches[len(matches)-1][1])
	}
	candidates = append(candidates, replyCandidates(text)...)
	if matches := clueInline.FindAllStringSubmatch(text, -1); len(matches) > 0 {
		candidates = append(candidates, matches[len(matches)-1][1])
	}
	for _, candidate := range candidates {
		if clue := cleanClue(candidate); clue != "" && utf8.RuneCountInString(clue) <= maxClueRunes {
			return clue, nil
		}
	}
	return "", fmt.Errorf("invalid clue output: %q", text)
}

// replyCandidates are the shapes a bare answer arrives in: the whole reply,
// then its last line, then its first — a model that added a sentence put the
// answer before or after it.
func replyCandidates(text string) []string {
	text = strings.TrimSpace(text)
	lines := nonEmptyLines(text)
	if len(lines) == 0 {
		return nil
	}
	candidates := []string{text, lines[len(lines)-1]}
	if len(lines) > 1 {
		candidates = append(candidates, lines[0])
	}
	return candidates
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
