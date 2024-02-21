package handlers

import (
	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/fronts/qq_bot/message"
	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/fronts/qq_bot/service"
	"github.com/tencent-connect/botgo/dto"
	"github.com/tencent-connect/botgo/event"
	"github.com/tencent-connect/botgo/openapi"
)

// dm 信息，只处理处于游戏之中的玩家，回复对决状态信息
func GetDirectMessageHandler(api openapi.OpenAPI) event.DirectMessageEventHandler {
	return func(event *dto.WSPayload, data *dto.WSDirectMessageData) error {
		session := service.GetGameSessionByUser(data.Author.ID)
		if session != nil {
			// 处理信息
			switch data.Content {
			default:
				SendDirectMessage(api, data.Author.ID, data, message.STATUS_HELP_MESSAGE)
			}

		}

		SendDirectMessage(api, data.Author.ID, data, message.HELP_MSG)

		return nil
	}
}
