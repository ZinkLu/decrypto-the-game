package prompts

import (
	"strconv"
	"strings"
	"testing"
)

var words = []string{"长城", "风筝", "火锅", "玻璃"}

var digits = []int{3, 1, 4}

var clues = []string{"灯塔", "炊烟", "病人"}

const history = "第 1 回合（对方加密）：密码 [1 3 2]；线索 \"灯塔\"→1"

func renderAll(t *testing.T) map[string]string {
	t.Helper()
	rendered := map[string]string{"system": System()}
	for name, in := range map[string]any{
		"clue":            ClueInput{Words: words, Digits: digits, History: history},
		"guess_intercept": GuessInput{Clues: clues, Intercept: true, History: history},
		"guess_decrypt":   GuessInput{Clues: clues, Words: words, History: history},
		"words":           WordInput{Theme: WordThemes()[0]},
	} {
		out, err := render(name+".md", in)
		if err != nil {
			t.Fatalf("render %s: %v", name, err)
		}
		rendered[name] = out
	}
	return rendered
}

// Every prompt has to render. A file renamed or a placeholder no field fills
// breaks here rather than in the middle of a round.
func TestEveryPromptRenders(t *testing.T) {
	for name, out := range renderAll(t) {
		if strings.TrimSpace(out) == "" {
			t.Fatalf("%s rendered empty", name)
		}
		if strings.Contains(out, "{{") {
			t.Fatalf("%s left a placeholder behind: %q", name, out)
		}
	}
}

func TestSystemIsShared(t *testing.T) {
	if System() != renderAll(t)["system"] {
		t.Fatal("System is not the system.md text")
	}
	for _, want := range []string{"Encrypto", "互不相同", "线索→编号"} {
		if !strings.Contains(System(), want) {
			t.Fatalf("system prompt no longer teaches %q", want)
		}
	}
}

func TestClueCarriesTheWordsAndTheCode(t *testing.T) {
	out, err := Clue(ClueInput{Words: words, Digits: digits, History: history})
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		"1: 长城", "2: 风筝", "3: 火锅", "4: 玻璃",
		"第 1 位：编号 3 → 密语词「火锅」",
		"第 2 位：编号 1 → 密语词「长城」",
		"第 3 位：编号 4 → 密语词「玻璃」",
		history,
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("clue prompt is missing %q:\n%s", want, out)
		}
	}
}

// One request writes all three clues, so the prompt asks for three answer
// lines and never marks a single position.
func TestClueAsksForAllThreeAtOnce(t *testing.T) {
	out, err := Clue(ClueInput{Words: words, Digits: digits, History: history})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(out, "←") {
		t.Fatalf("clue prompt marks a single position:\n%s", out)
	}
	if !strings.Contains(out, "只输出三行") || !strings.Contains(out, "「线索：X」") {
		t.Fatalf("clue prompt does not ask for three answer lines:\n%s", out)
	}
}

// The strategy section belongs to the drawn strategies alone, but the rules
// that keep clues out of the other team's mapping table are always on: they
// are the point of the whole prompt.
func TestClueStrategyIsInjected(t *testing.T) {
	plain, err := Clue(ClueInput{Words: words, Digits: digits, History: history})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(plain, "本次为三位各优先采用的策略") {
		t.Fatalf("clue prompt invents a strategy section:\n%s", plain)
	}
	for _, want := range []string{"不断变长的对应表", "换一个新的联想角度", "不要给同义词", "查不到相似的旧线索",
		"队友能解 > 对手难查表", "直接说出完整关键词"} {
		if !strings.Contains(plain, want) {
			t.Fatalf("clue prompt is missing %q:\n%s", want, plain)
		}
	}
	for _, strategy := range ClueStrategies() {
		out, err := Clue(ClueInput{Words: words, Digits: digits, Strategies: []string{strategy, strategy, strategy}, History: history})
		if err != nil {
			t.Fatal(err)
		}
		if n := strings.Count(out, strategy); n != 3 {
			t.Fatalf("clue prompt carries the drawn strategy %q %d times, not once per position:\n%s", strategy, n, out)
		}
	}
	if len(ClueStrategies()) < 2 {
		t.Fatalf("rotating %d strategies rotates nothing", len(ClueStrategies()))
	}
}

