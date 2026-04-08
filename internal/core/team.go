package core

import (
	"fmt"
)

type Team struct {
	Players            []*Player // 一般来说一支队伍的 Player 的数量应该控制在 2 - 4 人
	InterceptedCounts  uint8     // 队伍破解正确次数
	DecryptWrongCounts uint8     // 队伍猜错自己的次数
	Words              [4]string // 队伍抽到的词语
}

func (t *Team) InterceptedSuccess() {
	t.InterceptedCounts++
}

func (t *Team) DecryptFailed() {
	t.DecryptWrongCounts++
}

func newTeam(players []*Player) (*Team, error) {
	if 2 < len(players) && len(players) > 4 {
		return nil, fmt.Errorf("%s", "A Team Can Only Take 2 - 4 Player")
	}

	return &Team{Players: players, Words: wordProvider.Provide()}, nil
}

// Members returns the players in the team
func (t *Team) Members() []*Player {
	return t.Players
}

// TeamID returns a unique team identifier
func (t *Team) TeamID() string {
	if len(t.Players) > 0 {
		return t.Players[0].UID
	}
	return ""
}

// GetWords returns the team's words
func (t *Team) GetWords() [4]string {
	return t.Words
}
