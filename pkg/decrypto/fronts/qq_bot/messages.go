package qq_bot

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"strings"

	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/api"
)

// some command
const game_start_command = "开始游戏"
const game_status_command = "游戏状态"
const game_end_command = "结束游戏"

// some message

const help_msg = `如果要开始游戏，请 @ 四个以上的玩家后再 @ 我并说 “开始游戏”，比如

'@小红 @小明 @%s /开始游戏'

🚨注意！
参与的人数必须是大于 4 人 且小于 8 人的偶数哦！
`

const game_name = "%s <%s> 的对决"

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

func randomEmoji() string {
	randomIndex, _ := rand.Int(rand.Reader, big.NewInt(int64(len(game_logo))))
	return game_logo[randomIndex.Int64()]
}

const game_start_msg = `%s 游戏开始！
当前队伍
队伍 A: %s
队伍 B: %s
当前 A 队伍正在行动 🥷
`

func getGameStartMessage(session *api.Session) string {
	var teamANames = make([]string, 0, len(session.Teams[0].Players))
	var teamBNames = make([]string, 0, len(session.Teams[1].Players))
	for _, player := range session.Teams[0].Players {
		teamANames = append(teamANames, player.NickName)
	}
	for _, player := range session.Teams[1].Players {
		teamBNames = append(teamBNames, player.NickName)
	}

	return fmt.Sprintf(game_start_msg, randomEmoji(), strings.Join(teamANames, ","), strings.Join(teamBNames, ","))
}
