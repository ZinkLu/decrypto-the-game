package core

import (
	"context"
	"reflect"
)

// 记下对手的拦截密码。本轮揭晓时才结算，在那之前不改变任何计数
func (r *Round) SetInterceptSecret(interceptedSecret [3]int) {
	r.interceptedSecret = interceptedSecret
	r.intercepted = true
}

// 当前队伍有没有破解成功
func (r *Round) IsInterceptSuccess() bool {
	return reflect.DeepEqual(r.interceptedSecret, r.secret)
}

// 记下当前队伍解密的密码。本轮揭晓时才结算，在那之前不改变任何计数
func (r *Round) SetDecryptedSecret(secret [3]int) {
	r.decryptSecret = secret
	r.decrypted = true
}

// 当前队伍有没有猜中自己的密码
func (r *Round) IsDecryptedCorrect() bool {
	return reflect.DeepEqual(r.secret, r.decryptSecret)
}

// HasInterception reports whether the opponents guess this round's code: from
// the third round on, once each team has had a round with no record to go by.
func (r *Round) HasInterception() bool {
	return r.roundN > 2
}

// NeedsIntercept reports whether the opponents' guess is still to come.
func (r *Round) NeedsIntercept() bool {
	return r.HasInterception() && !r.intercepted
}

// NeedsDecrypt reports whether the encrypting team's guess is still to come.
func (r *Round) NeedsDecrypt() bool {
	return !r.decrypted
}

// reveal scores both guesses at once, as the encryptor turning over the code.
func (r *Round) reveal() {
	if r.intercepted && r.IsInterceptSuccess() {
		r.opponent.InterceptedSuccess()
	}
	if !r.IsDecryptedCorrect() {
		r.currentTeam.DecryptFailed()
	}
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
		nextStep = GUESSING
	case GUESSING:
		nextStep = DONE
	}
	round.state = nextStep
	return nextStep
}

// 在注册 handler 后进行这个方法的注册
// 如果手动结束了对局则会返回 true
func (round *Round) AutoForward(c context.Context) bool {
	return round.forward(c, round.Next())
}

// Resume re-enters the phase a restored round was saved in. A guess that was
// already given is not asked for again.
func (round *Round) Resume(c context.Context) bool {
	return round.forward(c, round.state)
}

func (round *Round) forward(c context.Context, state TeamState) bool {
	for ; state <= DONE; state = round.Next() {
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
		case GUESSING:
			// As in the original game, both teams write their guess before the
			// code is turned over, and the two guesses score independently.
			if round.NeedsDecrypt() || round.NeedsIntercept() {
				if guessHandler(c, round, GUESSING) {
					return true
				}
				// A guess the handler never gave counts as an empty one.
				if round.NeedsIntercept() {
					round.SetInterceptSecret([3]int{})
				}
				if round.NeedsDecrypt() {
					round.SetDecryptedSecret([3]int{})
				}
			}
			round.reveal()

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

// 获取解密者给出的密码，尚未给出或超时未给出时返回 0,0,0
func (r *Round) GetDecryptSecret() [3]int { return r.decryptSecret }
