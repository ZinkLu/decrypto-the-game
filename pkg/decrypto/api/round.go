package api

import (
	"fmt"
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
	SELECT_ENCRYPTER TeamState = iota // 选择加密者
	ENCRYPTING                        // 给描述（加密）
	OPPONENT_DECRYPT                  // 对方破解
	DECRYPT                           // 我方破解
)

/*
用来表示当前的轮次；

Round 代表一个大轮次，包含了两队的小轮次，当两队小轮次进行完毕，则认为本轮结束，计算分数
*/
type Round struct {
	gameSession   *Session // 本局游戏信息
	PreviousRound *Round   // 上轮轮次对象
	teams         [2]*Team // 永远将第一只 team 看做 white，第二支 team 看做 black

	State                    TeamState // 当前的队伍的回合阶段
	CurrentTeam              *Team     // 当前是哪个队伍的回合
	RoundN                   uint8     // 第几轮
	TeamWhiteSecret          [3]int    // 白队伍密码
	TeamBlackSecret          [3]int    // 黑队密码
	TeamWhiteWords           [3]string // 白队描述
	TeamBlackWords           [3]string // 黑队描述
	TeamWhiteDecrytingSecret [3]int    // 白队截获的密码
	TeamBlackDecrytingSecret [3]int    // 黑队截获的密码
	TeamWhiteReceivingSecret [3]int    // 白队解密的自己的密码
	TeamBlackReceivingSecret [3]int    // 黑队解密的自己的密码
	TeamWhiteDecrypter       *Player   // 本轮白队加密人员，他不允许参与解密自己队伍的密码
	TeamBlackDecrypter       *Player   // 本轮黑队加密人员，他不允许参与解密自己队伍的密码
}

// 是否是最后一轮游戏
func (round *Round) IsFinalRound() bool {
	return round.RoundN == round.gameSession.maxRounds
}

// 开始新的轮次
func StartRound(gameSession *Session) (*Round, error) {

	if gameSession.CurrentRound != nil && gameSession.maxRounds == gameSession.CurrentRound.RoundN {
		return nil, fmt.Errorf("%s", "game session has reach to max rounds")
	}
	return nil, nil
}
