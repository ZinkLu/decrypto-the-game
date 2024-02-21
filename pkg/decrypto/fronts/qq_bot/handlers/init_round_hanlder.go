package handlers

import (
	"context"
	"fmt"
	"strings"

	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/api"
	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/fronts/qq_bot/message"
	"github.com/tencent-connect/botgo/dto"
	"github.com/tencent-connect/botgo/openapi"
)

func InitRoundHandler(client openapi.OpenAPI) {
	// 给两边的选手发送私信告诉他们底牌（4个文字）
	// 所有人都准备好了即可开始
	// 发送开始本轮信息
	api.RegisterInitHandler(func(ctx context.Context, r *api.Round, ts api.TeamState) {
		for reply := getMessageOrDone(r, ctx); reply != nil; {
			if msg, ok := reply.(*dto.WSATMessageData); ok {
				SendMessage(client, msg.ChannelID, msg, fmt.Sprintf(message.START_ENCRYPT_MESSAGE, r.CurrentTeam.EncryptPlayer().NickName))
			} else if msg, ok := reply.(*dto.WSDirectMessageData); ok && msg.Author.ID == r.CurrentTeam.EncryptPlayer().Uid {
				SendDirectMessage(client, msg.Author.ID, msg, fmt.Sprintf(message.START_ENCRYPT_MESSAGE, r.CurrentTeam.EncryptPlayer().NickName))
				return
			}
		}

	})

	// 发送密码给当前加密者并且等待加密者进行加密
	api.RegisterEncryptHandler(func(ctx context.Context, r *api.Round, rt *api.RoundedTeam, p *api.Player, ts api.TeamState) [3]string {
		result := [3]string{"", "", ""}

		// 解析加密者给出的密文是否满足特定需求，否则给出提示
		for reply := getMessageOrDone(r, ctx); reply != nil; {
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

		return result
	})
}

// 获取用户当前的输入或者因为超时而退出
func getMessageOrDone(r *api.Round, ctx context.Context) interface{} {
	select {
	case msg := <-r.GameSession.GetBrokerForRead():
		return msg
	case <-ctx.Done():
		return nil
	}

}
