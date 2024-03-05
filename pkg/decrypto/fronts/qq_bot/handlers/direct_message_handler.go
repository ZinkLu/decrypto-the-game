package handlers

import (
	"fmt"
	"strings"

	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/fronts/qq_bot/message"
	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/fronts/qq_bot/service"
	"github.com/tencent-connect/botgo/dto"
	"github.com/tencent-connect/botgo/event"
	"github.com/tencent-connect/botgo/openapi"
)

// dm 信息，只处理处于游戏之中的玩家，回复状态信息
func GetDirectMessageHandler(api openapi.OpenAPI) event.DirectMessageEventHandler {
	return func(event *dto.WSPayload, data *dto.WSDirectMessageData) error {
		session := service.GetGameSessionByUser(data.Author.ID)
		if session != nil {
			// 处理信息
			if strings.Contains(data.Content, message.PLAIN_WORDS) {
				team := session.GetUserTeam(data.Author.ID)
				SendDirectMessage(api, data.Author.ID, data, message.GetTeamStatusMessage(team))
			} else if strings.Contains(data.Content, message.GAME_PROCESS) {
				SendDirectMessage(api, data.Author.ID, data, message.GetGameStatusMessage(session))
			} else if strings.Contains(data.Content, message.SECRET_CODES) {
				if session.GetCurrentRound().EncryptPlayer().Uid == data.Author.ID {
					words := session.GetCurrentRound().GetSecretWords()
					secretString := make([]string, 0, 3)
					for _, d := range session.GetCurrentRound().GetSecretDigits() {
						secretString = append(secretString, message.GetEmojiDigits(d))
					}

					SendDirectMessage(
						api,
						data.ChannelID,
						data,
						fmt.Sprintf(
							message.READY_TO_ENCRYPT_MESSAGE,
							strings.Join(secretString, " "),
							strings.Join(words[:], ","),
						))
				} else {
					SendDirectMessage(
						api,
						data.ChannelID,
						data,
						message.NO_ENCRYPTING_MESSAGE,
					)
				}
			} else if strings.Contains(data.Content, message.SELF_ENCRYPTION_HISTORY) {
				SendDirectMessage(api, data.Author.ID, data, message.GetSelfEncryptionHistory(session, data.Author.ID))
			} else if strings.Contains(data.Content, message.OPPONENT_ENCRYPTION_HISTORY) {
				SendDirectMessage(api, data.Author.ID, data, message.GetOpponentEncryptionHistory(session, data.Author.ID))
			} else {
				SendDirectMessage(api, data.Author.ID, data, message.STATUS_HELP_MESSAGE)
			}

			sendInGameMessageToBroker(session, data)
			return nil
		}

		SendDirectMessage(api, data.Author.ID, data, message.HELP_MSG)

		return nil
	}
}
