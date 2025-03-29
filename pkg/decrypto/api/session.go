package api

import (
	"fmt"
	"math/rand"
)

var SECRET_CODES = [24][3]int{
	{1, 2, 3},
	{1, 2, 4},
	{1, 3, 2},
	{1, 3, 4},
	{1, 4, 2},
	{1, 4, 3},
	{2, 1, 3},
	{2, 1, 4},
	{2, 3, 1},
	{2, 3, 4},
	{2, 4, 1},
	{2, 4, 3},
	{3, 1, 2},
	{3, 1, 4},
	{3, 2, 1},
	{3, 2, 4},
	{3, 4, 1},
	{3, 4, 2},
	{4, 1, 2},
	{4, 1, 3},
	{4, 2, 1},
	{4, 2, 3},
	{4, 3, 1},
	{4, 3, 2},
}

const MAX_ROUND = 16

// 代表一场 decrypto 游戏对局
type Session struct {
	teams        [2]*Team // decrypto 一共只有两支队伍
	currentRound *Round   // 当前轮数
	rounds       []*Round // 轮次记录
	sessionId    string   // 游戏 id，一般来说可以使用 Bot 收到的 messageId 来填写
	maxRounds    uint8    // 最大轮数，一般来说是 8*2 轮游戏（没个队伍都会加解密 8次）
}

// 自动组队并开始一场对局
func NewWithAutoTeamUp(sessionId string, players []*Player) (*Session, error) {
	if len(players) < 4 {
		return nil, fmt.Errorf("必须要 4 人才能开始游戏")
	}

	rand.Shuffle(len(players), func(i, j int) {
		players[i], players[j] = players[j], players[i]
	})

	splitter := len(players) / 2

	teamA, _ := newTeam(players[:splitter])
	teamB, _ := newTeam(players[splitter:])

	return &Session{sessionId: sessionId, maxRounds: MAX_ROUND, teams: [2]*Team{teamA, teamB}}, nil
}

// 自选队伍并开始一场对局
func NewWithTeams(sessionId string, teamAPlayers []*Player, teamBPlayers []*Player) (*Session, error) {
	if len(teamAPlayers) < 2 || len(teamBPlayers) < 2 {
		return nil, fmt.Errorf("每一队人数不得少于 2 人")
	}
	// 将队伍分成两组
	teamA, err := newTeam(teamAPlayers)
	if err != nil {
		return nil, err
	}

	teamB, err := newTeam(teamBPlayers)
	if err != nil {
		return nil, err
	}
	return &Session{sessionId: sessionId, maxRounds: MAX_ROUND, teams: [2]*Team{teamA, teamB}}, nil
}
