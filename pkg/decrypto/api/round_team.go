package api

// 作为 Team 的子类，添加上了本局的一些对战信息
type RoundedTeam struct {
	*Team
	round              *Round
	secret             [3]int
	encryptedMessage   [3]string
	encryptPlayerIndex uint8
	encryptPlayer      *Player
	inspectedSecret    [3]int
	decryptSecret      [3]int
}

// 设置当前队伍的拦截密码
//
// 自动增加拦截正确计数, 返回是否拦截成功
func (rt *RoundedTeam) SetInspectSecret(inspectedSecret [3]int) bool {
	rt.inspectedSecret = inspectedSecret
	result := rt.IsInspected()
	if result {
		rt.Team.InspectedSuccess()
	}
	return result
}

// 当前队伍有没有破解成功
func (rt *RoundedTeam) IsInspected() bool {
	return rt.inspectedSecret == rt.Opponent().secret
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
	return rt.secret == rt.decryptSecret
}

// 本轮当前对手
func (rt *RoundedTeam) Opponent() *RoundedTeam {
	var opponent *RoundedTeam
	if rt.round.teams[0] == rt {
		opponent = rt.round.teams[1]
	} else {
		opponent = rt.round.teams[0]
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
		rt.Words[rt.secret[0]],
		rt.Words[rt.secret[1]],
		rt.Words[rt.secret[2]],
	}
}
