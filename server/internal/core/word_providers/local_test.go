package word_providers

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The list travels inside the binary, so a server with no words.txt beside it
// still deals a game.
func TestTheBuiltInListNeedsNothingOnDisk(t *testing.T) {
	t.Setenv("DECRYPTO_WORDS_PATH", "")
	p, err := NewLocalProvider()
	if err != nil {
		t.Fatal(err)
	}
	if p.source != "the built-in list" {
		t.Fatalf("dealt from %q, not the built-in list", p.source)
	}
	if len(p.wordList) < 100 {
		t.Fatalf("the built-in list holds only %d words", len(p.wordList))
	}
	words, err := p.Provide(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	assertAHand(t, p, words)
}

// Four different words, every one of them from the list: a team that draws the
// same word twice cannot be given a code.
func assertAHand(t *testing.T, p *LocalProvider, words [4]string) {
	t.Helper()
	inList := make(map[string]bool, len(p.wordList))
	for _, word := range p.wordList {
		inList[word] = true
	}
	drawn := map[string]bool{}
	for i, word := range words {
		if word == "" {
			t.Fatalf("word %d is empty", i+1)
		}
		if !inList[word] {
			t.Fatalf("word %d (%q) is not in the list", i+1, word)
		}
		if drawn[word] {
			t.Fatalf("word %d (%q) is drawn twice in one hand", i+1, word)
		}
		drawn[word] = true
	}
}

func TestAHandNeverRepeatsAWord(t *testing.T) {
	p, err := NewLocalProvider()
	if err != nil {
		t.Fatal(err)
	}
	// Four words out of a short list is where a repeat would show up first.
	short, err := newLocalProvider("甲[a]\n乙[b]\n丙[c]\n丁[d]", "test")
	if err != nil {
		t.Fatal(err)
	}
	for range 200 {
		words, err := short.Provide(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		assertAHand(t, short, words)
	}
	for range 50 {
		words, err := p.Provide(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		assertAHand(t, p, words)
	}
}

// A word is read by everyone at the table, in both languages, the way the list
// is written.
func TestTheBuiltInListIsBilingual(t *testing.T) {
	content, err := list.ReadFile("words.txt")
	if err != nil {
		t.Fatal(err)
	}
	for i, line := range strings.Split(strings.TrimSpace(string(content)), "\n") {
		open := strings.IndexByte(line, '[')
		if open <= 0 || !strings.HasSuffix(line, "]") || strings.TrimSpace(line[open+1:len(line)-1]) == "" {
			t.Fatalf("words.txt line %d is not bilingual: %q", i+1, line)
		}
	}
}

func TestWordsPathPointsAtAListOfItsOwn(t *testing.T) {
	path := filepath.Join(t.TempDir(), "words.txt")
	if err := os.WriteFile(path, []byte("灯笼[lantern]\n\n风筝[kite]\r\n鼓[drum]\n钟[bell]\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DECRYPTO_WORDS_PATH", path)
	p, err := NewLocalProvider()
	if err != nil {
		t.Fatal(err)
	}
	if len(p.wordList) != 4 {
		t.Fatalf("read %d words, want the 4 that are not blank: %v", len(p.wordList), p.wordList)
	}
	for _, word := range p.wordList {
		if strings.ContainsAny(word, "\r\n") {
			t.Fatalf("word %q kept the line ending", word)
		}
	}
	words, err := p.Provide(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	assertAHand(t, p, words)
}

// A list too short to deal a hand is a mistake worth naming, not a game dealt
// from four words with one repeated.
func TestAListTooShortToDealIsRefused(t *testing.T) {
	path := filepath.Join(t.TempDir(), "words.txt")
	if err := os.WriteFile(path, []byte("灯笼[lantern]\n风筝[kite]\n鼓[drum]\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DECRYPTO_WORDS_PATH", path)
	if _, err := NewLocalProvider(); err == nil {
		t.Fatal("a list of three words was accepted")
	}
}

func TestAListThatCannotBeReadIsAnError(t *testing.T) {
	t.Setenv("DECRYPTO_WORDS_PATH", filepath.Join(t.TempDir(), "absent.txt"))
	if _, err := NewLocalProvider(); err == nil {
		t.Fatal("a missing word list was accepted")
	}
}
