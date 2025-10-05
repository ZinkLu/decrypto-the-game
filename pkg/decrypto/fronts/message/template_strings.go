package message

// TemplateString can be directly modified for better experience.
const (
	// HelpTemplate is the template for the help message.
	helpMessageTemplateString = `欢迎来到「谍报战」！

🕹️ 如何开始：
   @ 并邀请 3～7 位好友（总人数必须为 4、6 或 8 人，包含你自己），
   然后在群聊中发送：

   /开始游戏 @好友1 @好友2 @好友3 ... @{{.BotName}}

📝 示例：
   /开始游戏 @小红 @小明 @小李 @{{.BotName}}
   （你 + 3 位好友 = 4 人，符合规则）

⚠️ 注意：
   • 仅支持 4️⃣、6️⃣ 或 8️⃣ 名玩家（必须为偶数且 ≥4）
   • 所有玩家需在同一群聊中参与`

	// GameNameTemplate is the template for the game name.
	gameNameMessageTemplateString = `{{.Emoji}} 谍报战 - {{.hostName}} 的房间`

	// GameStartTemplate is the template for the game start message.
	gameStartMessageTemplateString = `🔐「谍报战」游戏开始！

🔵 蓝队：{{.BlueTeam}}
🔴 红队：{{.RedTeam}}

📌 接下来：每位玩家将收到 4 个秘密关键词，请妥善保管！
`

	// GameEndTemplate is the template for the game end message.
	gameEndMessageTemplateString = `🏁 游戏结束！🏁
🙏 感谢所有玩家的精彩对决！
🔐 期待下次密码攻防战！`

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
	encryptSuccessMessageTemplateString = `📡 第{{.Round}}轮线索已发送！
1️⃣ {{.Word1}}
2️⃣ {{.Word2}}
3️⃣ {{.Word3}}

👀 对手先进行拦截！队友再进行解密！🔐`

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
	readyToEncryptMessageTemplateString = `🔐 第{{.Round}}轮 - 你的出题任务

🎯 需暗示的编号序列：{{.Digits}}

🔤 你的关键词：
1: {{.Word1}}
2: {{.Word2}}
3: {{.Word3}}
4: {{.Word4}}

📝 提交格式：
在游戏频道发送：
@{{.BotName}} [线索1] [线索2] [线索3]

✅ 示例：
@{{.BotName}} 红色 飞行 黑夜

⏰ 请注意您的思考时间！`

	// ReplyWrongDigitsFormatTemplate is the template for wrong digits format message.
	replyWrongDigitsFormatMessageTemplateString = `🔢 数字格式有误！重试一次！
📋 请使用三个 1-4 的数字，并用空格分隔。
✅ 示例：1 2 3 或 2 4 1`

	// ReplyWrongWordsFormatTemplate is the template for wrong words format message.
	replyWrongWordsFormatMessageTemplateString = `📝 词语格式有误！请重试！
🔤 需要三个词，并用空格分隔。
✅ 示例：猫 狗 鸟`

	// StartDecryptTemplate is the template for start decrypt message.
	startDecryptMessageTemplateString = `👀 拦截机会！

{{.Team}}，请尝试解密队友的密码！

📡 我方线索：
{{.Word1}}  {{.Word2}}  {{.Word3}}

☝️ 讨论后，任一队员在游戏频道发送：
@{{.BotName}} [数字1] [数字2] [数字3]

✅ 示例：@{{.BotName}} 2 1 3
（数字范围：1-4，顺序对应线索顺序）

⏰ 请注意你的思考时间！`

	// StartEncryptTemplate is the template for start encrypt message.
	startEncryptMessageTemplateString = `{{.Player}} 本轮加密
➡️ 请私信我并输出 <{{.SecretCodeCommand}}> 来获取本轮密码
`

	// StartInterceptTemplate is the template for start intercept message.
	startInterceptTemplateString = `👀 拦截阶段 - 第{{.Round}}轮

{{.Team}}，请猜测刚才线索对应的编号序列。

📡 对方线索：
{{.Word1}}  {{.Word2}}  {{.Word3}}

💬 讨论后，任一队员在游戏频道发送：
@{{.BotName}} [数字1] [数字2] [数字3]

✅ 示例：@{{.BotName}} 2 1 3
（数字范围：1-4，顺序对应线索顺序）

⏰ 请注意你的思考时间！`

	//teamStatusMessageTemplateString
	teamStatusMessageTemplateString = `📖 内部情报更新！
你的` + PLAIN_WORDS + `清单:
{{range .Words}}
{{GetEmojiDigits .Index}} {{.Value}}
{{end}}
🎯 成功拦截：{{.InterceptedCounts}} 次！
🔍 解密失败：{{.DecryptWrongCounts}} 次`

	// GameRoundInfo
	gameRoundInfoMessageTemplateString = `🔄 第 {{.NumberOfRounds}} 轮
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
