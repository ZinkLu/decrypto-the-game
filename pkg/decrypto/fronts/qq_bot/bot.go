package qq_bot

import (
	"context"
	"log"
	"time"

	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/fronts/qq_bot/handlers"
	"github.com/tencent-connect/botgo"
	"github.com/tencent-connect/botgo/openapi"
	"github.com/tencent-connect/botgo/token"
	"github.com/tencent-connect/botgo/websocket"
)

type QQBot struct {
	botId     uint64
	botSecret string
	token     *token.Token
	api       openapi.OpenAPI
}

func (bot *QQBot) Start() {
	ctx := context.Background()
	api := bot.api
	ws, err := api.WS(ctx, nil, "")
	log.Printf("%+v, err:%v", ws, err)

	if me, err := api.Me(context.Background()); err == nil {
		handlers.BOT_INFO = me
	}
	// 监听哪类事件就需要实现哪类的 handler，定义：websocket/event_handler.go
	hs := initMessageHandlers(api)
	intent := websocket.RegisterHandlers(hs...)

	initRoundHandler(api)
	// 启动 session manager 进行 ws 连接的管理，如果接口返回需要启动多个 shard 的连接，这里也会自动启动多个
	botgo.NewSessionManager().Start(ws, bot.token, &intent)

}

// 注册所有机器人行为
func initMessageHandlers(api openapi.OpenAPI) []interface{} {
	return []interface{}{handlers.GetAtMessageHandler(api), handlers.GetDirectMessageHandler(api)}
}

func initRoundHandler(api openapi.OpenAPI) {
	handlers.InitRoundHandler(api)
}

func CreateBot(botId uint64, botSecret string, debug bool) *QQBot {
	var api openapi.OpenAPI
	token := token.BotToken(botId, botSecret)
	if debug {
		api = botgo.NewSandboxOpenAPI(token).WithTimeout(3 * time.Second)
	} else {
		api = botgo.NewOpenAPI(token).WithTimeout(3 * time.Second)
	}

	return &QQBot{
		botId:     botId,
		botSecret: botSecret,
		token:     token,
		api:       api,
	}
}
