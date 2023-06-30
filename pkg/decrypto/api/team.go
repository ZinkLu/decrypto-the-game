package api

import (
	"fmt"
)

type Team struct {
	Players []*Player // 一般来说一支队伍的Player的数量应该控制在 2 - 4 人
}

func newTeam(players []*Player) (*Team, error) {
	if 2 < len(players) && len(players) > 4 {
		return nil, fmt.Errorf("%s", "A Team Can Only Be Take 2 - 4 Player")
	}

	return &Team{Players: players}, nil
}
