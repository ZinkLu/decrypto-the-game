package qq_bot

import (
	"context"
	"fmt"
	"strings"

	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/api"
	"github.com/tencent-connect/botgo/dto"
	"github.com/tencent-connect/botgo/event"
	"github.com/tencent-connect/botgo/openapi"
)

func getAtMessageHandler(api openapi.OpenAPI) event.ATMessageEventHandler {
	var atMessageHandler event.ATMessageEventHandler = func(event *dto.WSPayload, data *dto.WSATMessageData) error {
		return handle(api, event, data)
	}
	return atMessageHandler
}

func handle(api openapi.OpenAPI, event *dto.WSPayload, data *dto.WSATMessageData) error {
	if strings.Contains(data.Content, game_start_command) {
		host := data.Author.ID
		userIds := []string{host}
		exists := map[string]bool{}
		exists[host] = true

		for _, u := range data.Mentions {
			if u.Bot {
				continue
			}
			_, ok := exists[u.ID]
			if !ok {
				userIds = append(userIds, u.ID)
				exists[u.ID] = true
			}
		}

		if len(userIds)%2 != 0 ||
			len(userIds) < 4 ||
			len(userIds) > 8 {
			help(api, event, data)
		} else {
			// start game session
			startGameSession(api, userIds, event, data)
		}
	} else if strings.Contains(data.Content, game_status_command) {
		help(api, event, data)
	} else {
		help(api, event, data)
	}

	return nil
}

// 发送
func help(api openapi.OpenAPI, event *dto.WSPayload, data *dto.WSATMessageData) {
	api.PostMessage(context.Background(), data.ChannelID, &dto.MessageToCreate{
		Content: help_msg,
	})
}

// create a sub channel for playing
// channelId as sessionId
func startGameSession(client openapi.OpenAPI, players []string, event *dto.WSPayload, data *dto.WSATMessageData) (string, error) {
	// 约定第一名为房主
	var (
		host        string
		err         error
		session     *api.Session
		chanel      *dto.Channel
		gamePlayers []*api.Player
	)

	host = players[0]
	chanel, err = client.PostChannel(context.Background(), data.GuildID, &dto.ChannelValueObject{
		Name:           fmt.Sprintf("<%s> 的截码战对局", host),
		Type:           dto.ChannelTypeText,
		ParentID:       data.ChannelID,
		PrivateType:    dto.ChannelPrivateTypeAdminAndMember,
		PrivateUserIDs: players,
		// OwnerID:        hotst,
	})
	if err != nil {
		goto ERROR
	}

	gamePlayers = make([]*api.Player, len(players))
	for idx, p := range players {
		gamePlayers[idx] = &api.Player{Uid: p}
	}

	session, err = api.NewWithAutoTeamUp(chanel.ID, gamePlayers)

	if err != nil {
		goto ERROR
	}

	err = game_pool.put(chanel.ID, session)

	if err != nil {
		goto ERROR
	}
	return chanel.ID, nil

ERROR:
	return "", err

}
