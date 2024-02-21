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

const HELP_MSG = `如果要开始游戏，请在游戏大厅 @ 四个以上的玩家后再 @ 我并说 “开始游戏”，比如

'@小红 @小明 @%s /开始游戏'

🚨注意！
参与的人数必须是大于 4 人 且小于 8 人的偶数哦！
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
队伍 A: %s
队伍 B: %s
当前 A 队伍正在行动 🥷

（请 **私信** 我来获取各个队伍的密文）
`

func GetGameStartMessage(session *api.Session) string {
	var teamANames = make([]string, 0, len(session.Teams[0].Players))
	var teamBNames = make([]string, 0, len(session.Teams[1].Players))
	for _, player := range session.Teams[0].Players {
		teamANames = append(teamANames, player.NickName)
	}
	for _, player := range session.Teams[1].Players {
		teamBNames = append(teamBNames, player.NickName)
	}

	return fmt.Sprintf(GAME_START_MSG, RandomEmoji(), strings.Join(teamANames, ","), strings.Join(teamBNames, ","))
}

const GAME_END_MSG = `你主动结束了游戏，下次再见喽~`
const CLOSE_ROOM_MSG = `房间将在 10 秒后自动关闭，下次见~`
const GAME_ROOMS_LINK_MSG = `房间已经为你们准备好了哦，速速进：👇 <#%s>`
