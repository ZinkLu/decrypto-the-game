package handlers

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/fronts/qq_bot/message"
	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/fronts/qq_bot/service"
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

// 用来维护所有由机器人开过的房间
var roomMap = make(map[string]bool)

// 创建游戏房间
func createPrivateGameRoom(api openapi.OpenAPI, atMessage *dto.WSATMessageData, users []*dto.User, host *dto.User) (*dto.Channel, error) {
	userIds := make([]string, 0, len(users))

	for _, user := range users {
		userIds = append(userIds, user.ID)
	}

	c, err := api.PostChannel(context.Background(), atMessage.GuildID, &dto.ChannelValueObject{
		Name:           fmt.Sprintf(message.GAME_NAME, message.RandomEmoji(), host.Username),
		Type:           dto.ChannelTypeText,
		ParentID:       atMessage.ChannelID,
		PrivateType:    dto.ChannelPrivateTypeAdminAndMember,
		PrivateUserIDs: userIds,
		OwnerID:        host.ID,
	})
	if err == nil {
		roomMap[c.ID] = false
	}
	return c, err

}

func isGameRoomMessage(data *dto.WSATMessageData) bool {
	channelId := data.ChannelID
	_, ok := roomMap[channelId]
	return ok
}

func closeRoom(api openapi.OpenAPI, data *dto.WSATMessageData) error {
	channelId := data.ChannelID
	closed, ok := roomMap[channelId]

	if !ok {
		SendMessage(api, channelId, data, message.NOT_A_GAME_ROOM)
		return errors.New(message.NOT_A_GAME_ROOM)
	}

	if closed {
		SendMessage(api, channelId, data, message.ROOM_IN_DELETING)
		return errors.New(message.ROOM_IN_DELETING)
	}

	if session := service.GetGameSessionByChannel(channelId); session != nil {
		SendMessage(api, channelId, data, message.HAS_GAME_IN_ROOM)
		return errors.New(message.HAS_GAME_IN_ROOM)
	} else {
		// 删除房间（需要延时 10 秒）
		roomMap[channelId] = true
		defer func() {
			time.Sleep(time.Second * 10)
			err := api.DeleteChannel(context.Background(), channelId)
			if err != nil {
				log.Printf("删除房间失败, error is %s", err)
			}
			delete(roomMap, channelId)
		}()

		SendMessage(api, data.ChannelID, data, message.CLOSE_ROOM_MSG)
		return nil
	}
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
