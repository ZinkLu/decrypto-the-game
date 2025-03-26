package message

import (
	"fmt"
	"strings"

	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/api"
)

const PLAIN_WORDS = "机密"
const GAME_PROCESS = "进度"
const SECRET_CODES = "密码"
const SELF_ENCRYPTION_HISTORY = "我方"
const OPPONENT_ENCRYPTION_HISTORY = "对方"
const SPLITTER = " "

const STATUS_HELP_MESSAGE = `🎮 游戏进行中~ 回复以下关键词:
	💫 [` + PLAIN_WORDS + `]: 查看你队伍的机密
	🔄 [` + GAME_PROCESS + `]: 查看游戏进度+历史
	🤙 [` + SELF_ENCRYPTION_HISTORY + `]: 我方已用加密词
	👀 [` + OPPONENT_ENCRYPTION_HISTORY + `]: 偷窥对方已用加密词

当前轮到你来当加密官？回复:
	🔐 [` + SECRET_CODES + `]: 查看本局的密码
`

func GetTeamStatusMessage(team *api.Team) string {

	return TeamStatusTemplate.FormatTemplate(
		map[string]any{
			"Words":              team.Words,
			"InterceptedCounts":  team.InterceptedCounts,
			"DecryptWrongCounts": team.DecryptWrongCounts,
		},
	)

}

// TODO: 调研一下能否使用折叠 msg
const GAME_STATUS_MESSAGE_TEMPLATE = `当前第 %d 轮次，以下是对战历史:
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
	return GameRoundInfoTempalte.FormatTemplate(r)
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
