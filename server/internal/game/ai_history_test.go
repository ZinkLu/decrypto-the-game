package game

import (
	"strings"
	"testing"

	"github.com/ZinkLu/decrypto-the-game/server/internal/ws"
)

// The history an AI reads is relative to its own team: who encrypted, which
// clue turned out to point at which digit, and whether each guess hit.
func TestFormatHistoryRowsForAI(t *testing.T) {
	rows := []ws.RoundHistoryRow{
		{Round: 1, Team: "A", Clues: []string{"灯塔", "炊烟", "病人"}, Secret: []int{1, 3, 2}, Intercept: []int{0, 0, 0}, Decrypt: []int{1, 3, 4}},
		{Round: 2, Team: "B", Clues: []string{"铁", "糖", "影子"}, Secret: []int{2, 4, 1}, Intercept: []int{2, 4, 1}, Decrypt: []int{0, 0, 0}},
	}
	out := formatHistoryRowsForAI(rows, "A")
	for _, want := range []string{
		`第1回合（你方加密）：密码 [1 3 2]；线索 "灯塔"→1 "炊烟"→3 "病人"→2；你方解密 [1 3 4]（错）；对方拦截 无`,
		`第2回合（对方加密）：密码 [2 4 1]；线索 "铁"→2 "糖"→4 "影子"→1；对方解密 未作答（算错）；你方拦截 [2 4 1]（对）`,
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("history for team A is missing %q:\n%s", want, out)
		}
	}
	// The same rows read from the other seat swap 你方 and 对方.
	other := formatHistoryRowsForAI(rows, "B")
	if !strings.Contains(other, "第1回合（对方加密）") || !strings.Contains(other, "第2回合（你方加密）") {
		t.Fatalf("history for team B keeps team A's point of view:\n%s", other)
	}
	if got := formatHistoryRowsForAI(nil, "A"); got != "(还没有已揭晓的回合)" {
		t.Fatalf("empty history reads %q", got)
	}
}
