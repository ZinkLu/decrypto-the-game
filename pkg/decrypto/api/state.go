package api

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

3. 对方进行破解（第一轮掉过该阶段），破解成功，本小轮结束	   INTERCEPT

4. 我方进行解密											DECRYPT

5. 统计本轮分数											DONE

因此有 8(4*2) 个阶段
*/
const (
	NEW        TeamState = iota // 新对局
	INIT                        // 准备状态
	ENCRYPTING                  // 给描述（加密）
	INTERCEPT                   // 对方破解
	DECRYPT                     // 我方破解
	DONE                        // 只有两个队伍都结束了，才会进入该状态
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

// --------------------------- 对方拦截 ---------------------------
// 参数为(本轮游戏, 当前加密队伍的**对手**, 当前状态-INTERCEPT)
// 返回解密的三个数字
var interceptHandler func(context.Context, *Round, *Team, TeamState) ([3]int, bool)

func RegisterInterceptHandler(f func(context.Context, *Round, *Team, TeamState) ([3]int, bool)) {
	interceptHandler = f
}

// 这个方法将会在对方拦截成功后执行，可以不设置
//
// (拦截成功后会自动为队伍添加添加成功标记)
//
// 参数为(本轮游戏, 当前加密队伍的**对手**, 当前状态-INTERCEPT)
var interceptSuccessHandler func(context.Context, *Round, *Team, TeamState) bool

func RegisterInterceptSuccessHandler(f func(context.Context, *Round, *Team, TeamState) bool) {
	interceptSuccessHandler = f
}

// 这个方法将会在对方拦截失败后执行，可以不设置
//
// 参数为(本轮游戏, 当前加密队伍的**对手**, 当前状态-INTERCEPT)
var interceptFailHandler func(context.Context, *Round, *Team, TeamState) bool

func RegisterInterceptFailHandler(f func(context.Context, *Round, *Team, TeamState) bool) {
	interceptFailHandler = f
}

// --------------------------- 己方解密  ---------------------------

// 参数为(本轮游戏, 加密队伍, 加密者, 当前状态-DECRYPT)
//
// 如果对方拦截成功则会跳过
//
// 返回解密的三个数字
var decryptHandler func(context.Context, *Round, *Team, TeamState) ([3]int, bool)

func RegisterDecryptHandler(f func(context.Context, *Round, *Team, TeamState) ([3]int, bool)) {
	decryptHandler = f
}

// 这个方法将会在解密成功后执行，可以不设置
//
// 参数为(本轮游戏, 加密队伍, 加密者, 当前状态-DECRYPT)
//
// 如果对方拦截成功则会跳过
var decryptSuccessHandler func(context.Context, *Round, *Team, TeamState) bool

func RegisterDecryptSuccessHandler(f func(context.Context, *Round, *Team, TeamState) bool) {
	decryptSuccessHandler = f
}

// 这个方法将会在解密失败后执行，可以不设置
//
// (拦截成功后会自动为队伍添加添加失败标记)
//
// 参数为(本轮游戏, 加密队伍, 加密者, 当前状态-DECRYPT)
//
// 如果对方拦截成功则会跳过
var decryptFailHandler func(context.Context, *Round, *Team, TeamState) bool

func RegisterDecryptFailHandler(f func(context.Context, *Round, *Team, TeamState) bool) {
	decryptFailHandler = f
}

// --------------------------- 本轮结束时的一些操作  ---------------------------
var doneHandler func(context.Context, *Round, TeamState) bool

// 参数为(本轮游戏, 当前状态-DONE)
func RegisterDoneHandler(f func(context.Context, *Round, TeamState) bool) {
	doneHandler = f
}

// --------------------------- 当某只队伍赢得比赛时的触发动作  ---------------------------
// 参数为(本局游戏, 获胜队伍)
var gamerOverHandler func(context.Context, *Session, *Team) bool

func RegisterGameOverHandler(f func(context.Context, *Session, *Team) bool) {
	gamerOverHandler = f
}
