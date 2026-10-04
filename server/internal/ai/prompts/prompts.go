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
//
// Besides the fields of the input structs below, the templates may call
// `list`, which numbers a list of words, and `join`, which joins a list with a
// separator. A prompt file that names a field nobody sets fails to render, so a
// placeholder can never be shipped by accident.
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
		"list": list,
		"join": join,
	}).ParseFS(files, "*.md"))

var system = mustRender("system.md", nil)

// System is the prompt every request starts with.
func System() string { return system }

// ClueInput is what the encryptor needs to answer for one of its digits.
type ClueInput struct {
	Words    []string // the team's four secret words
	Digit    int      // the secret digit, 1-4, this clue has to point at
	Word     string   // the secret word that digit points at
	Previous []string // clues already given this round
	History  string   // the rounds already public
}

// Clue asks the encryptor for one clue word.
func Clue(in ClueInput) (string, error) { return render("clue.md", in) }

// GuessInput is what a team needs to answer for one of the three clues.
type GuessInput struct {
	Clue      string
	Words     []string // the team's own words; the interceptor does not have them
	Intercept bool     // the clue comes from the other team
	Previous  []int    // digits already guessed this round
	History   string
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
