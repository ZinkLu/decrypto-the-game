package qq_bot

import (
	"context"
	"log"
	"time"

	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/fronts/qq_bot/compact"
	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/fronts/qq_bot/handlers"
	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/fronts/utils"
	"github.com/tencent-connect/botgo"
	"github.com/tencent-connect/botgo/openapi"
	"github.com/tencent-connect/botgo/token"
	"github.com/tencent-connect/botgo/websocket"
)

type QQBot struct {
	botId     string
	botSecret string
	api       openapi.OpenAPI
}

func (bot *QQBot) Start() {
	botgo.SetLogger(compact.New(utils.Log))
	ctx := context.Background()
	api := bot.api
	ws, _ := api.WS(ctx, nil, "")

	if me, err := api.Me(context.Background()); err == nil {
		handlers.BOT_INFO = me
	}
	// 监听哪类事件就需要实现哪类的 handler，定义：websocket/event_handler.go
	hs := initMessageHandlers(api)
	intent := websocket.RegisterHandlers(hs...)

	initRoundHandler(api)
	// 启动 session manager 进行 ws 连接的管理，如果接口返回需要启动多个 shard 的连接，这里也会自动启动多个
	botgo.NewSessionManager().Start(ws, nil, &intent)

}

// 注册所有机器人行为
func initMessageHandlers(api openapi.OpenAPI) []any {
	return []any{handlers.GetAtMessageHandler(api), handlers.GetDirectMessageHandler(api)}
}

func initRoundHandler(api openapi.OpenAPI) {
	handlers.InitRoundHandler(api)
}

func CreateBot(botId string, botSecret string, debug bool) *QQBot {
	var api openapi.OpenAPI
	//创建oauth2标准token source
	ctx := context.Background()
	tokenSource := token.NewQQBotTokenSource(
		&token.QQBotCredentials{
			AppID:     botId,
			AppSecret: botSecret,
		})
	//启动自动刷新access token协程
	if err := token.StartRefreshAccessToken(ctx, tokenSource); err != nil {
		log.Fatalln(err)
	}
	if debug {
		api = botgo.NewSandboxOpenAPI(botId, tokenSource).WithTimeout(3 * time.Second)
	} else {
		api = botgo.NewOpenAPI(botId, tokenSource).WithTimeout(3 * time.Second)
	}

	return &QQBot{
		botId:     botId,
		botSecret: botSecret,
		api:       api,
	}
}
