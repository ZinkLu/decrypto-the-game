package api

/*
用来表示当前的轮次；

Round 表示一个轮次，它的是一只队伍从加密->拦截->解密的过程。
理论上来说，下一个 Round 应该与上一个 Round 的 CurrentTeam 相互对调
*/
type Round struct {
	gameSession        *Session  // 本局游戏信息
	previousRound      *Round    // 上轮轮次对象
	opponent           *Team     // 对手队伍
	currentTeam        *Team     // 当前正在进行加密的队伍
	state              TeamState // 当前的队伍的回合阶段
	roundN             uint8     // 第几轮
	secret             [3]int    // 本局中，需要传递的密码
	encryptedMessage   [3]string // 本局中，负责加密的人给出的密文
	encryptPlayerIndex uint8     // 本局中，负责加密的人的索引位置
	encryptPlayer      *Player   // 本局中，负责加密的人
	interceptedSecret  [3]int    // 本局中，对手给出的拦截密码
	decryptSecret      [3]int    // 本局中，队友给出的破译密码
}
