package api

import "reflect"

// 作为 Team 的子类，添加上了本局的一些对战信息
type RoundedTeam struct {
	*Team              // 目前处理加密的队伍
	round              *Round
	secret             [3]int    // 本局中，需要传递的密码
	encryptedMessage   [3]string // 本局中，负责加密的人给出的密文
	encryptPlayerIndex uint8     // 本局中，负责加密的人的索引位置
	encryptPlayer      *Player   // 本局中，负责加密的人
	interceptedSecret  [3]int    // 本局中，对手给出的拦截密码
	decryptSecret      [3]int    // 本局中，队友给出的破译密码
}

// 设置当前队伍的拦截密码
//
// 自动增加拦截正确计数, 返回是否拦截成功
func (rt *RoundedTeam) SetInterceptSecret(interceptedSecret [3]int) bool {
	rt.interceptedSecret = interceptedSecret
	result := rt.IsIntercepted()
	if result {
		rt.Team.InterceptedSuccess()
	}
	return result
}

// 当前队伍有没有破解成功
func (rt *RoundedTeam) IsIntercepted() bool {
	return reflect.DeepEqual(rt.interceptedSecret, rt.Opponent().secret)
}

func (rt *RoundedTeam) GetInterceptSecret() [3]int {
	return rt.interceptedSecret
}

func (rt *RoundedTeam) GetDecryptSecret() [3]int {
	return rt.decryptSecret
}

// 设置当前队伍解密的密码
//
// 自动增加解密错误计数, 返回是否解密成功
func (rt *RoundedTeam) SetDecryptedSecret(secret [3]int) bool {
	rt.decryptSecret = secret
	result := rt.IsDecryptedCorrect()
	if !result {
		rt.Team.DecryptFailed()
	}
	return result
}

// 当前队伍有没有猜中自己的密码
func (rt *RoundedTeam) IsDecryptedCorrect() bool {
	return reflect.DeepEqual(rt.secret, rt.decryptSecret)
}

// 本轮当前对手
func (rt *RoundedTeam) Opponent() *RoundedTeam {
	var opponent *RoundedTeam
	if rt.round.Teams[0] == rt {
		opponent = rt.round.Teams[1]
	} else {
		opponent = rt.round.Teams[0]
	}
	return opponent
}

// 本轮中加密的人
func (rt *RoundedTeam) EncryptPlayer() *Player {
	return rt.encryptPlayer
}

// 获取本局的加密数字
func (rt *RoundedTeam) GetSecretDigits() [3]int {
	return rt.secret
}

// 获取本局的加密词语
func (rt *RoundedTeam) GetSecretWords() [3]string {
	return [3]string{
		rt.Words[rt.secret[0]-1],
		rt.Words[rt.secret[1]-1],
		rt.Words[rt.secret[2]-1],
	}
}

func (rt *RoundedTeam) GetEncryptedMessage() [3]string {
	return rt.encryptedMessage
}
