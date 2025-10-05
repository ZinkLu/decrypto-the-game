package api

import (
	"context"
	"reflect"
)

// 设置当前队伍的拦截密码
//
// 自动增加拦截正确计数, 返回是否拦截成功
func (r *Round) SetInterceptSecret(interceptedSecret [3]int) bool {
	r.interceptedSecret = interceptedSecret
	result := r.IsInterceptSuccess()
	if result {
		r.opponent.InterceptedSuccess()
	}
	return result
}

// 当前队伍有没有破解成功
func (r *Round) IsInterceptSuccess() bool {
	return reflect.DeepEqual(r.interceptedSecret, r.secret)
}

// 设置当前队伍解密的密码
//
// 自动增加解密错误计数, 返回是否解密成功
func (r *Round) SetDecryptedSecret(secret [3]int) bool {
	r.decryptSecret = secret
	result := r.IsDecryptedCorrect()
	if !result {
		r.currentTeam.DecryptFailed()
	}
	return result
}

// 当前队伍有没有猜中自己的密码
func (r *Round) IsDecryptedCorrect() bool {
	return reflect.DeepEqual(r.secret, r.decryptSecret)
}

// 获取本局的加密词语
func (r *Round) GetSecretWords() [3]string {
	return [3]string{
		r.currentTeam.Words[r.secret[0]-1],
		r.currentTeam.Words[r.secret[1]-1],
		r.currentTeam.Words[r.secret[2]-1],
	}
}

// 判断是否是最后一轮游戏
func (round *Round) isFinalRound() bool {
	return round.roundN == round.gameSession.maxRounds
}

func (round *Round) GetRoundNumber() uint8 {
	return round.roundN
}

// 进行当前的队伍，当前阶段的操作;
// 如果这么做了，会将 Round 中的状态自动进行迁移至下一个状态，
// 同时返回下一个状态时正在操作的队伍和新的状态
//
// 如果为 Done 则表示本轮结束
//
// 作为调用方，应该关注每一状态的处理，比如:
//
//	for team, state := round.Next(); state != DONE; team, state = round.Next() {
//		switch state {
//		case INIT:
//		case ENCRYPTING:
//			...
//		}
//	}
//
// 或者使用 RegisterXXXHandler 方法，将 handler 进行注册，此时只需要调用
// AutoForward 的方法既可以进行完成对局
func (round *Round) Next() TeamState {
	var nextStep TeamState
	switch round.state {
	case NEW:
		nextStep = INIT
	case INIT:
		nextStep = ENCRYPTING
	case ENCRYPTING:
		nextStep = INTERCEPT
	case INTERCEPT:
		nextStep = DECRYPT
	case DECRYPT:
		nextStep = DONE
	}
	round.state = nextStep
	return nextStep
}

// 在注册 handler 后进行这个方法的注册
// 如果手动结束了对局则会返回 true
func (round *Round) AutoForward(c context.Context) bool {
	for state := round.Next(); state <= DONE; state = round.Next() {
		switch state {
		case INIT:
			isCancelled := initHandler(c, round, INIT)
			if isCancelled {
				return isCancelled
			}
		case ENCRYPTING:
			eString, isCancelled := encryptHandler(c, round, round.currentTeam, round.encryptPlayer, ENCRYPTING)
			if isCancelled {
				return isCancelled
			}
			round.encryptedMessage = eString
		case INTERCEPT:
			if round.roundN <= 2 { // 前两局（每个队伍的第一局）都进行拦截
				continue
			}
			opponent := round.opponent
			interceptedSecret, isCancelled := interceptHandler(c, round, opponent, INTERCEPT)
			if isCancelled {
				return isCancelled
			}
			intercepted := round.SetInterceptSecret(interceptedSecret)

			if intercepted && interceptSuccessHandler != nil {
				if interceptSuccessHandler(c, round, opponent, INTERCEPT) {
					return true
				}
			} else if !intercepted && interceptFailHandler != nil {
				if interceptFailHandler(c, round, opponent, INTERCEPT) {
					return true
				}
			}

		case DECRYPT:
			if round.IsInterceptSuccess() {
				continue
			}

			decryptedSecret, isCancelled := decryptHandler(c, round, round.currentTeam, DECRYPT)
			if isCancelled {
				return isCancelled
			}

			success := round.SetDecryptedSecret(decryptedSecret)

			if success && decryptSuccessHandler != nil {
				if decryptSuccessHandler(c, round, round.currentTeam, DECRYPT) {
					return true
				}
			} else if !success && decryptFailHandler != nil {
				if decryptFailHandler(c, round, round.currentTeam, DECRYPT) {
					return true
				}
			}

		case DONE:
			if doneHandler(c, round, DONE) {
				return true
			}
			return false
		}
	}
	return false
}

/*
	========================== read-only properties ============================
*/

// 获取对局对象
func (round *Round) GetGameSession() *Session { return round.gameSession }

// 获取当前行动队伍
func (round *Round) GetCurrentTeam() *Team { return round.currentTeam }

// 获取当前行动队伍的对手队伍
func (round *Round) GetOpponent() *Team { return round.opponent }

// 获取上一轮对象（如果是第一轮则返回 nil）
func (round *Round) GetPreviousRound() *Round { return round.previousRound }

// 获取本局对局状态
func (round *Round) GetTeamState() TeamState { return round.state }

// 获取本局是第几局
func (round *Round) GetNumberOfRounds() uint8 { return round.roundN }

// 获取本局加密者给出加密词组
func (r *Round) GetEncryptedMessage() [3]string { return r.encryptedMessage }

// 本轮中加密的人
func (r *Round) EncryptPlayer() *Player { return r.encryptPlayer }

// 获取本局需要加密的数字（由系统生成）
func (r *Round) GetSecretDigits() [3]int { return r.secret }

// 获取 opponent 给出的拦截密码，如果是前两局，则永远返回 0,0,0
func (r *Round) GetInterceptSecret() [3]int { return r.interceptedSecret }

// 获取解密者给出的密码，当拦截成功 IsDecryptedCorrect() 返回为 true 时，
// 这个值永远会返回 0,0,0
func (r *Round) GetDecryptSecret() [3]int { return r.decryptSecret }
