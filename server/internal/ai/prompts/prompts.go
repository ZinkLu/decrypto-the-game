// Package prompts holds every prompt the AI players send, one markdown file
// per prompt. The files are compiled into the binary, so the server still runs
// with nothing beside it, and editing a prompt means editing a file rather than
// a Go string.
//
// Each file is a text/template named after the file:
//
//	system.md          the opening instructions, no data
//	clue.md            one clue word for one secret digit
//	guess_intercept.md one digit for a clue of the other team
//	guess_decrypt.md   one digit for a clue of your own team
//	words.md           the four secret words of one team
//
// themes.md is not a prompt but a list: one field per line, which the word
// provider rotates through so two teams in one game are not handed the same
// words. strategies.md is the encryptor's playbook, parsed by section:
// 核心原则 and 红线 render into every clue request, 绿色策略 and 黄色策略 are
// the pool DrawStrategy rotates through, and 人类专用 lists what a single
// clue request cannot carry out.
//
// Besides the fields of the input structs below, the templates may call
// `list`, which numbers a list of words, `join`, which joins a list with a
// separator, and `principles` and `redlines`, which return the standing rules
// from strategies.md. The inputs also carry methods that lay out whole lines —
// this round's code, this round's clues, the digits already guessed — so a
// template never counts positions by itself. A prompt file that names a field
// nobody sets fails to render, so a placeholder can never be shipped by
// accident.
package prompts

import (
	"bytes"
	"embed"
	"fmt"
	"reflect"
	"strings"
	"text/template"
)

//go:embed *.md
var files embed.FS

// Every .md file in this directory becomes a template named after the file.
// A parse error is a mistake in this package, not a runtime condition.
var templates = template.Must(
	template.New("prompts").Funcs(template.FuncMap{
		"list":       list,
		"join":       join,
		"principles": Principles,
		"redlines":   RedLines,
	}).ParseFS(files, "*.md"))

var system = mustRender("system.md", nil)

// System is the prompt every request starts with.
func System() string { return system }

// strategies are the ways of thinking the encryptor rotates through, parsed
// from strategies.md by section. Left to itself the model settles on synonyms
// and plain attributes — exactly the clues the other team's mapping table
// feeds on — so every request names one strategy to try first, while the
// section's principles and red lines ride along on every request.
type strategySet struct {
	principles []string // always rendered into clue.md
	green      []string // rotated pool, preferred
	yellow     []string // rotated pool, every third draw, marked cautious
	redLines   []string // always rendered into clue.md
}

var loaded = mustStrategies()

// yellowMark prefixes a drawn yellow strategy, echoing the principle that
// green ones lead.
const yellowMark = "（黄色策略：先确认队友能解、不触红线再用）"

// ClueStrategies is every rotatable strategy, green first.
func ClueStrategies() []string {
	all := make([]string, 0, len(loaded.green)+len(loaded.yellow))
	return append(append(all, loaded.green...), loaded.yellow...)
}

// DrawStrategy returns the strategy for the nth clue request, counting from
// 1. Green and yellow round-robin apart, yellow taking every third draw.
func DrawStrategy(n uint64) string {
	if n == 0 {
		n = 1
	}
	if n%3 == 0 {
		return yellowMark + loaded.yellow[(n/3-1)%uint64(len(loaded.yellow))]
	}
	return loaded.green[(n-n/3-1)%uint64(len(loaded.green))]
}

// Principles are the standing priorities every clue request carries.
func Principles() []string { return loaded.principles }

// RedLines are what a clue must never do.
func RedLines() []string { return loaded.redLines }

// mustStrategies reads strategies.md by section. The file is prompt content
// edited by hand, so anything the parser does not understand is a mistake to
// fail on here rather than content to drop silently — a red line drawn as a
// strategy would tell the model to break it.
func mustStrategies() strategySet {
	raw, err := files.ReadFile("strategies.md")
	if err != nil {
		panic(err)
	}
	var set strategySet
	section := ""
	for i, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, ">") {
			continue // notes for the reader, not content
		}
		if strings.HasPrefix(line, "#") {
			section = strings.TrimSpace(strings.TrimLeft(line, "# "))
			switch {
			case strings.HasPrefix(section, "核心原则"), strings.HasPrefix(section, "绿色策略"),
				strings.HasPrefix(section, "黄色策略"), strings.HasPrefix(section, "红线"),
				strings.HasPrefix(section, "人类专用"):
			default:
				panic(fmt.Sprintf("prompts: strategies.md line %d: unknown section %q", i+1, section))
			}
			continue
		}
		entry := strings.TrimPrefix(line, "- ")
		switch {
		case strings.HasPrefix(section, "核心原则"):
			set.principles = append(set.principles, entry)
		case strings.HasPrefix(section, "绿色策略"):
			set.green = append(set.green, entry)
		case strings.HasPrefix(section, "黄色策略"):
			set.yellow = append(set.yellow, entry)
		case strings.HasPrefix(section, "红线"):
			set.redLines = append(set.redLines, entry)
		case strings.HasPrefix(section, "人类专用"):
			// kept for human teams; never rotated into a prompt
		default:
			panic(fmt.Sprintf("prompts: strategies.md line %d: entry outside a section", i+1))
		}
	}
	if len(set.principles) == 0 || len(set.green) == 0 || len(set.yellow) == 0 || len(set.redLines) == 0 {
		panic("prompts: strategies.md is missing a section")
	}
	return set
}

// WordInput is what a team needs to be dealt: the field its four words are
// written from.
type WordInput struct {
	Theme string // the drawn field, e.g. 海洋
}

