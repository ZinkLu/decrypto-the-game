package message

import (
	"fmt"
	"strings"

	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/api"
)

const PLAIN_WORDS = "词组"
const GAME_PROCESS = "进度"
const SECRET_CODES = "密码"

const STATUS_HELP_MESSAGE = `您当前正在对局中，请回复
	` + PLAIN_WORDS + `: 查看您队伍的词组信息
	` + GAME_PROCESS + `: 查看游戏进度与历史
如果您是当前加密者，请回复
	` + SECRET_CODES + `: 来查看您本局需要加密的密码
`

const TEAM_STATUS_MESSAGE_TEMPLATE = `🍎 您的` + PLAIN_WORDS + `为: %v
⭕️您的队伍已经成功拦截了 %d 次
❌您的队伍已经失败解密了 %d 次
`

func GetTeamStatusMessage(team *api.Team) string {
	return fmt.Sprintf(TEAM_STATUS_MESSAGE_TEMPLATE, team.Words, team.InspectedCounts, team.DecryptWrongCounts)
}

const GAME_STATUS_MESSAGE_TEMPLATE = `当前第 %d 轮次
%s
`

func GetGameStatusMessage(session *api.Session) string {
	var sb strings.Builder
	for {
		previous := session.CurrentRound.PreviousRound
		if previous == nil {
			break
		}
		sb.WriteString(getRoundInfo(previous))
	}
	roundMsg := sb.String()
	if roundMsg == "" {
		roundMsg = "还没有轮次信息"
	}
	return fmt.Sprintf(GAME_STATUS_MESSAGE_TEMPLATE, session.CurrentRound.RoundN, roundMsg)
}

func getRoundInfo(r *api.Round) string {
	var conclusion string

	if r.CurrentTeam.IsInspected() {
		conclusion = "😎 破译成功"
	} else if !r.CurrentTeam.IsDecryptedCorrect() {
		conclusion = "🙃 解密失败"
	}

	return fmt.Sprintf(
		`第%d轮	加密者:%s	加密词:%v	正确密码:%v	拦截密码:%v	破译密码:%v %s`,
		r.RoundN,
		r.CurrentTeam.EncryptPlayer().NickName,
		r.CurrentTeam.GetSecretWords(),
		r.CurrentTeam.GetSecretDigits(),
		r.CurrentTeam.GetDecryptSecret(),
		r.CurrentTeam.GetSecretWords(),
		conclusion,
	)
}
