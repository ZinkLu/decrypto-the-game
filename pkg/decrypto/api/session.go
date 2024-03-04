package api

import (
	"context"
	"fmt"
	"math/rand"
)

var secret_codes = [24][3]int{
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

// 代表一场 decrypto 游戏对局
type Session struct {
	Teams        [2]*Team // decrypto 一共只有两支队伍
	CurrentRound *Round   // 当前轮数
	Rounds       []*Round // 轮次记录
	sessionId    string   // 游戏 id，一般来说可以使用 Bot 收到的 messageId 来填写
	maxRounds    uint8    // 最大轮数，一般来说是 8 轮游戏
}

// 自动组队并开始一场对局
func NewWithAutoTeamUp(sessionId string, players []*Player) (*Session, error) {
	if len(players) < 4 {
		return nil, fmt.Errorf("必须要 4 人才能开始游戏")
	}

	rand.Shuffle(len(players), func(i, j int) {
		players[i], players[j] = players[j], players[i]
	})

	spliter := len(players) / 2

	teamA, _ := newTeam(players[:spliter])
	teamB, _ := newTeam(players[spliter:])

	return &Session{sessionId: sessionId, maxRounds: 8, Teams: [2]*Team{teamA, teamB}}, nil
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
	return &Session{sessionId: sessionId, maxRounds: 8, Teams: [2]*Team{teamA, teamB}}, nil
}

// 开始新的轮次
// 第二个参数表示创建轮次是否成功
// 如果当前对局为最后一场则为 False
func (gameSession *Session) StartRound(ctx context.Context) (*Round, bool) {
	isOver, t := gameSession.IsGameOver()
	if isOver {
		if gamerOverHandler != nil {
			gamerOverHandler(ctx, gameSession, t)
		}
		return nil, false
	}
	if gameSession.CurrentRound != nil && gameSession.CurrentRound.isFinalRound() {
		return nil, false
	}
	return createNewRound(gameSession), true
}

// 如果游戏结束，则返回 true 和 胜利的队伍;
// 否则返回 false 和 nil
// FIXME：在一轮结束后，存在一同胜利（或者失败）的情况，需要处理
func (s *Session) IsGameOver() (bool, *Team) {
	for idx, t := range s.Teams {
		if t.InterceptedCounts >= 2 {
			return true, t
		}

		if t.DecryptWrongCounts >= 2 {
			return true, s.Teams[1-idx]
		}
	}
	return false, nil
}

func (s *Session) AutoForward(ctx context.Context) {
	for round, canContinue := s.StartRound(ctx); canContinue; round, canContinue = s.StartRound(ctx) {
		isCanceled := round.AutoForward(ctx)
		if isCanceled {
			return
		}
	}
}

// 获取某玩家的队伍
func (s *Session) GetUserTeam(uid string) *Team {
	var target *Team
	for _, p := range s.Teams[0].Players {
		if p.Uid == uid {
			target = s.Teams[0]
			break
		}
	}

	if target != nil {
		return target
	}

	return s.Teams[1]
}