// Words asks for the four words of one team, written from one field.
func Words(in WordInput) (string, error) { return render("words.md", in) }

// themes are the fields the words are written from, one per non-comment line of
// themes.md. Two teams in one game are given two fields, so neither is handed
// the words the other was.
var themes = mustList("themes.md")

// WordThemes are the fields the word provider rotates through, one drawn per
// hand.
func WordThemes() []string { return themes }

// mustList reads a file that is a list rather than a template: one entry per
// line, with the file's own # and > notes left out.
func mustList(name string) []string {
	raw, err := files.ReadFile(name)
	if err != nil {
		panic(err)
	}
	var out []string
	for _, line := range strings.Split(string(raw), "\n") {
		if line = strings.TrimSpace(line); line != "" && !strings.HasPrefix(line, "#") && !strings.HasPrefix(line, ">") {
			out = append(out, line)
		}
	}
	if len(out) == 0 {
		panic("prompts: " + name + " holds no entry")
	}
	return out
}

// ClueInput is what the encryptor needs to answer for one of its digits. The
// whole code goes along, not only the digit being answered: the three clues
// are published together and must not be confusable with each other.
type ClueInput struct {
	Words    []string // the team's four secret words
	Digits   []int    // this round's whole code, three distinct digits in order
	Index    int      // which of the three clues to write, from 0
	Digit    int      // the secret digit, 1-4, this clue has to point at
	Word     string   // the secret word that digit points at
	Previous []string // clues already given this round
	Strategy string   // the drawn way of thinking; empty leaves the section out
	History  string   // the rounds already public
}

// Pos is the position of the clue being written, counted from 1.
func (in ClueInput) Pos() int { return in.Index + 1 }

// CodeLines lays out this round's code one digit per line, each with the word
// it points at, marking the line the clue is being written for.
func (in ClueInput) CodeLines() []string {
	lines := make([]string, len(in.Digits))
	for i, d := range in.Digits {
		word := ""
		if d >= 1 && d <= len(in.Words) {
			word = " → 密语词「" + in.Words[d-1] + "」"
		}
		mark := ""
		if i == in.Index {
			mark = "    ← 现在为这一位给线索"
		}
		lines[i] = fmt.Sprintf("第 %d 位：编号 %d%s%s", i+1, d, word, mark)
	}
	return lines
}

// Clue asks the encryptor for one clue word.
func Clue(in ClueInput) (string, error) { return render("clue.md", in) }

// GuessInput is what a team needs to answer for one of the three clues. The
// whole triple goes along: every guesser sees all three clues at once, and
// the other two are worth reasoning with.
type GuessInput struct {
	Clues     []string // this round's three clues, public to both teams
	Index     int      // which clue to answer, from 0
	Clue      string   // the clue being answered
	Words     []string // the team's own words; the interceptor does not have them
	Intercept bool     // the clue comes from the other team
	Previous  []int    // digits already guessed this round, one per clue answered
	History   string
}

// Pos is the position of the clue being answered, counted from 1.
func (in GuessInput) Pos() int { return in.Index + 1 }

// ClueLines lists this round's clues one per line, marking the one being
// answered.
func (in GuessInput) ClueLines() []string {
	lines := make([]string, len(in.Clues))
	for i, c := range in.Clues {
		mark := ""
		if i == in.Index {
			mark = "    ← 现在猜这一条"
		}
		lines[i] = fmt.Sprintf("第 %d 条：「%s」%s", i+1, c, mark)
	}
	return lines
}

// PreviousLines pairs each clue already answered with the digit guessed for
// it, so the model can cross-check positions rather than a bare digit pool.
func (in GuessInput) PreviousLines() []string {
	lines := make([]string, len(in.Previous))
	for i, n := range in.Previous {
		lines[i] = fmt.Sprintf("第 %d 条已猜编号 %d", i+1, n)
	}
	return lines
}

// Remaining are the digits still available for this clue: the code never
// repeats a digit, and the earlier clues have used theirs up.
func (in GuessInput) Remaining() []int {
	used := make(map[int]bool, len(in.Previous))
	for _, n := range in.Previous {
		used[n] = true
	}
	var rest []int
	for n := 1; n <= 4; n++ {
		if !used[n] {
			rest = append(rest, n)
		}
	}
	return rest
}

// Guess asks for the digit a clue points at. The interceptor gets a prompt
// without words, so it has to read the number out of the history.
func Guess(in GuessInput) (string, error) {
	if in.Intercept {
		return render("guess_intercept.md", in)
	}
	return render("guess_decrypt.md", in)
}

func render(name string, data any) (string, error) {
	var out bytes.Buffer
	if err := templates.ExecuteTemplate(&out, name, data); err != nil {
		return "", fmt.Errorf("prompts: render %s: %w", name, err)
	}
	return out.String(), nil
}

func mustRender(name string, data any) string {
	out, err := render(name, data)
	if err != nil {
		panic(err)
	}
	return out
}

// list numbers the secret words the way the players read them, one per line.
func list(items []string) string {
	lines := make([]string, 0, len(items))
	for i, item := range items {
		lines = append(lines, fmt.Sprintf("%d: %s", i+1, item))
	}
	return strings.Join(lines, "\n")
}

// join renders a list of any type as text, so a template can lay out digits and
// words alike.
func join(sep string, items any) string {
	value := reflect.ValueOf(items)
	if !value.IsValid() || (value.Kind() != reflect.Slice && value.Kind() != reflect.Array) {
		return fmt.Sprint(items)
	}
	parts := make([]string, value.Len())
	for i := range parts {
		parts[i] = fmt.Sprint(value.Index(i).Interface())
	}
	return strings.Join(parts, sep)
}
