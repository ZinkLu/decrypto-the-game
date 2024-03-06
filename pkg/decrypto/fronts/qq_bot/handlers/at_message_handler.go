package handlers

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/fronts/message"
	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/fronts/qq_bot/service"
	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/fronts/utils"
	"github.com/tencent-connect/botgo/dto"
	"github.com/tencent-connect/botgo/event"
	"github.com/tencent-connect/botgo/openapi"
)

func GetAtMessageHandler(api openapi.OpenAPI) event.ATMessageEventHandler {
	return func(event *dto.WSPayload, data *dto.WSATMessageData) error {
		return handle(api, data)
	}
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
		inGame(api, data)
	}

	return nil
}

// 开始游戏
func gameStart(api openapi.OpenAPI, data *dto.WSATMessageData) error {
	if isGameRoomMessage(data) {
		SendMessage(api, data.ChannelID, data, message.CANT_CREATE_GAME_SESSION_IN_GAME_ROOM)
		return errors.New(message.CANT_CREATE_GAME_SESSION_IN_GAME_ROOM)
	}
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
	// user := users[0]
	// users = []*dto.User{
	// 	user,
	// 	user,
	// 	user,
	// 	user,
	// }

	if len(users)%2 != 0 ||
		len(users) < 4 ||
		len(users) > 8 {
		help(api, data)
	} else {
		if gameChannel, err := createPrivateGameRoom(api, data, users, users[0]); err == nil {
			if session, ctx, err := service.StartGameSession(users, gameChannel.ID); err == nil {
				// 发送跳转信息
				SendMessage(api, data.ChannelID, data, fmt.Sprintf(message.GAME_ROOMS_LINK_MSG, gameChannel.ID))
				// 发送开始信息
				SendMessage(api, gameChannel.ID, data, message.GetGameStartMessage(session))
				go session.AutoForward(ctx)

				// 触发对局
				broker, err := service.GetGameBrokerBySession(session)
				if err != nil {
					return nil
				}

				broker <- data

			} else {
				utils.Log.Errorf("创建对局失败, error is %s", err)
				SendMessage(api, data.ChannelID, data, err.Error())
				// 删除房间
				api.DeleteChannel(context.Background(), gameChannel.ID)
				return err
			}
		} else {
			// 发送错误信息
			utils.Log.Errorf("房间创建失败, error is %s", err)
			SendMessage(api, data.ChannelID, data, message.CANT_CREATE_PRIVATE_ROOM)
			return err
		}
	}
	return nil
}

// 游戏结束
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

// 在游戏中?
func inGame(api openapi.OpenAPI, data *dto.WSATMessageData) error {
	// 不是游戏房间内的信息返回帮助信息
	if !isGameRoomMessage(data) {
		help(api, data)
		return nil
	}

	// 虽然在游戏房间内，但是非对局玩家发送的信息，给出不要捣乱的提示（目前不发送任何信息）；
	session := service.GetGameSessionByChannel(data.ChannelID)
	if session != service.GetGameSessionByUser(data.Author.ID) {
		// SendMessage(api, data.ChannelID, data, message.GAME_END_MSG)
		return nil
	}

	sendInGameMessageToBroker(session, data)

	return nil
}
