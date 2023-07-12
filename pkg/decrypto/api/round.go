package api

import (
	"fmt"
	"math/rand"
)

type TeamState uint

/*
定义本轮的状态，即要进行的顺序；

由于每大轮存在两小轮，且两组队伍执行的动作一样，这里只举一小轮为例子:

每一小轮（即当前队伍回合），都有以下阶段需要进行:

1. 确定本轮的加密者，并为加密者抽取密码;

2. 加密者给出 3 个描述;

3. 对方进行破解（第一轮掉过该阶段），破解成功，本小轮结束

4. 我方进行解密

因此有 8 个
*/
const (
	INIT             TeamState = iota // 准备状态
	ENCRYPTING                        // 给描述（加密）
	OPPONENT_DECRYPT                  // 对方破解
	DECRYPT                           // 我方破解
	DONE                              // 只有两个队伍都结束了，才会进入该状态
)

/*
用来表示当前的轮次；

Round 代表一个大轮次，包含了两队的小轮次，当两队小轮次进行完毕，则认为本轮结束，计算分数
*/
type Round struct {
	gameSession   *Session // 本局游戏信息
	PreviousRound *Round   // 上轮轮次对象
	teams         [2]*Team // 永远将第一只 team 看做 1，第二支 team 看做 2

	State                TeamState // 当前的队伍的回合阶段
	CurrentTeam          *Team     // 当前是哪个队伍的回合
	RoundN               uint8     // 第几轮
	Team1Secret          [3]int    // 1队伍密码
	Team2Secret          [3]int    // 2队密码
	Team1Words           [3]string // 1队描述
	Team2Words           [3]string // 2队描述
	Team1DecrytingSecret [3]int    // 1队截获的密码
	Team2DecrytingSecret [3]int    // 2队截获的密码
	Team1ReceivingSecret [3]int    // 1队解密的自己的密码
	Team2ReceivingSecret [3]int    // 2队解密的自己的密码
	Team1Decrypter       uint8     // 本轮1队加密人员，他不允许参与解密自己队伍的密码
	Team2Decrypter       uint8     // 本轮2队加密人员，他不允许参与解密自己队伍的密码
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
//
//		case ENCRYPTING:
//			fmt.Printf("请队伍 %v 的 %v 玩家给出加密词\n", team, round)
//			round.TeamWhiteDecrytingSecret = ...
//			round.TeamBlackWords = ...
//		}
//	}
//
// 或者使用 Register 方法，将 handler 进行注册，此时只需要调用
//
// AutoForward 的方法既可以进行完成对局
func (round *Round) Next() (*Team, TeamState) {
	var nextStep TeamState
	var nextTeam *Team = round.CurrentTeam
	switch round.State {
	case INIT:
		nextStep = ENCRYPTING
	case ENCRYPTING:
		nextStep = OPPONENT_DECRYPT
	case OPPONENT_DECRYPT:
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

func (round *Round) UpdateDecrypt() {

}

func (round *Round) AutoForward() {
	for team, state := round.Next(); state != DONE; team, state = round.Next() {
		switch state {
		case INIT:

		case ENCRYPTING:
			fmt.Printf("请队伍 %v 的 %v 玩家给出加密词\n", team, round)

		case OPPONENT_DECRYPT:
			fmt.Printf("")

		case DECRYPT:
			fmt.Printf("")
		}
	}
}

// 开始一轮新游戏
// 请调用 Session 对象的 StartRound 方法来
// 获取一个 Round 的对象
func createNewRound(session *Session) *Round {
	var roundN, whiteDecrypter, blackDecrypter uint8
	roundN = 1

	var teams [2]*Team

	copy(teams[:], session.Teams[:])

	if session.CurrentRound != nil {
		roundN = session.CurrentRound.RoundN

		previousWhiteDecrypter := session.CurrentRound.Team1Decrypter
		previousBlackDecrypter := session.CurrentRound.Team2Decrypter

		whiteDecrypter = (previousWhiteDecrypter + 1) % uint8(len(session.Teams[0].Players))
		blackDecrypter = (previousBlackDecrypter + 1) % uint8(len(session.Teams[1].Players))
		teams[0], teams[1] = session.CurrentRound.teams[1], session.CurrentRound.teams[0] // 如果有上局，则翻转两队
	}

	round := &Round{
		gameSession:    session,
		PreviousRound:  session.CurrentRound,
		teams:          teams,
		CurrentTeam:    teams[0],
		State:          INIT,
		RoundN:         roundN,
		Team1Secret:    secret_codes[rand.Intn(len(secret_codes))],
		Team2Secret:    secret_codes[rand.Intn(len(secret_codes))],
		Team1Decrypter: whiteDecrypter,
		Team2Decrypter: blackDecrypter,
	}

	session.CurrentRound = round
	session.Rounds = append(session.Rounds, round)
	return round
}
