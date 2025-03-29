package message

// TemplateString can be directly modified for better experience.
const (
	// HelpTemplate is the template for the help message.
	helpMessageTemplateString = `🎭 欢迎来到「谍报风云」！
✨ 🕹️ 开始游戏：需要至少 3 位玩家，输入 "开始游戏" 即可。
🔢 示例：'@小红 @小明 @{{.BotName}} /开始游戏'
⚠️ 注意：游戏支持 4️⃣, 6️⃣ 或 8️⃣ 名玩家（包含你）`

	// GameNameTemplate is the template for the game name.
	gameNameMessageTemplateString = `⚔️ {{.Team1}} VS {{.Team2}} 谁是谍中之王? 👑`

	// GameStartTemplate is the template for the game start message.
	gameStartMessageTemplateString = `🕵️‍♂️ 欢迎进入「谍报风云」！🔥
🔵 蓝队特工：{{.BlueTeam}}
🔴 红队特工：{{.RedTeam}}`

	// GameEndTemplate is the template for the game end message.
	gameEndMessageTemplateString = `🏁 游戏结束！🏁
🙏 感谢所有特工的参与！
🤙 下次再会，继续挑战！`

	// CloseRoomTemplate is the template for closing room message.
	closeRoomMessageTemplateString = `⏳ 10 秒后房间关闭！⏳
🚪 大家的精彩表现！期待下次再聚！`

	// GameRoomsLinkTemplate is the template for game rooms link message.
	gameRoomsLinkMessageTemplateString = `🏠 游戏房间已准备好！
🚪 点击加入：<#{{.RoomID}}>`

	// NoEncryptingMessageTemplate is the template for no encrypting message.
	noEncryptingMessageTemplateString = `⛔ 操作无效 ⛔
🔒 您不是加密者，无法查看机密信息`

	// EncryptSuccessTemplate is the template for successful encryption.
	encryptSuccessMessageTemplateString = `✅ 加密成功！📡
1️⃣ {{.Word1}}
2️⃣ {{.Word2}}
3️⃣ {{.Word3}}
🧠 队友能破解吗？`

	// GameOverTemplate is the template for game over message.
	gameOverMessageTemplateString = `🎊 游戏结束！🎉
🏆 胜利者：{{.Winner}}
🔥 再接再厉，谍王非你莫属！`

	// GeneralWrongPlayerTemplate is the template for wrong player message.
	generalWrongPlayerMessageTemplateString = `⏳ 稍安勿躁 ⏳
🔄 当前轮到 {{.Player}} 操作`

	// MaxRoundReachedTemplate is the template for max round reached message.
	maxRoundReachedMessageTemplateString = `⌛ 轮次用尽，游戏结束！
🎲 双方势均力敌！✨
💪 下次努力突破！
👀 两队可以直接猜对面的机密词语，猜对多者胜出`

	// ReadyToEncryptTemplate is the template for ready to encrypt message.
	readyToEncryptMessageTemplateString = `🔐 加密任务发送！
🎯 加密数字：{{.Digits}}
🔤 对应词语：{{.Words}}
📝 使用指南：
   游戏频道 @{{.BotName}} + 三个提示词
   示例：@{{.BotName}} 词1 词2 词3
   ⏰ 加油，加密大师！`

	// ReplyWrongDigitsFormatTemplate is the template for wrong digits format message.
	replyWrongDigitsFormatMessageTemplateString = `🔢 数字格式有误！重试一次！
📋 请使用三个 1-4 的数字，并用空格分隔。
✅ 示例：1 2 3 或 2 4 1`

	// ReplyWrongWordsFormatTemplate is the template for wrong words format message.
	replyWrongWordsFormatMessageTemplateString = `📝 词语格式有误！请重试！
🔤 需要三个词，并用空格分隔。
✅ 示例：猫 狗 鸟`

	// StartDecryptTemplate is the template for start decrypt message.
	startDecryptMessageTemplateString = `🔓 解密时间到！破解敌方密码！
🎯 {{.Team}} 开始行动!
☝️ 请队员充分讨论后由任意队员发送:
    @{{.BotName}} + 三位数字密码（空格分割）
✅ 示例：@{{.BotName}} 4 1 3`

	// StartEncryptTemplate is the template for start encrypt message.
	startEncryptMessageTemplateString = `
🔐 加密时刻到！{{.Player}}，展现你的智慧！
💡 私信查看秘密指令：
   • {{.Player}} 查看密码：<{{.SecretCode}}>
   • 其他玩家查看词库：<{{.PlainWords}}>`

	// StartInterceptTemplate is the template for start intercept message.
	startInterceptTemplateString = `
🚨 {{.Team}} 开始拦截!
😶 请队员充分讨论后由任意队员发送:
    @{{.BotName}} + 三位数字密码（空格分割）
✅ 示例：@{{.BotName}} 1 3 2`

	//teamStatusMessageTemplateString
	teamStatusMessageTemplateString = `📖 内部情报更新！
你的` + PLAIN_WORDS + `清单:
{{range .Words}}
{{GetEmojiDigits .Index}} {{.Value}}
{{end}}
🎯 成功拦截：{{.InterceptedCounts}} 次！
🔍 解密失败：{{.DecryptWrongCounts}} 次`

	// GameRoundInfo
	gameRoundInfoMessageTempalteString = `🔄 第 {{.NumberOfRounds}} 轮
🧠 加密特工：{{.EncryptPlayer}}
🔐 加密内容：{{.EncryptedMessage}}
🎯 真实密码：{{.SecretDigits}}
🕵️ 拦截密码：{{.InterceptSecret}}
🔑 解密密码：{{.InterceptSecret}}
{{if .IsInterceptSuccess}}
🚀 成功拦截，太棒了！
{{else if not .IsDecryptedCorrect}}
💔 解密失败，很可惜！
{{else}}
✨ 出色发挥！
{{end}}`

	// skip intercept message
	skipInterceptMessageTemplateString = `💨 跳过第一轮拦截阶段`

	// INTERCEPT_SUCCESS_MESSAGE
	interceptSuccessMessageTemplateString = `🛡️ 密码成功拦截，得 1 分，跳过解密阶段！`

	// INTERCEPT_FAIL_MESSAGE
	interceptFailMessageTemplateString = `❌ 拦截失败，友方开始解密`

	// INTERCEPT_DONE_MESSAGE
	interceptDoneMessageTemplateString = `🔍 拦截操作进行中...
👉 猜想的密码：{{.Digit1}} {{.Digit2}} {{.Digit3}}`

	// DECRYPT_DONE_MESSAGE
	decryptDoneMessageTemplateString = `🔑 解密进行中...
✨ 解密密码：{{.Digit1}} {{.Digit2}} {{.Digit3}}`

	// DECRYPT_FAIL_MESSAGE
	decryptFailMessageTemplateString = `😵‍💫 解密失败，扣 1 分，再接再厉！`

	// DECRYPT_SUCCESS_MESSAGE
	decryptSuccessMessageTemplateString = `🎉 解密成功！任务完成！交换攻防！🔄`
)
