package message

import (
	"crypto/rand"
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

	return GameStartTemplate.FormatTemplate(
		map[string]string{
			"BlueTeam": strings.Join(teamANames, ","),
			"RedTeam":  strings.Join(teamBNames, ","),
		},
	)
}

// 获取 qq 允许的 @ 字符串，这些字符串会在聊天栏中被高亮
func GetAtPlayerString(p *api.Player) string {
	return "<@!" + p.Uid + ">"
}
