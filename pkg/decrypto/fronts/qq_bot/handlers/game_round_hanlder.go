package handlers

import (
	"context"
	"fmt"
	"strings"

	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/api"
	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/fronts/qq_bot/message"
	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/fronts/qq_bot/service"
	"github.com/tencent-connect/botgo/dto"
	"github.com/tencent-connect/botgo/log"
	"github.com/tencent-connect/botgo/openapi"
)

func InitRoundHandler(client openapi.OpenAPI) {

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

	api.RegisterEncryptHandler(

		// 发送密码给当前加密者并且等待加密者进行加密
		func(ctx context.Context, r *api.Round, rt *api.RoundedTeam, p *api.Player, ts api.TeamState) ([3]string, bool) {
			result := [3]string{"", "", ""}

			// 解析加密者给出的密文是否满足特定需求，否则给出提示
			for reply, isCancelled := getMessageOrDone(r, ctx); !isCancelled; reply, isCancelled = getMessageOrDone(r, ctx) {
				if msg, ok := reply.(*dto.WSATMessageData); ok {

					encryptoMessage := strings.Split(msg.Content, message.SPLITTER)
					if len(encryptoMessage) != 3 {
						SendMessage(client, msg.ChannelID, msg, message.REPLY_FORMAT_MESSAGE)
						continue
					}

					SendMessage(client, msg.ChannelID, msg, fmt.Sprintf(message.ENCRYPT_SUCCESS_MESSAGE, strings.Join(encryptoMessage, "")))
					result = [3]string(encryptoMessage)
					break
				}
			}

			return result, true
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
