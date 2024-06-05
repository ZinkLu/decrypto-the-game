package dodo_bot

import (
	"context"
	"fmt"
	"log"
	"time"

	dodo_open_go "github.com/dodo-open/dodo-open-go"
	"github.com/dodo-open/dodo-open-go/client"
	"github.com/dodo-open/dodo-open-go/websocket"
)

type DoDoBot struct {
}

func (bot *DoDoBot) Start() {
	t := log.Default()

	clientId := "your-bot-client-id"
	token := "your-bot-token"

	// 下面的第三个参数，设定了 resty 的请求超时为 3 秒：
	client.WithTimeout(time.Second * 3)
	instance, err := dodo_open_go.NewInstance(clientId, token, client.WithTimeout(time.Second*3))

	// 获取你的 Bot 加入过的群的列表，可以使用下面的方法
	list, err := instance.GetIslandList(context.Background())
	fmt.Println(list)

	// 创建 WebSocket 实例，它依赖 instance 对象，即上面创建的 Bot 实例
	ws, err := websocket.New(instance)
	if err != nil {
		t.Fatal(err)
	}

	// 主动连接到 WebSocket 服务器
	if err = ws.Connect(); err != nil {
		t.Fatal(err)
	}

	// 开始监听事件消息
	if err = ws.Listen(); err != nil {
		t.Fatal(err)
	}
}
