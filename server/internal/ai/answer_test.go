package ai

import (
	"strings"
	"testing"
)

func TestParseGuess(t *testing.T) {
	for _, tc := range []struct {
		reply string
		want  int
	}{
		// the contract: one marked line
		{"答案：3", 3},
		{"答案:2", 2},
		{"答案 4", 4},
		{"答案是 1", 1},
		{"最终答案：3", 3},
		{"**答案：4**", 4},
		{"ANSWER: 2", 2},
		{"answer is 3", 3},
		{"答案：3。", 3},
		{"３", 3}, // full-width digit, bare
		// the bare digit, however wrapped
		{"3", 3},
		{" 3 ", 3},
		{"**3**", 3},
		{"「3」", 3},
		{"3。", 3},
		// reasoning around the answer
		{"历史里「灯塔」对应 1，但这条更像 2。\n答案：2", 2},
		{"我想明白了，答案是 3。", 3},
		{"推理很多……\n4", 4},
		{"2\n因为 1 已经被猜过。", 2},
		// the last marked line wins
		{"答案：2\n不对，再想想。\n答案：4", 4},
	} {
		got, err := parseGuess(tc.reply)
		if err != nil || got != tc.want {
			t.Errorf("parseGuess(%q) = %d, %v; want %d", tc.reply, got, err, tc.want)
		}
	}
}

func TestParseGuessRejects(t *testing.T) {
	for _, reply := range []string{
		"", "   ", "0", "5", "one", "1 or 2", "1、2、3",
		"答案：5", "答案：0", "我觉得都行", "这条线索很难判断",
	} {
		if n, err := parseGuess(reply); err == nil {
			t.Errorf("parseGuess(%q) accepted %d", reply, n)
		}
	}
}

func TestParseClue(t *testing.T) {
	for _, tc := range []struct {
		reply, want string
	}{
		// the contract: one marked line
		{"线索：灯塔", "灯塔"},
		{"线索: 灯塔", "灯塔"},
		{"线索：New York", "New York"},
		{"我的线索是：炊烟", "炊烟"},
		{"**线索：灯塔**", "灯塔"},
		{"线索：灯塔（夜晚的光）", "灯塔"},
		{"线索：灯塔。队友能想到光。", "灯塔"},
		// a bare word, however wrapped
		{"灯塔", "灯塔"},
		{" 灯塔 ", "灯塔"},
		{"「灯塔」", "灯塔"},
		{"\"灯塔\"", "灯塔"},
		{"灯塔。", "灯塔"},
		// reasoning around the answer
		{"想了一下，换这个角度。\n线索：病人", "病人"},
		{"线索：炊烟\n希望队友能想到家。", "炊烟"},
		// a long reply still yields the marked line
		{"我考虑了对方的对应表，「玻璃」这个角度已经用过，换一个新的联想。\n线索：窗户", "窗户"},
	} {
		got, err := parseClue(tc.reply)
		if err != nil || got != tc.want {
			t.Errorf("parseClue(%q) = %q, %v; want %q", tc.reply, got, err, tc.want)
		}
	}
}

func TestParseClueRejects(t *testing.T) {
	for _, reply := range []string{
		"", "   ", `""`, "\"   \"", "线索：", "\n\n",
		strings.Repeat("长", maxClueRunes+1),
	} {
		if clue, err := parseClue(reply); err == nil {
			t.Errorf("parseClue(%q) accepted %q", reply, clue)
		}
	}
	// A prose line under the length bound is still read as a last-resort
	// clue; only when every line is over-long is there nothing to accept.
	long := strings.Repeat("这句话太长了不可能是线索词", 10)
	if clue, err := parseClue(long + "\n" + long); err == nil {
		t.Errorf("parseClue accepted over-long prose %q", clue)
	}
}
