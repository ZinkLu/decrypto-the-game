package qq_bot

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"

	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/api"
	"github.com/tencent-connect/botgo/dto"
	"github.com/tencent-connect/botgo/event"
	"github.com/tencent-connect/botgo/openapi"
)

var BOT_NAME string
var LOCK = sync.Mutex{}

func getAtMessageHandler(api openapi.OpenAPI) event.ATMessageEventHandler {
	var atMessageHandler event.ATMessageEventHandler = func(event *dto.WSPayload, data *dto.WSATMessageData) error {
		return handle(api, event, data)
	}
	return atMessageHandler
}

func handle(api openapi.OpenAPI, event *dto.WSPayload, data *dto.WSATMessageData) error {
	if strings.Contains(data.Content, game_start_command) {
		// 开始游戏
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
			help(api, event, data)
		} else {
			if _, err := startGameSession(api, users, event, data); err != nil {
				return err
			}
		}
	} else if strings.Contains(data.Content, game_status_command) {
		// 查询游戏状态
		// help(api, event, data)
	} else if strings.Contains(data.Content, game_end_command) {
		// 结束游戏
		// help(api, event, data)
	} else {
		help(api, event, data)
	}

	return nil
}

// 发送帮助信息
func help(api openapi.OpenAPI, event *dto.WSPayload, data *dto.WSATMessageData) {

	if BOT_NAME == "" {
		LOCK.Lock()
		if BOT_NAME == "" {
			if me, err := api.Me(context.Background()); err == nil {
				BOT_NAME = me.Username
			}
			LOCK.Unlock()
		}
	}
	sendMessage(api, data.ChannelID, data, fmt.Sprintf(help_msg, BOT_NAME))
}

// create a sub channel for playing
// channelId as sessionId
func startGameSession(client openapi.OpenAPI, players []*dto.User, event *dto.WSPayload, data *dto.WSATMessageData) (string, error) {
	// 约定第一名为房主
	var (
		host        *dto.User
		err         error
		session     *api.Session
		chanel      *dto.Channel
		gamePlayers []*api.Player
	)
	var userIds = make([]string, 0, len(players))

	// 判断所有的用户都在游戏中，如果有任何一名玩家在游戏中则无法开始游戏
	for _, u := range players {
		value := USER_GAME_POOL.get(u.ID)
		if value != nil {
			msg := fmt.Sprintf("玩家 %s 已经处在一场游戏中", u.Username)
			sendMessage(client, data.ChannelID, data, msg)
			err = errors.New(msg)
			goto ERROR
		}
		userIds = append(userIds, u.ID)
	}

	host = players[0]
	chanel, err = client.PostChannel(context.Background(), data.GuildID, &dto.ChannelValueObject{
		Name:           fmt.Sprintf(game_name, randomEmoji(), host.Username),
		Type:           dto.ChannelTypeText,
		ParentID:       data.ChannelID,
		PrivateType:    dto.ChannelPrivateTypeAdminAndMember,
		PrivateUserIDs: userIds,
		OwnerID:        host.ID,
	})
	if err != nil {
		goto ERROR
	}

	gamePlayers = make([]*api.Player, len(players))
	for idx, p := range players {
		gamePlayers[idx] = &api.Player{Uid: p.ID, NickName: p.Username}
	}

	session, err = api.NewWithAutoTeamUp(chanel.ID, gamePlayers)

	if err != nil {
		goto ERROR
	}

	err = CHAT_GAME_POOL.put(chanel.ID, session)
	for _, u := range userIds {
		USER_GAME_POOL.put(u, session)
	}

	if err != nil {
		goto ERROR
	}

	sendMessage(client, chanel.ID, data, getGameStartMessage(session))

	return chanel.ID, nil

ERROR:
	return "", err

}
