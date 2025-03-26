package message

const (
	// HelpTemplate is the template for help message
	helpTemplate = `
💅 解密游戏冲冲冲! ✨🔥
╔═══════════════════════════════╗
 🎮 开新局:                 
 @ 三人起步，发"开始游戏" 就嗨了~ 
							   
 📱 咋玩: '@小红 @小明 @{{.BotName}}      
	 /开始游戏'                 
╚═══════════════════════════════╝

⚠️ 划重点! ⚠️
▶️ 玩家必须是 4️⃣, 6️⃣ 或 8️⃣ 人(带上你)
▶️ 脑细胞ready? 干就完了! 🤙`

	// GameNameTemplate is the template for game name
	gameNameTemplate = "✨ {{.Team1}} VS {{.Team2}} 谁才是GOAT? 👑"

	// GameStartTemplate is the template for game start message
	gameStartTemplate = `
🎮 解密大作战已上线! 🔥
┏━━━━━━━━━━━ LESSGO ━━━━━━━━━━━┓
	
🔵 蓝队卷王: {{.BlueTeam}}
	
🔴 红队带飞: {{.RedTeam}}

┗━━━━━━━━━ 开摆! ━━━━━━━━━━┛`

	// GameEndTemplate is the template for game end message
	gameEndTemplate = `
🏁 game over! 爷青结! 🏁
┌─────────────────────┐
  👑 多谢各位大神!
  🤙 下把见~        
└─────────────────────┘`

	// CloseRoomTemplate is the template for close room message
	closeRoomTemplate = `
⏱️ 10秒清场倒计时! ⏱️
	 _.-._
	| | | |_
	| | | | |    下把接着卷,
	| | | | |    溜啦溜啦~
   _|_|_|_|_|_
  |___________|`

	// GameRoomsLinkTemplate is the template for game rooms link message
	gameRoomsLinkTemplate = `
🏠 游戏房间已就位! 速来!
┏━━━━━━━━━━━━━━━━━┓
  🚪 一键进入:    
  <#{{.RoomID}}>          
┗━━━━━━━━━━━━━━━━━┛`

	// ReadyToEncryptMessageTemplate is the template for ready to encrypt message
	readyToEncryptMessageTemplate = `
🔐 解密.exe已加载 🔐
╔══════════════════════╗
 🎯 你的数字: {{.Digits}}      
 🔤 对应词: {{.Words}}        
╚══════════════════════╝

📢 咋整:
   @我 + 三个提示词
   (比如: @机器人 vibe 浪 卷)
   
   ⏳ 你的秘密短信加载中...`

	// NoEncryptingMessageTemplate is the template for no encrypting message
	noEncryptingMessageTemplate = `
⛔ 没权限嗷 ⛔
┌───────────────────┐
 🔒 这把不是你加密
 🚫 密码信息看不了
└───────────────────┘
等等啦，马上轮到你...`

	// EncryptSuccessTemplate is the template for successful encryption
	encryptSuccessTemplate = `
✅ 加密成功! 这波稳了! ✅
┏━━━━━━━━━━━━━━━━━━━━━┓
  📡 密码已送达:      
					 
  1️⃣ {{.Word1}}      
  2️⃣ {{.Word2}}      
  3️⃣ {{.Word3}}      
┗━━━━━━━━━━━━━━━━━━━━━┛
队友能get到你的点吗? 🧠`

	// GameOverTemplate is the template for game over message
	gameOverTemplate = `
🎊 游戏结束! yyds! 🎉
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
  🏆 赢麻了: {{.Winner}}  
						   
  📊 战报:              
  {{.Details}}             
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
太顶了! 这把C位666! 🔥`

	// GeneralWrongPlayerTemplate is the template for wrong player message
	generalWrongPlayerTemplate = `
⏳ 急啥急! ⏳
┌────────────────────────┐
 🔄 现在是 {{.Player}}  
	在秀操作哦~           
						
 🙏 淡定淡定      
└────────────────────────┘`

	// MaxRoundReachedTemplate is the template for max round reached message
	maxRoundReachedTemplate = `
⌛ 时间到! 游戏结束! ⌛
┏━━━━━━━━━━━━━━━━━━━━━━━━┓
 🎲 平手! 都是人才!
 🔍 互相内卷ing?     
 ✨ 下把继续卷!     
┗━━━━━━━━━━━━━━━━━━━━━━━━┛`

	// ReadyToEncryptTemplate is the template for ready to encrypt message
	readyToEncryptTemplate = `
🔐 加密任务已发送! 收到请回复! 🔐
╔═════════════════════════════╗
 🎯 加密数字: {{.Digits}}    
 🔤 对应词语: {{.Words}}     
╚═════════════════════════════╝

📝 操作指南:
   公共频道 @{{.BotName}} + 三个提示词
   (例: @{{.BotName}} flex 猛 skr)
   
   ⏰ 考验智商的时刻...`

	// ReplyWrongDigitsFormatTemplate is the template for wrong digits format message
	replyWrongDigitsFormatTemplate = `
🔢 数字格式错误! 重来! 🔢
┌────────────────────────────┐
 📋 整三个1-4之间的数字
	空格隔开就好              
							
 ✅ 正确示例:               
	1 2 3                   
	2 4 1                   
└────────────────────────────┘`

	// ReplyWrongWordsFormatTemplate is the template for wrong words format message
	replyWrongWordsFormatTemplate = `
📝 词语格式不对! 重打! 📝
┌────────────────────────────┐
 🔤 三个词 
	(空格隔开)            
							
 ✅ 能这样:               
	vibe 夏天 红色          
	键盘 手机 耳机          
└────────────────────────────┘`

	// StartDecryptTemplate is the template for start decrypt message
	startDecryptTemplate = `
🔓 解密时间到! 破解敌方密码! 🔓
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
 🎯 {{.Player}} 请出手:        
	@{{.BotName}} + 你猜的密码
							 
 ✅ 例: @{{.BotName}} 4 1 3   
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
解对了=赢麻了! 💯`

	// StartEncryptTemplate is the template for start encrypt message
	startEncryptTemplate = `
📠 加密时刻! 展示你的脑洞! 📠
╔════════════════════════════════════╗
 🔐 {{.Player}}，该你表演了!      
╚════════════════════════════════════╝

💡 秘密指令:
   • {{.Player}} 私信我: <{{.SecretCode}}> 查看密码
   
   • 其他玩家私信: <{{.PlainWords}}> 看词库
	 
⏳ 开始计时...靠你了大神! 🔥`

	// StartInterceptTemplate is the template for start intercept message
	startInterceptTemplate = `
🚨 拦截时刻! 猜猜对面密码! 🚨
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
 🎯 {{.Team}} 出击:      
	@{{.BotName}} + 你猜的密码
							 
 ✅ 例: @{{.BotName}} 1 3 2   
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
拦截成功=直接超神! 🤯 搞起!`

	//teamStatusTemplate
	teamStatusTemplate = `📖 内部情报!
你的` + PLAIN_WORDS + `是:
	{{range .Words}}
		{{GetEmojiDigits .Index}} {{.Value}}
	{{end}}

🎯 已成功拦截: {{.InterceptedCounts}} 次!
💥 解密翻车: {{.DecryptWrongCounts}} 次
`

	// GameRoundInfo
	gameRoundInfoTempalte = `🔄 第{{.GetNumberOfRounds()}}轮
🧠 加密大佬:{{.EncryptPlayer().NickName}}
🔐 加密内容:{{.GetEncryptedMessage()}}
🎯 真正密码:{{.GetSecretDigits()}}
🕵️ 拦截密码:{{.GetInterceptSecret()}}
🔍 破译密码:{{.GetInterceptSecret()}}
{{if .IsInterceptSuccess()}}
😎✨ 拦截成功! 🚀💯
{{else if not .IsDecryptedCorrect()}}
🙃💔 接收失败! 💪🔥
{{else}}
👍😄 正常发挥! 💪🌟
{{end}}`

	// skip intercept message
	skipInterceptTemplate = `💨 第一轮跳过拦截阶段`

	// INTERCEPT_SUCCESS_MESSAGE
	interceptSuccessMessage = `🫡 密码已被成功拦截！跳过友方解密！🔥`

	// INTERCEPT_FAIL_MESSAGE
	interceptFailMessage = `✈ 拦截失败！友方开始解密！🧐`

	// INTERCEPT_DONE_MESSAGE
	interceptDoneMessage = `🛑 拦截破译中！
👉 拦截密码：{{.Word1}} {{.Word2}} {{.Word3}}`

	// DECRYPT_DONE_MESSAGE
	decryptDoneMessage = `🔑 消息解密中！
✨ 解密密码：{{.Word1}} {{.Word2}} {{.Word3}}`

	// DECRYPT_FAIL_MESSAGE
	decryptFailMessage = `❌ 密码错误！！解密失败了！😵‍💫 `

	// DECRYPT_SUCCESS_MESSAGE
	decryptSuccessMessage = `🔓 解密成功！有惊无险！🎉`
)
