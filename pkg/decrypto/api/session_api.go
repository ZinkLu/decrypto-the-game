package api

import (
	"context"
	"math/rand"
)

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
	if gameSession.currentRound != nil && gameSession.currentRound.isFinalRound() {
		return nil, false
	}
	return gameSession.createNewRound(), true
}

// 开始一轮新游戏
// 请调用 Session 对象的 StartRound 方法来
// 获取一个 Round 的对象
func (session *Session) createNewRound() *Round {
	var roundN uint8 = 1
	var currentTeam *Team = session.teams[0]
	var opponent *Team = session.teams[1]
	var teamsEncryptPlayerIndex uint8 = 0

	if session.currentRound != nil {
		roundN = session.currentRound.roundN + 1
		currentTeam = session.currentRound.opponent
		opponent = session.currentRound.currentTeam

		if roundN > 2 {
			// 交换加密的玩家
			// 当对局大于 2 时，都取上局该队伍行动的玩家后的以为玩家
			teamsEncryptPlayerIndex = (session.currentRound.previousRound.encryptPlayerIndex + 1) % uint8(len(currentTeam.Players))
		}
	}

	round := &Round{
		currentTeam:        currentTeam,
		secret:             secret_codes[rand.Intn(len(secret_codes))],
		encryptPlayerIndex: teamsEncryptPlayerIndex,
		encryptPlayer:      currentTeam.Players[teamsEncryptPlayerIndex],
		gameSession:        session,
		previousRound:      session.currentRound,
		opponent:           opponent,
		state:              NEW,
		roundN:             roundN,
	}

	session.currentRound = round
	session.rounds = append(session.rounds, round)
	return round
}

// 如果游戏结束，则返回 true 和 胜利的队伍;
// 否则返回 false 和 nil
func (s *Session) IsGameOver() (bool, *Team) {
	for idx, t := range s.teams {
		if t.InterceptedCounts >= 2 {
			return true, t
		}

		if t.DecryptWrongCounts >= 2 {
			return true, s.teams[1-idx]
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
	for _, p := range s.teams[0].Players {
		if p.Uid == uid {
			target = s.teams[0]
			break
		}
	}

	if target != nil {
		return target
	}

	return s.teams[1]
}

/*
	========================== read-only properties ============================
*/

func (session *Session) GetCurrentRound() *Round { return session.currentRound }
func (session *Session) GetTeams() [2]*Team      { return session.teams }
func (session *Session) GetMaxRounds() uint8     { return session.maxRounds }
func (session *Session) GetSessionId() string    { return session.sessionId }
