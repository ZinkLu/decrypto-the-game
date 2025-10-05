```golang
package message

const CANT_FOUNT_GAME_IN_THREAD = `如果需要结束游戏，必须在正在游戏的房间@我 ~`
const CANT_CREATE_PRIVATE_ROOM = `无法游戏创建房间，需要查看日志进行进一步排查`
const CANT_CREATE_GAME_SESSION = `无法创建本局游戏，请查看日志`
const CANT_CREATE_GAME_SESSION_IN_GAME_ROOM = `你无法在游戏房间开始游戏，去游戏大厅 @我 吧`
const HAS_GAME_IN_ROOM = `本房间正在进行一场对局，你还无法将它关闭哦`
const NOT_A_GAME_ROOM = `本房间不是一个对局房间，无法关闭，请手动关闭`
const ROOM_IN_DELETING = `本房间已经被关闭了，马上就好`

package message

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"strings"

	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/api"
)

// some command
const GAME_START_CMD = "开始游戏"
const GAME_STATUS_CMD = "游戏状态"
const GAME_END_CMD = "结束游戏"
const CLOSE_ROOM_CMD = "关闭房间"

// some message

const HELP_MSG = `如果要开始游戏，请在游戏大厅 @ 三个以上的玩家后再 @ 我并说 “开始游戏”，比如

'@小红 @小明 @%s /开始游戏'

🚨注意！
参与的人数必须是 4个，6个 或者 8 个人哦！（包括发送消息的人）
`

const GAME_NAME = "%s <%s> 的对决"

var game_logo = [13]string{
	"🖲️",
	"🕹️",
	"💾",
	"💽",
	"🖨️",
	"📟",
	"☎️",
	"📺",
	"📻",
	"📠",
	"📡",
	"📢",
	"📣",
}

func RandomEmoji() string {
	randomIndex, _ := rand.Int(rand.Reader, big.NewInt(int64(len(game_logo))))
	return game_logo[randomIndex.Int64()]
}

const GAME_START_MSG = `%s 游戏开始！
当前队伍
队伍A: %s
队伍B: %s
`

func GetGameStartMessage(session *api.Session) string {
	teams := session.GetTeams()
	var teamANames = make([]string, 0, len(teams[0].Players))
	var teamBNames = make([]string, 0, len(teams[1].Players))
	for _, player := range teams[0].Players {
		teamANames = append(teamANames, GetAtPlayerString(player))
	}
	for _, player := range teams[1].Players {
		teamBNames = append(teamBNames, GetAtPlayerString(player))
	}

	return fmt.Sprintf(GAME_START_MSG, RandomEmoji(), strings.Join(teamANames, ","), strings.Join(teamBNames, ","))
}

const GAME_END_MSG = `游戏已结束，下次再见喽~`
const CLOSE_ROOM_MSG = `房间将在 10 秒后自动关闭，下次见~`
const GAME_ROOMS_LINK_MSG = `房间已经为你们准备好了哦，速速进：👇
<#%s>`

// 获取 qq 允许的 @ 字符串，这些字符串会在聊天栏中被高亮
func GetAtPlayerString(p *api.Player) string {
	return "<@!" + p.Uid + ">"
}

package message

const GENERAL_WRONG_PLAYER_MESSAGE = `当前应该由 %v 给出信息，其他人请勿 @ 我`

// IN GAME MESSAGE
const REPLY_WRONG_WORDS_FORMAT_MESSAGE = `请输入三组文字，以空格分割。比如
空气 夏天 红色`

const REPLY_WRONG_DIGITS_FORMAT_MESSAGE = `请输入三个数字作为拦截的密码（1-4之间），以空格分割。比如
1 2 3`

const START_ENCRYPT_MESSAGE = `📠 开始加密，请 %s 玩家开始进行加密~

（加密者私信我并回复 <` + SECRET_CODES + `> 来获取本轮要加密的数字）
（其他人可以回复 <` + PLAIN_WORDS + `> 来查看本局的词语）`
const START_INTERCEPT_MESSAGE = `🛑 开始拦截，请 %v 中的任意玩家 @ 我并给出拦截的密码，以空格分割`
const START_DECRYPT_MESSAGE = `🔐 开始解密，请 %v 中的任意玩家 @ 我并给出解密的密码，以空格分割`
const SKIP_INTERCEPT_MESSAGE = `第一轮跳过拦截阶段`

const READY_TO_ENCRYPT_MESSAGE = `📞 本轮中:
	🔢 你需要加密的数字为 %s
	🖨️ 对应的密文为 %s
现在，将加密后的密文发送到公屏中（记得先 @ 我再发送）
`

const NO_ENCRYPTING_MESSAGE = `您本轮不负责加密`

const ENCRYPT_SUCCESS_MESSAGE = `🔒 加密成功
当前的密文为:
	%s 
	%s
	%s
`

const INTERCEPT_DONE_MESSAGE = `🛑 收到拦截密码
拦截的密码为: %s %s %s`

const DECRYPT_DONE_MESSAGE = `🔑 收到解密密码
解密的密码为: %s %s %s`

const INTERCEPT_SUCCESS_MESSAGE = `🔍 密码破解成功！！跳过解密环节！`
const INTERCEPT_FAIL_MESSAGE = `💾 密码破解失败！请进行解密！`

const DECRYPT_SUCCESS_MESSAGE = `🔓 解密成功！！`
const DECRYPT_FAIL_MESSAGE = `❌ 解密失败！！`

const ROUND_OVER_MESSAGE = `本轮结束！本轮数据如下：`

const GAME_OVER_MESSAGE = `本局结束，恭喜 %s 获得了胜利
对局详情如下：`

const GAME_OVER_WITH_MAX_ROUND = `达到游戏最大轮数，没有队伍胜利，现在参考历史消息来猜测对手的词组，祝你们好运🍀`
const CLOSE_GAME_SESSION_MANUALLY = `游戏已经结束，你可以随时@我来<结束游戏>并且<关闭房间>，在此之前，你可以私信我查看历史记录`

const SPLITTER = " "

func GetEmojiDigits(dig int) string {
	switch dig {
	case 1:
		return "1️⃣"
	case 2:
		return "2️⃣"
	case 3:
		return "3️⃣"
	case 4:
		return "4️⃣"
	default:
		return "0️⃣"
	}

}

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
```