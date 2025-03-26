package handlers

import (
	"context"
	"fmt"

	"strconv"
	"strings"

	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/api"
	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/fronts/message"
	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/fronts/qq_bot/service"
	"github.com/tencent-connect/botgo/dto"
	"github.com/tencent-connect/botgo/log"
	"github.com/tencent-connect/botgo/openapi"
)

func InitRoundHandler(client openapi.OpenAPI) {
	registerInitHandlers(client)
	registerEncryptHandlers(client)
	registerInterceptHandlers(client)
	registerDecryptHandlers(client)
	registerStateSwitchHandler(client)
}

func registerInitHandlers(client openapi.OpenAPI) {
	api.RegisterInitHandler(
		// 发送开始本轮信息
		// 将密码私信发送给当前的加密者
		func(ctx context.Context, r *api.Round, ts api.TeamState) bool {
			for reply, isCancelled := getMessageOrDone(r, ctx); !isCancelled; reply, isCancelled = getMessageOrDone(r, ctx) {
				if msg, ok := reply.(*dto.WSATMessageData); ok {
					cId, _ := service.GetChannelIDByGameSession(r.GetGameSession())

					SendMessage(
						client,
						cId,
						msg,
						message.StartEncrypt.FormatTemplate(
							map[string]string{
								"Player":     message.GetAtPlayerString(r.EncryptPlayer()),
								"SecretCode": message.SECRET_CODES,
								"PlainWords": message.PLAIN_WORDS,
							},
						),
					)
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

		func(ctx context.Context, r *api.Round, rt *api.Team, p *api.Player, ts api.TeamState) ([3]string, bool) {
			result := [3]string{"", "", ""}

			// 解析加密者给出的密文是否满足特定需求，否则给出提示
			for reply, isCancelled := getMessageOrDone(r, ctx); !isCancelled; reply, isCancelled = getMessageOrDone(r, ctx) {
				if msg, ok := reply.(*dto.WSATMessageData); ok {

					if !isCorrectPlayer(msg.Author.ID, []*api.Player{r.EncryptPlayer()}) {
						SendMessage(
							client,
							msg.ChannelID,
							msg,
							message.GeneralWrongPlayer.FormatTemplate(
								map[string]string{
									"Player": r.EncryptPlayer().NickName,
								},
							),
						)
						continue
					}
					content := trimBotInfoInMessageContent(msg.Content)
					encryptoMessage := strings.Split(content, message.SPLITTER)
					if len(encryptoMessage) != 3 {
						SendMessage(
							client,
							msg.ChannelID,
							msg,
							message.ReplyWrongWordsFormat.FormatTemplate(nil),
						)
						continue
					}

					SendMessage(
						client,
						msg.ChannelID,
						msg,
						message.EncryptSuccess.FormatTemplate(
							map[string]string{
								"Word1": encryptoMessage[0],
								"Word2": encryptoMessage[1],
								"Word3": encryptoMessage[2],
							},
						),
					)

					// 重新将信息丢回去给下一个 handler 处理
					go throwBackMessage(r, reply)
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
		func(ctx context.Context, r *api.Round, opponent *api.Team, ts api.TeamState) ([3]int, bool) {
			first := true

			for reply, isCancelled := getMessageOrDone(r, ctx); !isCancelled; reply, isCancelled = getMessageOrDone(r, ctx) {
				if msg, ok := reply.(*dto.WSATMessageData); ok {
					if first {
						SendMessage(
							client,
							msg.ChannelID,
							msg,
							message.StartIntercept.FormatTemplate(
								map[string]string{
									"Team":    getPlayersNamesString(opponent.Players, message.SPLITTER),
									"BotName": BOT_INFO.Username,
								},
							),
						)
						first = false
						continue
					}

					if !isCorrectPlayer(msg.Author.ID, opponent.Players) {
						SendMessage(
							client,
							msg.ChannelID,
							msg,
							message.GeneralWrongPlayer.FormatTemplate(
								map[string]string{
									"Player": getPlayersNamesString(opponent.Players, message.SPLITTER),
								},
							))
						continue
					}

					content := trimBotInfoInMessageContent(msg.Content)
					encryptoMessage := strings.Split(content, message.SPLITTER)
					if len(encryptoMessage) != 3 {
						SendMessage(
							client,
							msg.ChannelID,
							msg,
							message.ReplyWrongDigitsFormat.FormatTemplate(nil),
						)
						continue
					}

					result, success := isValidSecrets([3]string(encryptoMessage))
					if !success {
						SendMessage(
							client,
							msg.ChannelID,
							msg,
							message.ReplyWrongDigitsFormat.FormatTemplate(nil),
						)
						continue
					}

					SendMessage(
						client,
						msg.ChannelID,
						msg,
						message.InterceptDoneMessage.FormatTemplate(
							map[string]string{
								"Word1": message.GetEmojiDigits(result[0]),
								"Word2": message.GetEmojiDigits(result[1]),
								"Word3": message.GetEmojiDigits(result[2]),
							},
						),
					)

					// 重新将信息丢回去给下一个 handler 处理
					go throwBackMessage(r, reply)
					return result, false
				}
			}
			return [3]int{}, true
		},
	)

	api.RegisterInterceptSuccessHandler(
		// 拦截方拦截成功
		func(ctx context.Context, r *api.Round, opponent *api.Team, ts api.TeamState) bool {

			for reply, isCancelled := getMessageOrDone(r, ctx); !isCancelled; reply, isCancelled = getMessageOrDone(r, ctx) {
				if msg, ok := reply.(*dto.WSATMessageData); ok {
					SendMessage(
						client,
						msg.ChannelID,
						msg,
						message.CANT_CREATE_GAME_SESSION_IN_GAME_ROOM,
					)
					// 重新将信息丢回去给下一个 handler 处理
					go throwBackMessage(r, reply)
					return false
				}
			}
			return true
		},
	)

	api.RegisterInterceptFailHandler(
		// 拦截方拦截失败
		func(ctx context.Context, r *api.Round, opponent *api.Team, ts api.TeamState) bool {
			for reply, isCancelled := getMessageOrDone(r, ctx); !isCancelled; reply, isCancelled = getMessageOrDone(r, ctx) {
				if msg, ok := reply.(*dto.WSATMessageData); ok {
					SendMessage(
						client,
						msg.ChannelID,
						msg,
						message.InterceptFailMessage.FormatTemplate(nil),
					)
					// 重新将信息丢回去给下一个 handler 处理
					go throwBackMessage(r, reply)
					return false
				}
			}
			return true
		},
	)
}

func registerDecryptHandlers(client openapi.OpenAPI) {
	api.RegisterDecryptHandler(
		// 己方进行解密
		func(ctx context.Context, r *api.Round, rt *api.Team, ts api.TeamState) ([3]int, bool) {
			first := true

			for reply, isCancelled := getMessageOrDone(r, ctx); !isCancelled; reply, isCancelled = getMessageOrDone(r, ctx) {
				if msg, ok := reply.(*dto.WSATMessageData); ok {
					if first {
						if r.GetNumberOfRounds() <= 2 {
							SendMessage(
								client,
								msg.ChannelID,
								msg,
								message.SkipInterceptTemplate.FormatTemplate(nil),
							)
						}
						SendMessage(
							client,
							msg.ChannelID,
							msg,
							message.StartDecrypt.FormatTemplate(
								map[string]string{
									"Player":  getPlayersNamesString(rt.Players, message.SPLITTER, r.EncryptPlayer()),
									"BotName": BOT_INFO.Username,
								},
							),
						)
						first = false
						continue
					}

					if !isCorrectPlayer(msg.Author.ID, rt.Players, r.EncryptPlayer()) {
						SendMessage(
							client,
							msg.ChannelID,
							msg,
							message.GeneralWrongPlayer.FormatTemplate(
								map[string]string{
									"Player": getPlayersNamesString(rt.Players, message.SPLITTER, r.EncryptPlayer()),
								},
							))
						continue
					}

					content := trimBotInfoInMessageContent(msg.Content)

					encryptoMessage := strings.Split(content, message.SPLITTER)
					if len(encryptoMessage) != 3 {
						SendMessage(client, msg.ChannelID, msg, message.ReplyWrongDigitsFormat.FormatTemplate(nil))
						continue
					}

					result, success := isValidSecrets([3]string(encryptoMessage))

					if !success {
						SendMessage(client, msg.ChannelID, msg, message.ReplyWrongDigitsFormat.FormatTemplate(nil))
						continue
					}

					SendMessage(
						client,
						msg.ChannelID,
						msg,

						fmt.Sprintf(
							message.DecryptDoneMessage.FormatTemplate(
								map[string]string{
									"Word1": message.GetEmojiDigits(result[0]),
									"Word2": message.GetEmojiDigits(result[1]),
									"Word3": message.GetEmojiDigits(result[2]),
								},
							),
						))

					// 重新将信息丢回去给下一个 handler 处理
					go throwBackMessage(r, reply)
					return result, false
				}
			}
			return [3]int{}, true
		},
	)

	api.RegisterDecryptSuccessHandler(
		// 己方解密成功
		func(ctx context.Context, r *api.Round, rt *api.Team, ts api.TeamState) bool {

			for reply, isCancelled := getMessageOrDone(r, ctx); !isCancelled; reply, isCancelled = getMessageOrDone(r, ctx) {
				if msg, ok := reply.(*dto.WSATMessageData); ok {
					SendMessage(
						client,
						msg.ChannelID,
						msg,
						message.InterceptSuccessMessage.FormatTemplate(nil),
					)
					// 重新将信息丢回去给下一个 handler 处理
					go throwBackMessage(r, reply)
					return false
				}
			}
			return true
		},
	)

	api.RegisterDecryptFailHandler(
		// 己方解密失败
		func(ctx context.Context, r *api.Round, rt *api.Team, ts api.TeamState) bool {

			for reply, isCancelled := getMessageOrDone(r, ctx); !isCancelled; reply, isCancelled = getMessageOrDone(r, ctx) {
				if msg, ok := reply.(*dto.WSATMessageData); ok {
					SendMessage(
						client,
						msg.ChannelID,
						msg,
						message.DecryptFailMessage.FormatTemplate(nil),
					)

					// 重新将信息丢回去给下一个 handler 处理
					go throwBackMessage(r, reply)
					return false
				}
			}
			return true
		},
	)
}

func registerStateSwitchHandler(client openapi.OpenAPI) {
	api.RegisterDoneHandler(
		// 本小轮结束时发送信息，包括之前所有轮次的情况
		func(ctx context.Context, r *api.Round, ts api.TeamState) bool {
			for reply, isCancelled := getMessageOrDone(r, ctx); !isCancelled; reply, isCancelled = getMessageOrDone(r, ctx) {
				if msg, ok := reply.(*dto.WSATMessageData); ok {
					SendMessage(
						client,
						msg.ChannelID,
						msg,
						message.ROUND_OVER_MESSAGE,
					)

					SendMessage(
						client,
						msg.ChannelID,
						msg,
						message.GetRoundInfo(r),
					)

					// 重新将信息丢回去给下一个 handler 处理
					go throwBackMessage(r, reply)
					return false
				}
			}
			return true
		},
	)

	api.RegisterGameOverHandler(
		// 游戏结束，主动关闭游戏
		func(ctx context.Context, s *api.Session, t *api.Team) bool {
			first := true
			for reply, isCancelled := getMessageOrDone(s.GetCurrentRound(), ctx); !isCancelled; reply, isCancelled = getMessageOrDone(s.GetCurrentRound(), ctx) {
				if msg, ok := reply.(*dto.WSATMessageData); ok {
					if first {
						if t != nil {
							SendMessage(
								client,
								msg.ChannelID,
								msg,
								message.GameOver.FormatTemplate(
									map[string]string{
										"Winner": getPlayersNamesString(t.Players, message.SPLITTER),
									},
								),
							)
						} else {
							SendMessage(
								client,
								msg.ChannelID,
								msg,
								message.MaxRoundReached.FormatTemplate(nil),
							)
						}
						SendMessage(
							client,
							msg.ChannelID,
							msg,
							message.GetGameStatusMessage(s))

						SendMessage(client,
							msg.ChannelID,
							msg,
							message.GameEndTemplate.FormatTemplate(nil))
					} else {
						SendMessage(client,
							msg.ChannelID,
							msg,
							message.CloseRoomTemplate.FormatTemplate(nil),
						)
					}

					return true
				}
				first = false
			}
			return true
		},
	)
}

// 获取用户当前的输入或者获取对决被手动结束的消息
// 返回当前的消息，是否已经结束
func getMessageOrDone(r *api.Round, ctx context.Context) (any, bool) {
	c, e := service.GetGameBrokerBySession(r.GetGameSession())

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

// 由于机器人的限制，它必须回复被动消息（主动消息会有频率限制）
// 因此当前阶段的 handler 如果想主动发送一条信息，则需要上一个handler处理的结果
// 这个方法可以在上一个 handler 处理完后将消息传递给下一个 handler
func throwBackMessage(r *api.Round, msg any) error {
	c, e := service.GetGameBrokerBySession(r.GetGameSession())

	if e != nil {
		log.Warnf("get game broker error: %v", e)
		return e
	}
	c <- msg
	return nil
}

// 合并玩家的 nickname
// excludes 可以在 players 中额外再排除一些玩家
func getPlayersNamesString(players []*api.Player, sep string, excludes ...*api.Player) string {
	playNames := make([]string, 0, len(players))
	excludeNames := make(map[string]bool, len(excludes))

	for _, e := range excludes {
		excludeNames[e.NickName] = true
	}

	for _, p := range players {

		if _, ok := excludeNames[p.NickName]; ok {
			continue
		}

		playNames = append(playNames, p.NickName)
	}

	return strings.Join(playNames, sep)
}

// 去除消息中的 `<@ BOT_ID>` 的部分 以及 信息前后多余的空格
func trimBotInfoInMessageContent(content string) string {
	atMessage := `<@!` + BOT_INFO.ID + `>`
	return strings.TrimSpace(strings.ReplaceAll(content, atMessage, ""))
}

// 判断目前的回话是否由特定的人发起
// excludes 可以在 players 中额外再排除一些玩家
// 返回 true 表示存在目标玩家中
func isCorrectPlayer(target string, players []*api.Player, excludes ...*api.Player) bool {
	excludeNames := make(map[string]bool, len(excludes))

	for _, e := range excludes {
		excludeNames[e.Uid] = true
	}

	for _, p := range players {

		if _, ok := excludeNames[p.Uid]; ok {
			continue
		}

		if p.Uid == target {
			return true
		}

	}
	return false

}

// 判断是否信息中只包含 3 个 1-4 的数字，并且每个数字只能出现一次
func isValidSecrets(encryptoMessage [3]string) ([3]int, bool) {
	result := [3]int{0, 0, 0}
	isSuccess := true
	x := 0
	for idx, em := range encryptoMessage {
		if dig, err := strconv.ParseInt(em, 10, 32); err == nil && dig < 5 && dig > 0 {
			result[idx] = int(dig)
			x ^= result[idx]
		} else {
			isSuccess = false
			break
		}
	}

	// x 如果落在 1-4 之间说明有重复的数字
	if x >= 1 && x <= 4 {
		isSuccess = false
	}
	return result, isSuccess
}
