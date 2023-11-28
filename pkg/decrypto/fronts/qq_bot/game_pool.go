package qq_bot

import (
	"sync"

	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/api"
)

var POOL_LOCK = sync.Mutex{}

// GamePool
//
// 对于每一场session（api.Session），程序需要在很多地方对其进行索引
//
// 比如在玩家进行对话时判断ta是否身处某个session中
//
// 或者某个正在进行游戏的房间
//
// # GamePoll 提供了以 string 为 key, Session 为 value 的结构方便进行索引
//
// 同时 gameOver 方法会销毁某一个 key 对象的所有 Session，以及其他关联在到这个 Session 的其他 key
type GamePool struct {
	pool     map[string]*api.Session
	reserved map[*api.Session][]string
}

// 将某个 Key 关联到某场 session
func (p *GamePool) put(key string, session *api.Session) error {
	p.pool[key] = session

	if _, ok := p.reserved[session]; !ok {
		if POOL_LOCK.TryLock() {
			p.reserved[session] = make([]string, 0)
			POOL_LOCK.Unlock()
		} else {
			for {
				if _, ok := p.reserved[session]; ok {
					break
				}
			}
		}
	}

	p.reserved[session] = append(p.reserved[session], key)
	return nil
}

// 获取某个 key 对应的 Session
func (p *GamePool) get(key string) *api.Session {
	return p.pool[key]
}

// 表示结束一场 session，清空 key 相关的 session 以及 session 关联的其他 key
func (p *GamePool) gameOver(key string) {
	value, ok := p.pool[key]
	if !ok {
		return
	}
	keys := p.reserved[value]
	for _, v := range keys {
		delete(p.pool, v)
	}
	delete(p.reserved, value)
}

// 所有的session应该都有一个独立的房间
// CHAT_GAME_POOL 以子频道的 id 为 Key，gameSession 为value
var CHAT_GAME_POOL = GamePool{make(map[string]*api.Session), make(map[*api.Session][]string)}

// 以 userid 为 key, gameSession 做为 value 的 map
// 保存了所有的正在进行游戏的用户，方便快速进行查询
var USER_GAME_POOL = GamePool{make(map[string]*api.Session), make(map[*api.Session][]string)}
