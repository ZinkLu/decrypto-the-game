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

const max_round = 16

// 代表一场 decrypto 游戏对局
type Session struct {
	Teams        [2]*Team // decrypto 一共只有两支队伍
	CurrentRound *Round   // 当前轮数
	Rounds       []*Round // 轮次记录
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

	return &Session{sessionId: sessionId, maxRounds: max_round, Teams: [2]*Team{teamA, teamB}}, nil
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
	return &Session{sessionId: sessionId, maxRounds: max_round, Teams: [2]*Team{teamA, teamB}}, nil
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
	return gameSession.createNewRound(), true
}

// 开始一轮新游戏
// 请调用 Session 对象的 StartRound 方法来
// 获取一个 Round 的对象
func (session *Session) createNewRound() *Round {
	var roundN uint8 = 1
	var currentTeam *Team = session.Teams[0]
	var opponent *Team = session.Teams[1]
	var teamsEncryptPlayerIndex uint8 = 0

	if session.CurrentRound != nil {
		roundN = session.CurrentRound.roundN + 1
		currentTeam = session.CurrentRound.opponent
		opponent = session.CurrentRound.currentTeam

		if roundN > 2 {
			// 交换加密的玩家
			// 当对局大于 2 时，都取上局该队伍行动的玩家后的以为玩家
			teamsEncryptPlayerIndex = (session.CurrentRound.previousRound.encryptPlayerIndex + 1) % uint8(len(currentTeam.Players))
		}
	}

	round := &Round{
		currentTeam:        currentTeam,
		secret:             secret_codes[rand.Intn(len(secret_codes))],
		encryptPlayerIndex: teamsEncryptPlayerIndex,
		encryptPlayer:      currentTeam.Players[teamsEncryptPlayerIndex],
		gameSession:        session,
		previousRound:      session.CurrentRound,
		opponent:           opponent,
		state:              NEW,
		roundN:             roundN,
	}

	session.CurrentRound = round
	session.Rounds = append(session.Rounds, round)
	return round
}

// 如果游戏结束，则返回 true 和 胜利的队伍;
// 否则返回 false 和 nil
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
