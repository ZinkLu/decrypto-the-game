package qq_bot

import (
	"context"

	"github.com/tencent-connect/botgo/dto"
	"github.com/tencent-connect/botgo/openapi"
)

// 发送消息
// 注意，由于 qq 限制了 qq 机器的主动消息，因此这里所有的消息应该是被动消息
// 所以需要传入 originMessage 参数来确定需要恢复的消息
func sendMessage(api openapi.OpenAPI, channelId string, originMessage *dto.WSATMessageData, msg string) {
	api.PostMessage(context.Background(), channelId, &dto.MessageToCreate{
		Content: msg,
		MsgID:   originMessage.ID,
	})
}
