package message

import (
	"crypto/rand"
	"math/big"
)

// some command
const GAME_START_CMD = "开始游戏"
const GAME_STATUS_CMD = "游戏状态"
const GAME_END_CMD = "结束游戏"
const CLOSE_ROOM_CMD = "关闭房间"
const ROUND_OVER_MESSAGE = `本轮结束！本轮数据如下：`

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

// GetEmojiDigits 保持不变
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
