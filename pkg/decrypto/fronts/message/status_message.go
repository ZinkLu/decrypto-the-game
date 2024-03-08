package message

import (
	"fmt"
	"strings"

	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/api"
)

const PLAIN_WORDS = "词组"
const GAME_PROCESS = "进度"
const SECRET_CODES = "密码"
const SELF_ENCRYPTION_HISTORY = "我方"
const OPPONENT_ENCRYPTION_HISTORY = "对方"

const STATUS_HELP_MESSAGE = `您当前正在对局中，请回复
	<` + PLAIN_WORDS + `>: 查看您队伍的词组信息
	<` + GAME_PROCESS + `>: 查看游戏进度与历史
	<` + SELF_ENCRYPTION_HISTORY + `>: 查看我方已使用的加密词
	<` + OPPONENT_ENCRYPTION_HISTORY + `>: 查看对方已使用的加密词
如果您是当前加密者，请回复
	<` + SECRET_CODES + `>: 来查看您本局需要加密的密码
`

const TEAM_STATUS_MESSAGE_TEMPLATE = `📖
您的` + PLAIN_WORDS + `为:
	%s

⭕️	 您的队伍已经成功拦截了 %d 次
❌	您的队伍已经失败解密了 %d 次
`

func GetTeamStatusMessage(team *api.Team) string {
	var sb = strings.Builder{}
	for idx, w := range team.Words {
		sb.WriteString(GetEmojiDigits(idx+1) + ": " + w)
		sb.WriteString("\n\t")
	}

	return fmt.Sprintf(TEAM_STATUS_MESSAGE_TEMPLATE, sb.String(), team.InterceptedCounts, team.DecryptWrongCounts)
}

const GAME_STATUS_MESSAGE_TEMPLATE = `当前第 %d 轮次
%s
`

func GetGameStatusMessage(session *api.Session) string {
	var sb strings.Builder

	for previous := session.GetCurrentRound().GetPreviousRound(); previous != nil; previous = previous.GetPreviousRound() {
		sb.WriteString(GetRoundInfo(previous))
		sb.WriteString("\n")
	}
	roundMsg := sb.String()
	if roundMsg == "" {
		roundMsg = "还没有轮次信息"
	}
	return fmt.Sprintf(GAME_STATUS_MESSAGE_TEMPLATE, session.GetCurrentRound().GetNumberOfRounds(), strings.TrimSpace(roundMsg))
}

func GetRoundInfo(r *api.Round) string {
	var conclusion string

	if r.IsInterceptSuccess() {
		conclusion = "😎 破译成功"
	} else if !r.IsDecryptedCorrect() {
		conclusion = "🙃 解密失败"
	} else {
		conclusion = "😗 解密成功"
	}

	result := fmt.Sprintf(`第%d轮
	加密者:%s
	加密词:%v
	正确密码:%v
	拦截密码:%v
	破译密码:%v
	%s`,
		r.GetNumberOfRounds(),
		r.EncryptPlayer().NickName,
		r.GetEncryptedMessage(),
		r.GetSecretDigits(),
		r.GetInterceptSecret(),
		r.GetDecryptSecret(),
		conclusion,
	)

	return result
}

// 获取我方加密历史，比如
// 红色: 血,温暖
// 蓝色: 海洋,天空
func GetSelfEncryptionHistory(session *api.Session, uid string) string {
	t := session.GetUserTeam(uid)
	history := [4][]string{
		make([]string, 0),
		make([]string, 0),
		make([]string, 0),
		make([]string, 0),
	}

	for round := session.GetCurrentRound().GetPreviousRound(); round != nil; round = round.GetPreviousRound() {
		if round.GetCurrentTeam() == t {
			for idx, d := range round.GetSecretDigits() {
				history[d-1] = append(history[d-1], round.GetEncryptedMessage()[idx])
			}
		}
	}

	var sb = strings.Builder{}

	for idx, h := range history {
		sb.WriteString(t.Words[idx] + ":")
		sb.WriteString("\n\t")
		sb.WriteString(strings.Join(h, ","))
		sb.WriteString("\n")
	}
	return strings.TrimSpace(sb.String())
}

// 获取对方加密历史，比如
// 1: 血,温暖
// 2: 海洋,天空
func GetOpponentEncryptionHistory(session *api.Session, uid string) string {
	t := session.GetUserTeam(uid)
	history := [4][]string{
		make([]string, 0),
		make([]string, 0),
		make([]string, 0),
		make([]string, 0),
	}

	for round := session.GetCurrentRound().GetPreviousRound(); round != nil; round = round.GetPreviousRound() {
		if round.GetCurrentTeam() != t {
			for idx, d := range round.GetSecretDigits() {
				history[d-1] = append(history[d-1], round.GetEncryptedMessage()[idx])
			}
		}
	}

	var sb = strings.Builder{}

	for idx, h := range history {
		sb.WriteString(fmt.Sprintf("%d:", idx+1))
		sb.WriteString("\n\t")
		sb.WriteString(strings.Join(h, ","))
		sb.WriteString("\n")
	}
	return strings.TrimSpace(sb.String())
}