// A guesser sees all three clues at once, as the table does, and answers all
// three in one reply: the prompt has to carry the whole triple and ask for
// three answer lines, without marking a single clue.
func TestGuessShowsAllCluesAndAsksForThreeAnswers(t *testing.T) {
	for _, intercept := range []bool{true, false} {
		out, err := Guess(GuessInput{Clues: clues, Words: words, Intercept: intercept, History: history})
		if err != nil {
			t.Fatal(err)
		}
		for i, clue := range clues {
			want := "第 " + strconv.Itoa(i+1) + " 条：「" + clue + "」"
			if !strings.Contains(out, want) {
				t.Fatalf("guess prompt (intercept=%v) is missing %q:\n%s", intercept, want, out)
			}
		}
		if strings.Contains(out, "←") {
			t.Fatalf("guess prompt (intercept=%v) marks a single clue:\n%s", intercept, out)
		}
		if !strings.Contains(out, "只输出三行") || !strings.Contains(out, "三个数字互不相同") {
			t.Fatalf("guess prompt (intercept=%v) does not ask for three distinct answers:\n%s", intercept, out)
		}
	}
}

// The interceptor plays without knowing the other team's words. The prompt is
// the only place that can leak them, so it has to leave them out whatever the
// caller passes. A clue may of course be any word, so the guard looks for the
// numbered list rather than the words themselves.
func TestInterceptorNeverSeesWords(t *testing.T) {
	lines := make([]string, len(words))
	for i, word := range words {
		lines[i] = strconv.Itoa(i+1) + ": " + word
	}

	intercept, err := Guess(GuessInput{Clues: clues, Words: words, Intercept: true, History: history})
	if err != nil {
		t.Fatal(err)
	}
	decrypt, err := Guess(GuessInput{Clues: clues, Words: words, History: history})
	if err != nil {
		t.Fatal(err)
	}
	for _, line := range lines {
		if strings.Contains(intercept, line) {
			t.Fatalf("intercept prompt leaks %q:\n%s", line, intercept)
		}
		if !strings.Contains(decrypt, line) {
			t.Fatalf("decrypt prompt is missing %q:\n%s", line, decrypt)
		}
	}
}

// A hand is written from one field and in both languages: a word the players
// cannot read in English is a word the model will not be asked for twice.
func TestWordsCarryTheFieldAndBothLanguages(t *testing.T) {
	if len(WordThemes()) < 2 {
		t.Fatalf("rotating %d fields rotates nothing", len(WordThemes()))
	}
	for _, theme := range WordThemes() {
		out, err := Words(WordInput{Theme: theme})
		if err != nil {
			t.Fatal(err)
		}
		for _, want := range []string{"这一局的领域是：" + theme, "长城[great wall]", "只有中文的词不算数"} {
			if !strings.Contains(out, want) {
				t.Fatalf("words prompt for %q is missing %q:\n%s", theme, want, out)
			}
		}
	}
}

// strategies.md is parsed by section: the standing rules render into every
// clue prompt, the green and yellow pools rotate, and the human-only section
// never reaches a model — those plays need a voice channel, memory across
// games, or a trust a single request cannot ask for.
func TestStrategiesParseIntoSections(t *testing.T) {
	if len(Principles()) == 0 || len(RedLines()) == 0 {
		t.Fatal("strategies.md lost a standing section")
	}
	for _, entry := range append(append([]string{}, Principles()...), RedLines()...) {
		if strings.HasPrefix(entry, "- ") || strings.HasPrefix(entry, "#") || strings.HasPrefix(entry, ">") {
			t.Fatalf("entry kept its markup: %q", entry)
		}
	}
	pool := strings.Join(ClueStrategies(), "\n")
	for _, want := range []string{"二次联想", "多层抽象", "借形换靶", "反义侧写", "拟声"} {
		if !strings.Contains(pool, want) {
			t.Fatalf("rotation pool is missing %q", want)
		}
	}
	for _, humanOnly := range []string{"讨论噪音", "赛后复盘", "第四词烟雾", "假表养殖"} {
		if strings.Contains(pool, humanOnly) {
			t.Fatalf("human-only strategy %q is in the rotation", humanOnly)
		}
	}
}

// Green leads; every third draw takes the next yellow one, marked so the
// model reads the caution with it.
func TestDrawStrategyRotatesAndMarksYellow(t *testing.T) {
	seen := map[string]bool{}
	for n := uint64(1); n <= 6; n++ {
		s := DrawStrategy(n)
		if seen[s] {
			t.Fatalf("strategy repeated within six draws: %q", s)
		}
		seen[s] = true
		if (n%3 == 0) != strings.Contains(s, "黄色策略") {
			t.Fatalf("draw %d has the wrong tier: %q", n, s)
		}
	}
}
