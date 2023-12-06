package service

import (
	"sync"

	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/api"
)

var pool_lock = sync.Mutex{}

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
func (p *GamePool) put(key string, session *api.Session) {
	p.pool[key] = session

	if _, ok := p.reserved[session]; !ok {
		if pool_lock.TryLock() {
			p.reserved[session] = make([]string, 0)
			pool_lock.Unlock()
		} else {
			for {
				if _, ok := p.reserved[session]; ok {
					break
				}
			}
		}
	}

	p.reserved[session] = append(p.reserved[session], key)
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

// 通过 Session 来获取关联到该 Session 的 keys
func (p *GamePool) getKeys(session *api.Session) []string {
	value, _ := p.reserved[session]
	return value
}

// game_pool
// 为了能让 bot 更快判断需要处理哪场session，因此设置 game_pool 对象
//
// game_pool 的key可以是是一切字符串
//
// 比如 ChannelID ，bot 能够快速通过频道号判断是否有有效的 session
// 有比如 UserId，bot 能够快速判断
var game_pool = GamePool{make(map[string]*api.Session), make(map[*api.Session][]string)}

type key_type = int

const (
	CHANNEL key_type = iota
	USER
	OTHER
)

// 正确获取 GAME_POOL 中 key 值
// 自动添加前缀
func getPoolKey(way key_type, key string) string {
	return getPoolKeyPrefix(way) + key
}

func getPoolKeyPrefix(way key_type) string {
	switch way {
	case CHANNEL:
		return "C-"
	case USER:
		return "U-"
	default:
		return "O-"
	}
}
