package handlers

import (
	"context"
	"fmt"

	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/fronts/qq_bot/message"
	"github.com/tencent-connect/botgo/dto"
	"github.com/tencent-connect/botgo/openapi"
)

// 发送消息
// 注意，由于 qq 限制了 qq 机器的主动消息，因此这里所有的消息应该是被动消息
// 所以需要传入 originMessage 参数来确定需要恢复的消息
func SendMessage(api openapi.OpenAPI, channelId string, originMessage *dto.WSATMessageData, msg string) {
	api.PostMessage(context.Background(), channelId, &dto.MessageToCreate{
		Content: msg,
		MsgID:   originMessage.ID,
	})
}

// 创建游戏房间
func createPrivateGameRoom(api openapi.OpenAPI, atMessage *dto.WSATMessageData, users []*dto.User, host *dto.User) (*dto.Channel, error) {
	userIds := make([]string, 0, len(users))

	for _, user := range users {
		userIds = append(userIds, user.ID)
	}

	return api.PostChannel(context.Background(), atMessage.GuildID, &dto.ChannelValueObject{
		Name:           fmt.Sprintf(message.GAME_NAME, message.RandomEmoji(), host.Username),
		Type:           dto.ChannelTypeText,
		ParentID:       atMessage.ChannelID,
		PrivateType:    dto.ChannelPrivateTypeAdminAndMember,
		PrivateUserIDs: userIds,
		OwnerID:        host.ID,
	})

}

// 发送帮助信息
func help(api openapi.OpenAPI, data *dto.WSATMessageData) {

	if BOT_NAME == "" {
		LOCK.Lock()
		if BOT_NAME == "" {
			if me, err := api.Me(context.Background()); err == nil {
				BOT_NAME = me.Username
			}
			LOCK.Unlock()
		}
	}
	SendMessage(api, data.ChannelID, data, fmt.Sprintf(message.HELP_MSG, BOT_NAME))
}
