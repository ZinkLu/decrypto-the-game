package core

import (
	"context"
)

type TeamState uint

/*
定义本轮的状态，即要进行的顺序；

由于每大轮存在两小轮，且两组队伍执行的动作一样，这里只举一小轮为例子:

每一小轮（即当前队伍回合），都有以下阶段需要进行:

1. 确定本轮的加密者，并为加密者抽取密码; 					 INIT

2. 加密者给出 3 个描述;									 ENCRYPTING

3. 两队同时猜：我方解密，对方拦截（前两轮没有拦截）			 GUESSING

4. 揭晓密码，同时结算拦截与解密								DONE

因此有 8(4*2) 个阶段
*/
const (
	NEW        TeamState = iota // 新对局
	INIT                        // 准备状态
	ENCRYPTING                  // 给描述（加密）
	GUESSING                    // 我方解密、对方拦截，同时进行
	DONE                        // 两份猜测都已给出，本轮已结算
)

// --------------------------- 本轮开始时的一些操作  ---------------------------
var initHandler func(context.Context, *Round, TeamState) bool

func RegisterInitHandler(f func(context.Context, *Round, TeamState) bool) {
	initHandler = f
}

// --------------------------- 加密  ---------------------------
// 参数为(本轮游戏, 加密队伍, 加密者, 当前状态-ENCRYPTING)
//
// 返回加密者给的三个字符
var encryptHandler func(context.Context, *Round, *Team, *Player, TeamState) ([3]string, bool)

func RegisterEncryptHandler(f func(context.Context, *Round, *Team, *Player, TeamState) ([3]string, bool)) {
	encryptHandler = f
}

// --------------------------- 两队同时猜  ---------------------------
// 参数为(本轮游戏, 当前状态-GUESSING)
//
// 本轮还缺哪一份猜测，见 Round.NeedsDecrypt 与 Round.NeedsIntercept。每收到一份，
// 就用 Round.SetDecryptedSecret 或 Round.SetInterceptSecret 记下；两份都在之前，
// 任何一方都不会被结算。返回时仍未给出的猜测按 0,0,0 处理。
//
// 返回 true 表示取消对局
var guessHandler func(context.Context, *Round, TeamState) bool

func RegisterGuessHandler(f func(context.Context, *Round, TeamState) bool) {
	guessHandler = f
}

// --------------------------- 本轮结束时的一些操作  ---------------------------
var doneHandler func(context.Context, *Round, TeamState) bool

// 参数为(本轮游戏, 当前状态-DONE)
//
// 此时密码已揭晓，拦截与解密都已结算
func RegisterDoneHandler(f func(context.Context, *Round, TeamState) bool) {
	doneHandler = f
}

// --------------------------- 当某只队伍赢得比赛时的触发动作  ---------------------------
// 参数为(ctx, 本局游戏, 获胜队伍)
// 当达到最大局数但仍然没有胜利的队伍出现，team 则为 nil
var gamerOverHandler func(context.Context, *Session, *Team) bool

func RegisterGameOverHandler(f func(context.Context, *Session, *Team) bool) {
	gamerOverHandler = f
}
