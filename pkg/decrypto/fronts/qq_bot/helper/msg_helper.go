package helper

import (
	"strings"

	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/api"
)

// 获取 qq 允许的 @ 字符串，这些字符串会在聊天栏中被高亮
func GetAtPlayerString(p *api.Player) string {
	return "<@!" + p.Uid + ">"
}

// 去除消息中的 `<@ BOT_ID>` 的部分 以及 信息前后多余的空格
func TrimBotInfoInMessageContent(content string, botId string) string {
	atMessage := `<@!` + botId + `>`
	return strings.TrimSpace(strings.ReplaceAll(content, atMessage, ""))
}
