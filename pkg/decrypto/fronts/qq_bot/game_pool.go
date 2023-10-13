package qq_bot

import (
	"fmt"

	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/api"
)

// global game session management
type GamePool struct {
	pool map[string]*api.Session
}

func (p *GamePool) put(key string, session *api.Session) error {
	_, ok := p.pool[key]
	if ok {
		return fmt.Errorf("%s 已经开始了一局游戏", key)
	}
	p.pool[key] = session
	return nil
}

func (p *GamePool) get(key string) (*api.Session, error) {
	value, ok := p.pool[key]
	if !ok {
		return nil, fmt.Errorf("%s 未开始一局对战", key)
	}
	return value, nil
}

var game_pool = *&GamePool{make(map[string]*api.Session)}
