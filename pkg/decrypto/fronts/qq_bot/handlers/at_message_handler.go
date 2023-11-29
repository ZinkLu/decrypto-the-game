package handlers

import (
	"context"
	"errors"
	"log"
	"strings"
	"sync"

	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/fronts/qq_bot/message"
	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/fronts/qq_bot/service"
	"github.com/tencent-connect/botgo/dto"
	"github.com/tencent-connect/botgo/event"
	"github.com/tencent-connect/botgo/openapi"
)

var BOT_NAME string
var LOCK = sync.Mutex{}

func GetAtMessageHandler(api openapi.OpenAPI) event.ATMessageEventHandler {
	var atMessageHandler event.ATMessageEventHandler = func(event *dto.WSPayload, data *dto.WSATMessageData) error {
		return handle(api, data)
	}
	return atMessageHandler
}

func handle(api openapi.OpenAPI, data *dto.WSATMessageData) error {
	if strings.Contains(data.Content, message.GAME_START_CMD) {
		return gameStart(api, data)
	} else if strings.Contains(data.Content, message.GAME_STATUS_CMD) {
		// help(api, event, data)
	} else if strings.Contains(data.Content, message.GAME_END_CMD) {
		return gameOver(api, data)
	} else if strings.Contains(data.Content, message.CLOSE_ROOM_CMD) {
		return closeRoom(api, data)
	} else {
		help(api, data)
	}

	return nil
}

// 开始游戏
func gameStart(api openapi.OpenAPI, data *dto.WSATMessageData) error {
	// TODO: 限制只能在游戏大厅开始游戏?
	host := data.Author.ID
	users := []*dto.User{data.Author}
	exists := map[string]bool{}
	exists[host] = true

	for _, u := range data.Mentions {
		if u.Bot {
			continue
		}
		_, ok := exists[u.ID]
		if !ok {
			// 确保用户不重复
			users = append(users, u)
			exists[u.ID] = true
		}
	}

	// TODO: DEBUG 模式，将同一个用户添加四次作为玩家
	user := users[0]
	users = []*dto.User{
		user,
		user,
		user,
		user,
	}

	if len(users)%2 != 0 ||
		len(users) < 4 ||
		len(users) > 8 {
		help(api, data)
	} else {
		if gameChannel, err := createPrivateGameRoom(api, data, users, users[0]); err == nil {
			if session, err := service.StartGameSession(users, gameChannel.ID); err == nil {
				// 发送开始信息
				SendMessage(api, gameChannel.ID, data, message.GetGameStartMessage(session))
			} else {
				log.Printf("创建对局失败, error is %s", err)
				SendMessage(api, data.ChannelID, data, message.CANT_CREATE_GAME_SESSION)
				// 删除房间
				api.DeleteChannel(context.Background(), gameChannel.ID)
				return err
			}
		} else {
			// 发送错误信息
			log.Printf("房间创建失败, error is %s", err)
			SendMessage(api, data.ChannelID, data, message.CANT_CREATE_PRIVATE_ROOM)
			return err
		}
	}
	return nil
}

func gameOver(api openapi.OpenAPI, data *dto.WSATMessageData) error {
	channelId := data.ChannelID
	if session := service.GetGameSessionByChannel(channelId); session != nil {
		// 删除 session
		service.EndGameSessionByChannel(channelId)

		// 发送游戏结束信息
		SendMessage(api, channelId, data, message.GAME_END_MSG)

		return nil
	} else {
		SendMessage(api, data.ChannelID, data, message.CANT_FOUNT_GAME_IN_THREAD)
		return errors.New(message.CANT_FOUNT_GAME_IN_THREAD)
	}
}
