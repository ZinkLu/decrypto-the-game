package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/tencent-connect/botgo"
	"github.com/tencent-connect/botgo/dto"
	"github.com/tencent-connect/botgo/event"
	"github.com/tencent-connect/botgo/token"
	"github.com/tencent-connect/botgo/websocket"
)

func main() {
	botId, ok := os.LookupEnv("BOT_ID")
	if !ok {
		os.Exit(1)
	}

	botIdInt, err := strconv.ParseInt(botId, 10, 64)

	if err != nil {
		fmt.Printf("%e", err)
		os.Exit(1)
	}

	botSecret, ok := os.LookupEnv("BOT_SECRET")
	if !ok {
		os.Exit(1)
	}

	token := token.BotToken(uint64(botIdInt), botSecret)
	api := botgo.NewOpenAPI(token).WithTimeout(3 * time.Second)
	ctx := context.Background()

	ws, err := api.WS(ctx, nil, "")
	log.Printf("%+v, err:%v", ws, err)

	me, err := api.Me(ctx)
	log.Printf("%+v, err:%v", me, err)

	// 监听哪类事件就需要实现哪类的 handler，定义：websocket/event_handler.go
	var atMessage event.ATMessageEventHandler = func(event *dto.WSPayload, data *dto.WSATMessageData) error {
		api.PostMessage(ctx, data.ChannelID, &dto.MessageToCreate{Content: "滚，不会"})
		fmt.Println(event, data)
		return nil
	}
	intent := websocket.RegisterHandlers(atMessage)
	// 启动 session manager 进行 ws 连接的管理，如果接口返回需要启动多个 shard 的连接，这里也会自动启动多个
	botgo.NewSessionManager().Start(ws, token, &intent)

}
