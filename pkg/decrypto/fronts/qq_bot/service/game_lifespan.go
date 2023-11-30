package service

import (
	"errors"
	"fmt"

	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/api"
	"github.com/tencent-connect/botgo/dto"
)

// 开始一场对战，该函数处理三个事情
// 1. 判断当前状态，是否所有人都可以加入
//
// 2. 为本局对局创建子频道
//
// 3. 初始化 session 并放入 GAME_POOL 中
//
// 如果创建成功返回 session 对象，否则 err 不为 nil
//
// err 中的错误信息是用户友好的，可以直接被返回到客户端
func StartGameSession(players []*dto.User, channelId string) (*api.Session, error) {
	// 约定第一名为房主
	var (
		err         error
		session     *api.Session
		gamePlayers []*api.Player
	)
	var userIds = make([]string, 0, len(players))

	// 判断所有的用户都在游戏中，如果有任何一名玩家在游戏中则无法开始游戏
	for _, u := range players {
		value := GAME_POOL.Get(GetPoolKey(USER, u.ID))
		if value != nil {
			msg := fmt.Sprintf("玩家 %s 已经处在一场游戏中", u.Username)
			err = errors.New(msg)
			goto ERROR
		}
		userIds = append(userIds, u.ID)
	}

	gamePlayers = make([]*api.Player, len(players))
	for idx, p := range players {
		gamePlayers[idx] = &api.Player{Uid: p.ID, NickName: p.Username}
	}

	session, err = api.NewWithAutoTeamUp(channelId, gamePlayers)

	if err != nil {
		goto ERROR
	}

	GAME_POOL.Put(GetPoolKey(CHANNEL, channelId), session)
	for _, u := range userIds {
		GAME_POOL.Put(GetPoolKey(USER, u), session)
	}

	return session, nil

ERROR:
	return nil, err
}

func EndGameSessionByChannel(channelId string) string {
	GAME_POOL.GameOver(GetPoolKey(CHANNEL, channelId))
	return channelId
}

func GetGameSessionByChannel(channelId string) *api.Session {
	return GAME_POOL.Get(GetPoolKey(CHANNEL, channelId))
}