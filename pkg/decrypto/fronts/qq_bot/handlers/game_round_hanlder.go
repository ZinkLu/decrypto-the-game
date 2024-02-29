package handlers

import (
	"context"
	"fmt"

	"strconv"
	"strings"

	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/api"
	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/fronts/qq_bot/message"
	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/fronts/qq_bot/service"
	"github.com/tencent-connect/botgo/dto"
	"github.com/tencent-connect/botgo/log"
	"github.com/tencent-connect/botgo/openapi"
)

func InitRoundHandler(client openapi.OpenAPI) {
	registerInitHandlers(client)
	registerEncryptHandlers(client)
	registerInterceptHandlers(client)
}

func registerInitHandlers(client openapi.OpenAPI) {
	api.RegisterInitHandler(

		// 发送开始本轮信息
		// 将密码私信发送给当前的加密者
		func(ctx context.Context, r *api.Round, ts api.TeamState) bool {
			for reply, isCancelled := getMessageOrDone(r, ctx); !isCancelled; reply, isCancelled = getMessageOrDone(r, ctx) {
				if msg, ok := reply.(*dto.WSATMessageData); ok {
					cId, _ := service.GetChannelIDByGameSession(r.GameSession)
					SendMessage(client, cId, msg, fmt.Sprintf(message.START_ENCRYPT_MESSAGE, r.CurrentTeam.EncryptPlayer().NickName))
					return false
				}
			}
			return true
		},
	)
}

func registerEncryptHandlers(client openapi.OpenAPI) {
	// 发送密码给当前加密者并且等待加密者进行加密
	api.RegisterEncryptHandler(

		func(ctx context.Context, r *api.Round, rt *api.RoundedTeam, p *api.Player, ts api.TeamState) ([3]string, bool) {
			result := [3]string{"", "", ""}

			// 解析加密者给出的密文是否满足特定需求，否则给出提示
			for reply, isCancelled := getMessageOrDone(r, ctx); !isCancelled; reply, isCancelled = getMessageOrDone(r, ctx) {
				if msg, ok := reply.(*dto.WSATMessageData); ok {

					if msg.Author.ID != rt.EncryptPlayer().Uid {
						SendMessage(
							client,
							msg.ChannelID,
							msg,
							fmt.Sprintf(message.GENERAL_WRONG_PLAYER_MESSAGE, rt.EncryptPlayer().NickName),
						)
						continue
					}

					atMessage := `<@!` + BOT_INFO.ID + `>`
					content := strings.ReplaceAll(msg.Content, atMessage, "")
					content = strings.TrimSpace(content)

					encryptoMessage := strings.Split(content, message.SPLITTER)
					if len(encryptoMessage) != 3 {
						SendMessage(client, msg.ChannelID, msg, message.REPLY_WRONG_WORDS_FORMAT_MESSAGE)
						continue
					}

					SendMessage(
						client,
						msg.ChannelID,
						msg,
						fmt.Sprintf(message.ENCRYPT_SUCCESS_MESSAGE, encryptoMessage[0], encryptoMessage[1], encryptoMessage[2]))

					// 重新将信息丢回去给下一个 handler 处理
					bk, _ := service.GetGameBrokerBySession(r.GameSession)
					bk <- reply
					result = [3]string(encryptoMessage)
					return result, false
				}
			}

			return result, true
		},
	)
}

func registerInterceptHandlers(client openapi.OpenAPI) {
	api.RegisterInterceptHandler(
		// 拦截方进行拦截
		func(ctx context.Context, r *api.Round, rt *api.RoundedTeam, ts api.TeamState) ([3]int, bool) {
			result := [3]int{0, 0, 0}

			for reply, isCancelled := getMessageOrDone(r, ctx); !isCancelled; reply, isCancelled = getMessageOrDone(r, ctx) {
				if msg, ok := reply.(*dto.WSATMessageData); ok {

					ok := true
					for _, player := range rt.Opponent().Players {
						if player.Uid == msg.Author.ID {
							break
						}
						ok = false
					}
					if !ok {
						SendMessage(
							client,
							msg.ChannelID,
							msg,
							fmt.Sprintf(
								message.GENERAL_WRONG_PLAYER_MESSAGE,
								strings.Join(func() []string {
									result := make([]string, len(rt.Opponent().Players))
									for _, player := range rt.Opponent().Players {
										result = append(result, player.NickName)
									}
									return result
								}(),
									",")))
						continue
					}

					atMessage := `<@!` + BOT_INFO.ID + `>`
					content := strings.ReplaceAll(msg.Content, atMessage, "")
					content = strings.TrimSpace(content)

					encryptoMessage := strings.Split(content, message.SPLITTER)
					if len(encryptoMessage) != 3 {
						SendMessage(client, msg.ChannelID, msg, message.REPLY_WRONG_DIGITS_FORMAT_MESSAGE)
						continue
					}

					success := true
					for idx, em := range encryptoMessage {
						if dig, err := strconv.ParseInt(em, 10, 32); err == nil && dig < 4 && dig > 0 {
							result[idx] = int(dig)
						} else {
							success = false
							break
						}
					}

					if !success {
						SendMessage(client, msg.ChannelID, msg, message.REPLY_WRONG_DIGITS_FORMAT_MESSAGE)
						continue
					}

					SendMessage(
						client,
						msg.ChannelID,
						msg,
						fmt.Sprintf(
							message.ENCRYPT_SUCCESS_MESSAGE,
							message.GetEmojiDigits(result[0]),
							message.GetEmojiDigits(result[1]),
							message.GetEmojiDigits(result[2]),
						))

					// 重新将信息丢回去给下一个 handler 处理
					bk, _ := service.GetGameBrokerBySession(r.GameSession)
					bk <- reply
					return result, false
				}
			}
			return result, true
		},
	)

	api.RegisterInterceptSuccessHandler(
		// 拦截方拦截成功
		func(ctx context.Context, r *api.Round, rt *api.RoundedTeam, ts api.TeamState) bool {

			for reply, isCancelled := getMessageOrDone(r, ctx); !isCancelled; reply, isCancelled = getMessageOrDone(r, ctx) {
				if msg, ok := reply.(*dto.WSATMessageData); ok {
					SendMessage(
						client,
						msg.ChannelID,
						msg,
						fmt.Sprintf(message.INSPECT_SUCCESS_MESSAGE))

					return false
				}
			}
			return true
		},
	)

	api.RegisterInterceptFailHandler(
		// 拦截方拦截失败
		func(ctx context.Context, r *api.Round, rt *api.RoundedTeam, ts api.TeamState) bool {

			for reply, isCancelled := getMessageOrDone(r, ctx); !isCancelled; reply, isCancelled = getMessageOrDone(r, ctx) {
				if msg, ok := reply.(*dto.WSATMessageData); ok {
					SendMessage(
						client,
						msg.ChannelID,
						msg,
						fmt.Sprintf(message.INSPECT_FAIL_MESSAGE))

					return false
				}
			}
			return true
		},
	)
}

// 获取用户当前的输入或者获取对决被手动结束的消息
// 返回当前的消息，是否已经结束
func getMessageOrDone(r *api.Round, ctx context.Context) (interface{}, bool) {
	c, e := service.GetGameBrokerBySession(r.GameSession)

	if e != nil {
		log.Warnf("get game broker error: %v", e)
		return nil, true
	}

	for {
		select {
		case msg := <-c:
			log.Infof("获取到msg %v", msg)
			return msg, false
		case <-ctx.Done():
			return nil, true
		}
	}

}
