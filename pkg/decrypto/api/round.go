package api

import (
	"context"
	"math/rand"
)

/*
用来表示当前的轮次；

Round 代表一个大轮次，包含了两队的小轮次，当两队小轮次进行完毕，则认为本轮结束，计算分数
*/
type Round struct {
	gameSession   *Session        // 本局游戏信息
	PreviousRound *Round          // 上轮轮次对象
	teams         [2]*RoundedTeam // 参加本局对战的队伍
	State         TeamState       // 当前的队伍的回合阶段
	CurrentTeam   *RoundedTeam    // 当前正在进行加密的队伍
	RoundN        uint8           // 第几轮
}

// 判断是否是最后一轮游戏
func (round *Round) isFinalRound() bool {
	return round.RoundN == round.gameSession.maxRounds
}

// 进行当前的队伍，当前阶段的操作;
// 如果这么做了，会将 Round 中的状态自动进行迁移至下一个状态，
// 同时返回下一个状态时正在操作的队伍和新的状态
//
// 如果为 Done 则表示本轮结束
//
// 作为调用方，应该关注每一状态的处理，比如:
//
//	for team, state := round.Next(); state != DONE; team, state = round.Next() {
//		switch state {
//		case INIT:
//		case ENCRYPTING:
//			...
//		}
//	}
//
// 或者使用 RegisterXXXHandler 方法，将 handler 进行注册，此时只需要调用
// AutoForward 的方法既可以进行完成对局
func (round *Round) Next() (*RoundedTeam, TeamState) {
	var nextStep TeamState
	var nextTeam *RoundedTeam = round.CurrentTeam
	switch round.State {
	case INIT:
		nextStep = ENCRYPTING
	case ENCRYPTING:
		nextStep = INTERCEPT
	case INTERCEPT:
		nextStep = DECRYPT
	case DECRYPT:
		if round.CurrentTeam == round.teams[0] {
			nextStep = INIT
			nextTeam = round.teams[1]
			round.CurrentTeam = round.teams[1]
		} else {
			nextTeam, nextStep = nil, DONE
		}
	}
	return nextTeam, nextStep
}

// 在注册 handler 后进行这个方法的注册
func (round *Round) AutoForward(c context.Context) {
	for team, state := round.Next(); state < DONE; team, state = round.Next() {
		switch state {
		case INIT:
			initHandler(c, round, INIT)
		case ENCRYPTING:
			eString := encryptHandler(c, round, team, team.encryptPlayer, ENCRYPTING)
			team.encryptedMessage = eString
		case INTERCEPT:
			opponent := team.Opponent()
			inspectedSecret := interceptHandler(c, round, opponent, INTERCEPT)
			inspected := opponent.SetInspectSecret(inspectedSecret)

			if inspected && interceptSuccessHandler != nil {
				interceptSuccessHandler(c, round, opponent, INTERCEPT)
			} else if !inspected && interceptFailHandler != nil {
				interceptFailHandler(c, round, opponent, INTERCEPT)
			}

		case DECRYPT:
			if team.Opponent().IsInspected() {
				return // 拦截成功的话直接跳过
			}

			decryptedSecret := decryptHandler(c, round, team, DECRYPT)

			success := team.SetDecryptedSecret(decryptedSecret)

			if success && decryptSuccessHandler != nil {
				decryptSuccessHandler(c, round, team, DECRYPT)
			} else if !success && decryptFailHandler != nil {
				decryptFailHandler(c, round, team, DECRYPT)
			}

		case DONE:
			doneHandler(c, round, DONE)
		}
	}
}

// 开始一轮新游戏
// 请调用 Session 对象的 StartRound 方法来
// 获取一个 Round 的对象
func createNewRound(session *Session) *Round {
	var roundN uint8 = 1
	var teams [2]*Team = [2]*Team{}
	var roundTeam [2]*RoundedTeam = [2]*RoundedTeam{}
	var teamsEncryptPlayerIndex [2]uint8 = [2]uint8{}

	copy(teams[:], session.Teams[:])

	if session.CurrentRound != nil {
		roundN = session.CurrentRound.RoundN + 1
		previousT1, previousT2 := session.CurrentRound.teams[0], session.CurrentRound.teams[1]

		// 交换两只队伍
		teams[0], teams[1] = previousT2.team, previousT1.team
		teamsEncryptPlayerIndex[0], teamsEncryptPlayerIndex[1] = previousT2.encryptPlayerIndex%uint8(len(previousT2.team.Players)), (previousT1.encryptPlayerIndex+1)%uint8(len(previousT2.team.Players))
	}

	round := &Round{}

	for idx, t := range teams {
		epi := teamsEncryptPlayerIndex[idx]
		roundTeam[idx] = &RoundedTeam{
			team:               t,
			round:              round,
			secret:             secret_codes[rand.Intn(len(secret_codes))],
			encryptPlayerIndex: epi,
			encryptPlayer:      t.Players[epi],
		}
	}
	round.gameSession = session
	round.PreviousRound = session.CurrentRound
	round.teams = roundTeam
	round.CurrentTeam = roundTeam[0]
	round.State = INIT
	round.RoundN = roundN

	session.CurrentRound = round
	session.Rounds = append(session.Rounds, round)
	return round
}
