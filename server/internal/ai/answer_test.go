package ai

import (
	"strings"
	"testing"
)

func TestParseGuessTriple(t *testing.T) {
	for _, tc := range []struct {
		reply string
		want  [3]int
	}{
		// the contract: three marked lines
		{"答案：1\n答案：2\n答案：3", [3]int{1, 2, 3}},
		{"答案:2\n答案：4\n答案: 1", [3]int{2, 4, 1}},
		{"答案 4\n答案 1\n答案 2", [3]int{4, 1, 2}},
		{"最终答案：3\n我的答案：1\n答案：2", [3]int{3, 1, 2}},
		{"**答案：4**\n**答案：2**\n**答案：1**", [3]int{4, 2, 1}},
		{"ANSWER: 2\nanswer is 3\nAnswer: 1", [3]int{2, 3, 1}},
		{"答案：３\n答案：１\n答案：４", [3]int{3, 1, 4}}, // full-width digits
		// reasoning around the answer lines
		{"历史里「灯塔」对应 1，但这条更像 2。\n答案：2\n答案：3\n答案：1", [3]int{2, 3, 1}},
		{"答案：1\n答案：2\n答案：4\n希望是对的。", [3]int{1, 2, 4}},
		// a corrected first attempt: the last three marked lines win
		{"答案：1\n答案：2\n答案：3\n不对，再想想。\n答案：4\n答案：2\n答案：1", [3]int{4, 2, 1}},
		// bare digit lines
		{"3\n1\n4", [3]int{3, 1, 4}},
		{"**3**\n「1」\n4。", [3]int{3, 1, 4}},
	} {
		got, err := parseGuessTriple(tc.reply)
		if err != nil || got != tc.want {
			t.Errorf("parseGuessTriple(%q) = %v, %v; want %v", tc.reply, got, err, tc.want)
		}
	}
}

func TestParseGuessTripleRejects(t *testing.T) {
	for _, reply := range []string{
		"", "   ", "one\ntwo\nthree", "我觉得都行",
		// fewer than three answers
		"答案：1\n答案：2", "3\n1",
		// digits out of range
		"答案：0\n答案：2\n答案：3", "答案：5\n答案：2\n答案：3",
		// the code never repeats a digit
		"答案：1\n答案：1\n答案：2", "3\n3\n1",
	} {
		if n, err := parseGuessTriple(reply); err == nil {
			t.Errorf("parseGuessTriple(%q) accepted %v", reply, n)
		}
	}
}

func TestParseClues(t *testing.T) {
	for _, tc := range []struct {
		reply string
		want  [3]string
	}{
		// the contract: three marked lines
		{"线索：灯塔\n线索：炊烟\n线索：病人", [3]string{"灯塔", "炊烟", "病人"}},
		{"线索: 灯塔\n线索:New York\n线索：病人", [3]string{"灯塔", "New York", "病人"}},
		{"我的线索是：炊烟\n**线索：灯塔**\n线索：风筝", [3]string{"炊烟", "灯塔", "风筝"}},
		{"线索：灯塔（夜晚的光）\n线索：炊烟。\n线索：病人", [3]string{"灯塔", "炊烟", "病人"}},
		// reasoning around the answer lines
		{"想了一下，换这个角度。\n线索：病人\n线索：炊烟\n线索：灯塔", [3]string{"病人", "炊烟", "灯塔"}},
		{"线索：病人\n线索：炊烟\n线索：灯塔\n希望队友能想到家。", [3]string{"病人", "炊烟", "灯塔"}},
		// a corrected first attempt: the last three marked lines win
		{"线索：甲\n线索：乙\n线索：丙\n不对。\n线索：灯塔\n线索：炊烟\n线索：病人", [3]string{"灯塔", "炊烟", "病人"}},
		// bare lines
		{"灯塔\n炊烟\n病人", [3]string{"灯塔", "炊烟", "病人"}},
		{"「灯塔」\n\"炊烟\"\n病人。", [3]string{"灯塔", "炊烟", "病人"}},
	} {
		got, err := parseClues(tc.reply)
		if err != nil || got != tc.want {
			t.Errorf("parseClues(%q) = %q, %v; want %q", tc.reply, got, err, tc.want)
		}
	}
}

func TestParseCluesRejects(t *testing.T) {
	for _, reply := range []string{
		"", "   ", "\n\n",
		// fewer than three answers
		"线索：灯塔", "线索：灯塔\n线索：炊烟", "灯塔\n炊烟",
		"线索：\n线索：炊烟\n线索：病人",
		// an over-long line is not a clue word
		"线索：" + strings.Repeat("长", maxClueRunes+1) + "\n线索：炊烟\n线索：病人",
	} {
		if clues, err := parseClues(reply); err == nil {
			t.Errorf("parseClues(%q) accepted %q", reply, clues)
		}
	}
}
